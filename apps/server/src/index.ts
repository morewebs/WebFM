import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import type { Project } from "@webfm/model";
import { readStoredFiles, writeArtifactFiles, writeArtifactZip, ZIP_FILE_NAME } from "./artifact";
import { LocalAuthProvider, type AuthProvider } from "./auth";
import { mimeFromFilename } from "./mime";
import { DefaultPublishService, type PublishService } from "./publish";
import { FileProjectStore } from "./store/file-store";
import {
  AssetTooLargeError,
  InvalidIdError,
  MAX_ASSET_BYTES,
  ProjectNotFoundError,
  VersionConflictError,
  isSafeId,
} from "./store/types";

export interface ServerOptions {
  /** Root for project documents, assets and publish artifacts. */
  dataDir?: string;
  logger?: boolean;
  auth?: AuthProvider;
  publishService?: PublishService;
  /** Directory containing the built editor (index.html + assets). */
  editorDistDir?: string;
}

const SERVER_NAME = "WebFM";
const SERVER_VERSION = "0.1.0";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_EDITOR_DIST = path.resolve(moduleDir, "../../editor/dist");

function defaultDataDir(): string {
  return path.resolve(process.env.WEBFM_DATA_DIR ?? path.join(process.cwd(), ".webfm-data"));
}

function sendInvalidId(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof InvalidIdError) {
    void reply.code(400).send({ error: "invalid_id" });
    return true;
  }
  return false;
}

/**
 * Builds the Fastify application. Kept synchronous so tests and embedders can
 * call buildServer() and then await app.ready()/app.inject().
 */
export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const dataDir = path.resolve(options.dataDir ?? defaultDataDir());
  const editorDistDir = path.resolve(options.editorDistDir ?? DEFAULT_EDITOR_DIST);
  const store = new FileProjectStore(dataDir);
  const auth = options.auth ?? new LocalAuthProvider();
  const publishService = options.publishService ?? new DefaultPublishService(store);

  const app = Fastify({ logger: options.logger ?? false });

  app.decorateRequest("user", null);
  app.addHook("onRequest", async (request) => {
    request.user = await auth.authenticate(request);
  });

  void app.register(fastifyMultipart, {
    limits: {
      fileSize: MAX_ASSET_BYTES,
      files: 1,
      parts: 10,
    },
  });

  /* ------------------------------------------------------------------ health */

  app.get("/api/health", async () => ({
    ok: true,
    name: SERVER_NAME,
    version: SERVER_VERSION,
  }));

  /* ---------------------------------------------------------------- projects */

  app.get("/api/projects", async () => store.list());

  app.post<{ Body: { name?: unknown } }>("/api/projects", async (request, reply) => {
    const body: unknown = request.body;
    const name =
      body !== null && typeof body === "object" && typeof (body as { name?: unknown }).name === "string"
        ? (body as { name: string }).name
        : undefined;
    const project = await store.create(name === undefined ? {} : { name });
    return reply.code(201).send(project);
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    let project: Project | null;
    try {
      project = await store.get(request.params.id);
    } catch (error) {
      if (sendInvalidId(reply, error)) return reply;
      throw error;
    }
    if (project === null) return reply.code(404).send({ error: "not_found" });
    return project;
  });

  app.put<{ Params: { id: string }; Body: { project?: unknown; expectedVersion?: unknown } }>(
    "/api/projects/:id",
    async (request, reply) => {
      const body = request.body;
      if (body === null || typeof body !== "object") {
        return reply.code(400).send({ error: "invalid_body" });
      }
      const bodyProject: unknown = body.project;
      if (bodyProject === null || typeof bodyProject !== "object") {
        return reply.code(400).send({ error: "invalid_project" });
      }

      const project = bodyProject as Project;
      if (project.id !== request.params.id) {
        return reply.code(400).send({ error: "id_mismatch" });
      }
      if (body.expectedVersion !== undefined && typeof body.expectedVersion !== "number") {
        return reply.code(400).send({ error: "invalid_expected_version" });
      }
      const expectedVersion =
        typeof body.expectedVersion === "number" ? body.expectedVersion : project.version;

      try {
        const saved = await store.save(project, expectedVersion);
        return saved;
      } catch (error) {
        if (sendInvalidId(reply, error)) return reply;
        if (error instanceof VersionConflictError) {
          return reply.code(409).send({
            error: "version_conflict",
            currentVersion: error.currentVersion,
          });
        }
        if (error instanceof ProjectNotFoundError) {
          return reply.code(404).send({ error: "not_found" });
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    try {
      const removed = await store.delete(request.params.id);
      if (!removed) return reply.code(404).send({ error: "not_found" });
      return reply.code(204).send();
    } catch (error) {
      if (sendInvalidId(reply, error)) return reply;
      throw error;
    }
  });

  /* ------------------------------------------------------------------ assets */

  app.post<{ Params: { id: string } }>("/api/projects/:id/assets", async (request, reply) => {
    const projectId = request.params.id;

    let project: Project | null;
    try {
      project = await store.get(projectId);
    } catch (error) {
      if (sendInvalidId(reply, error)) return reply;
      throw error;
    }
    if (project === null) return reply.code(404).send({ error: "not_found" });

    if (!request.isMultipart()) {
      return reply.code(415).send({ error: "multipart_required" });
    }

    try {
      const part = await request.file();
      if (part === undefined) {
        return reply.code(400).send({ error: "file_required" });
      }
      if (part.fieldname !== "file") {
        return reply.code(400).send({ error: "file_field_required" });
      }

      const filename = part.filename ?? "file";
      const bytes = await part.toBuffer();
      if (bytes.byteLength > MAX_ASSET_BYTES) {
        return reply.code(413).send({ error: "file_too_large", maxBytes: MAX_ASSET_BYTES });
      }

      const asset = await store.putAsset(projectId, {
        filename,
        mimeType: part.mimetype || mimeFromFilename(filename),
        bytes,
      });
      const saved = await store.save(
        { ...project, assets: [...project.assets, asset] },
        project.version,
      );
      return { asset, project: saved };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_FILES_LIMIT" || code === "FST_PARTS_LIMIT") {
        return reply.code(413).send({ error: "file_too_large", maxBytes: MAX_ASSET_BYTES });
      }
      if (sendInvalidId(reply, error)) return reply;
      if (error instanceof AssetTooLargeError) {
        return reply.code(413).send({ error: "file_too_large", maxBytes: error.max });
      }
      if (error instanceof VersionConflictError) {
        return reply.code(409).send({
          error: "version_conflict",
          currentVersion: error.currentVersion,
        });
      }
      if (error instanceof ProjectNotFoundError) {
        return reply.code(404).send({ error: "not_found" });
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string; assetId: string } }>(
    "/api/projects/:id/assets/:assetId",
    async (request, reply) => {
      try {
        const asset = await store.getAsset(request.params.id, request.params.assetId);
        if (asset === null) return reply.code(404).send({ error: "not_found" });
        return reply
          .header("Content-Type", asset.mimeType)
          .header("Cache-Control", "public, max-age=31536000, immutable")
          .send(Buffer.from(asset.bytes));
      } catch (error) {
        if (sendInvalidId(reply, error)) return reply;
        throw error;
      }
    },
  );

  /* ----------------------------------------------------------------- publish */

  const publishDir = (projectId: string, artifactId: string): string =>
    path.join(dataDir, "projects", projectId, "publish", artifactId);

  app.post<{ Params: { id: string }; Body: { adapterId?: unknown; options?: unknown } }>(
    "/api/projects/:id/publish",
    async (request, reply) => {
      const projectId = request.params.id;

      let project: Project | null;
      try {
        project = await store.get(projectId);
      } catch (error) {
        if (sendInvalidId(reply, error)) return reply;
        throw error;
      }
      if (project === null) return reply.code(404).send({ error: "not_found" });

      const body: unknown = request.body;
      const rawAdapterId =
        body !== null && typeof body === "object" ? (body as { adapterId?: unknown }).adapterId : undefined;
      const adapterId =
        typeof rawAdapterId === "string" && rawAdapterId.length > 0
          ? rawAdapterId
          : project.publish?.adapterId;
      if (adapterId === undefined || adapterId.length === 0) {
        return reply.code(400).send({ error: "adapter_required" });
      }

      const rawOptions =
        body !== null && typeof body === "object" ? (body as { options?: unknown }).options : undefined;
      const options =
        rawOptions !== null && typeof rawOptions === "object"
          ? (rawOptions as Record<string, unknown>)
          : undefined;

      const result = await publishService.publish({
        projectId,
        project,
        adapterId,
        ...(options === undefined ? {} : { options }),
      });

      if (!isSafeId(result.artifactId)) {
        return reply.code(500).send({ error: "invalid_artifact_id" });
      }

      const outDir = publishDir(projectId, result.artifactId);
      const files = await writeArtifactFiles(outDir, result.files);
      await writeArtifactZip(outDir, result.files);

      return {
        artifactId: result.artifactId,
        entry: result.entry,
        summary: result.summary,
        files,
        zipUrl: `/api/projects/${projectId}/publish/${result.artifactId}/zip`,
      };
    },
  );

  app.get<{ Params: { id: string; artifactId: string } }>(
    "/api/projects/:id/publish/:artifactId/zip",
    async (request, reply) => {
      const { id, artifactId } = request.params;
      if (!isSafeId(id) || !isSafeId(artifactId)) {
        return reply.code(404).send({ error: "not_found" });
      }

      const outDir = publishDir(id, artifactId);
      const zipPath = path.join(outDir, ZIP_FILE_NAME);

      let zipExists = false;
      try {
        zipExists = (await stat(zipPath)).isFile();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      if (!zipExists) {
        let stored = null;
        try {
          stored = await readStoredFiles(outDir);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (stored === null || Object.keys(stored).length === 0) {
          return reply.code(404).send({ error: "not_found" });
        }
        await writeArtifactZip(outDir, stored);
      }

      const zip = await readFile(zipPath);
      return reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename="${artifactId}.zip"`)
        .send(zip);
    },
  );

  /* ------------------------------------------------------------- editor build */

  const editorIndex = path.join(editorDistDir, "index.html");
  const hasEditorBuild = existsSync(editorIndex);

  if (hasEditorBuild) {
    void app.register(fastifyStatic, {
      root: editorDistDir,
      prefix: "/",
      wildcard: true,
      index: ["index.html"],
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    const rawUrl = request.raw.url ?? "/";
    const pathname = rawUrl.split("?")[0] ?? "/";
    const isRead = request.method === "GET" || request.method === "HEAD";
    if (hasEditorBuild && isRead && !pathname.startsWith("/api")) {
      const html = await readFile(editorIndex);
      return reply.header("Content-Type", "text/html; charset=utf-8").send(html);
    }
    return reply.code(404).send({ error: "not_found" });
  });

  return app;
}

async function start(): Promise<void> {
  const app = buildServer({ logger: true });
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
const isEntry = entry !== undefined && import.meta.url === pathToFileURL(entry).href;
if (isEntry) {
  void start();
}

export { FileProjectStore } from "./store/file-store";
export {
  AssetTooLargeError,
  InvalidIdError,
  MAX_ASSET_BYTES,
  ProjectNotFoundError,
  VersionConflictError,
} from "./store/types";
export type { AssetStore, ProjectStore } from "./store/types";
export type { AuthProvider, AuthUser } from "./auth";
export type { PublishInput, PublishResult, PublishService } from "./publish";
