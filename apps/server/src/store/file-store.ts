import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId, createProject, type Asset, type Project, type ProjectSummary } from "@webfm/model";
import { mimeFromFilename } from "../mime";
import {
  AssetTooLargeError,
  InvalidIdError,
  MAX_ASSET_BYTES,
  ProjectNotFoundError,
  VersionConflictError,
  isSafeId,
  type AssetData,
  type AssetStore,
  type CreateProjectInput,
  type ProjectStore,
  type PutAssetInput,
} from "./types";

function assertSafeId(id: string): void {
  if (!isSafeId(id)) throw new InvalidIdError(id);
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Turns an arbitrary upload filename into a safe leaf name. The result only
 * ever contains [A-Za-z0-9._-], never starts with a dot or hyphen, and never
 * contains a path separator or "..".
 */
export function sanitizeFilename(filename: string): string {
  const base = path.posix.basename(filename.replace(/\\/g, "/"));
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-_]+/, "")
    .slice(0, 120);
  if (cleaned.length === 0 || cleaned === "." || cleaned === "..") return "file";
  return cleaned;
}

/** Write to a sibling temp file, fsync it, then rename over the target. */
export async function atomicWriteFile(filePath: string, data: string | Uint8Array): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let created = false;
  try {
    const handle = await open(temporary, "w");
    created = true;
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, filePath);
  } catch (error) {
    if (created) {
      await rm(temporary, { force: true }).catch(() => undefined);
    }
    throw error;
  }
}

function toSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    version: project.version,
    pageCount: project.pages.length,
  };
}

/**
 * Filesystem implementation of both stores.
 *
 * Layout:
 *   <dataDir>/projects/<projectId>/project.json
 *   <dataDir>/projects/<projectId>/assets/<assetId>-<safeName>
 *
 * Saves are serialized per project with an in-process promise queue and are
 * written atomically, so a reader never observes a half-written document.
 */
export class FileProjectStore implements ProjectStore, AssetStore {
  readonly dataDir: string;

  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
  }

  private projectsDir(): string {
    return path.join(this.dataDir, "projects");
  }

  private projectDir(id: string): string {
    assertSafeId(id);
    return path.join(this.projectsDir(), id);
  }

  private projectFile(id: string): string {
    return path.join(this.projectDir(id), "project.json");
  }

  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(key, next);
    void next
      .catch(() => undefined)
      .then(() => {
        if (this.queues.get(key) === next) this.queues.delete(key);
      });
    return next;
  }

  private async readProject(id: string): Promise<Project | null> {
    assertSafeId(id);
    let raw: string;
    try {
      raw = await readFile(this.projectFile(id), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return JSON.parse(raw) as Project;
  }

  async list(): Promise<ProjectSummary[]> {
    let entries: string[];
    try {
      entries = await readdir(this.projectsDir());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }

    const summaries = await Promise.all(
      entries
        .filter((entry) => isSafeId(entry))
        .map(async (entry) => {
          try {
            const project = await this.readProject(entry);
            return project === null ? null : toSummary(project);
          } catch {
            // A corrupt or unreadable project must not hide the others.
            return null;
          }
        }),
    );

    return summaries
      .filter((summary): summary is ProjectSummary => summary !== null)
      .sort((a, b) => {
        const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
        if (byUpdated !== 0) return byUpdated;
        const byVersion = b.version - a.version;
        if (byVersion !== 0) return byVersion;
        return a.id.localeCompare(b.id);
      });
  }

  async get(id: string): Promise<Project | null> {
    return this.readProject(id);
  }

  async create(input: CreateProjectInput = {}): Promise<Project> {
    const id = input.id ?? createId("proj");
    assertSafeId(id);
    const project = createProject({
      id,
      ...(input.name === undefined ? {} : { name: input.name }),
    });
    await atomicWriteFile(this.projectFile(id), `${JSON.stringify(project, null, 2)}\n`);
    return project;
  }

  async save(project: Project, expectedVersion?: number): Promise<Project> {
    const id = project.id;
    assertSafeId(id);

    return this.enqueue(id, async () => {
      const existing = await this.readProject(id);
      if (existing === null) throw new ProjectNotFoundError(id);
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        throw new VersionConflictError(existing.version);
      }

      const next: Project = {
        ...project,
        id,
        version: existing.version + 1,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await atomicWriteFile(this.projectFile(id), `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }

  async delete(id: string): Promise<boolean> {
    const directory = this.projectDir(id);
    try {
      await stat(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    await rm(directory, { recursive: true, force: true });
    return true;
  }

  async putAsset(projectId: string, input: PutAssetInput): Promise<Asset> {
    const project = await this.readProject(projectId);
    if (project === null) throw new ProjectNotFoundError(projectId);
    if (input.bytes.byteLength > MAX_ASSET_BYTES) {
      throw new AssetTooLargeError(input.bytes.byteLength, MAX_ASSET_BYTES);
    }

    const safeName = sanitizeFilename(input.filename);
    const assetId = createId("asset");
    const assetsDir = path.join(this.projectDir(projectId), "assets");
    const storedPath = path.join(assetsDir, `${assetId}-${safeName}`);
    if (!isInside(assetsDir, storedPath)) throw new InvalidIdError(assetId);

    await mkdir(assetsDir, { recursive: true });
    await writeFile(storedPath, input.bytes);

    return {
      id: assetId,
      name: safeName,
      mimeType: input.mimeType || mimeFromFilename(safeName),
      size: input.bytes.byteLength,
      url: `/api/projects/${projectId}/assets/${assetId}`,
      createdAt: new Date().toISOString(),
    };
  }

  async getAssetPath(projectId: string, assetId: string): Promise<string | null> {
    assertSafeId(assetId);
    const assetsDir = path.join(this.projectDir(projectId), "assets");
    let entries: string[];
    try {
      entries = await readdir(assetsDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }

    const prefix = `${assetId}-`;
    const entry = entries.find((candidate) => candidate.startsWith(prefix));
    if (entry === undefined) return null;

    const resolved = path.resolve(assetsDir, entry);
    return isInside(assetsDir, resolved) ? resolved : null;
  }

  async getAsset(projectId: string, assetId: string): Promise<AssetData | null> {
    const filePath = await this.getAssetPath(projectId, assetId);
    if (filePath === null) return null;

    let project: Project | null;
    try {
      project = await this.readProject(projectId);
    } catch {
      project = null;
    }
    const metadata = project?.assets.find((asset) => asset.id === assetId);

    const bytes = await readFile(filePath);
    const fallbackName = path.basename(filePath).slice(assetId.length + 1);
    return {
      bytes,
      mimeType: metadata?.mimeType ?? mimeFromFilename(fallbackName),
      name: metadata?.name ?? fallbackName,
    };
  }
}
