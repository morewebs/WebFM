import type { Asset, Project, ProjectSummary } from "@webfm/model";

/** Project ids and asset ids are restricted to this character set on disk. */
export const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Largest single asset the server accepts: 25 MB. */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

export function isSafeId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id);
}

export interface CreateProjectInput {
  name?: string;
  /** Optional caller-supplied id. Validated against SAFE_ID_PATTERN. */
  id?: string;
}

export interface PutAssetInput {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface AssetData {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
}

export interface ProjectStore {
  /** Summaries for the project browser, newest `updatedAt` first. */
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | null>;
  create(input?: CreateProjectInput): Promise<Project>;
  /**
   * Persists `project`. The server owns `version`: the saved document gets
   * `existing.version + 1`, a fresh `updatedAt`, and keeps `createdAt`.
   * When `expectedVersion` is supplied and does not match the stored version,
   * rejects with `VersionConflictError`.
   */
  save(project: Project, expectedVersion?: number): Promise<Project>;
  /** Removes the project directory. Returns false when it did not exist. */
  delete(id: string): Promise<boolean>;
}

export interface AssetStore {
  putAsset(projectId: string, input: PutAssetInput): Promise<Asset>;
  getAsset(projectId: string, assetId: string): Promise<AssetData | null>;
  /** Absolute path of the stored asset file, or null when it is missing. */
  getAssetPath(projectId: string, assetId: string): Promise<string | null>;
}

export class InvalidIdError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`Invalid id: ${JSON.stringify(id)}`);
    this.name = "InvalidIdError";
    this.id = id;
  }
}

export class ProjectNotFoundError extends Error {
  readonly projectId: string;

  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "ProjectNotFoundError";
    this.projectId = projectId;
  }
}

export class VersionConflictError extends Error {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super(`Version conflict: current version is ${currentVersion}`);
    this.name = "VersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export class AssetTooLargeError extends Error {
  readonly size: number;
  readonly max: number;

  constructor(size: number, max: number) {
    super(`Asset is ${size} bytes; the limit is ${max} bytes`);
    this.name = "AssetTooLargeError";
    this.size = size;
    this.max = max;
  }
}
