/**
 * Typed HTTP client for the WebFM server.
 *
 * The base URL is empty so the editor always talks to its own origin; Vite
 * proxies `/api` to the local server during development and the server serves
 * the built editor in production. Every failure surfaces as an `ApiError` that
 * carries the HTTP status and the parsed response body.
 */

import type { Asset, Project, ProjectSummary } from "@webfm/model";

export interface HealthResponse {
  ok: boolean;
  name: string;
  version: string;
}

/** Publish result as returned by the server (files are a manifest, not bytes). */
export interface PublishResponse {
  /** Relative paths of the written artifact files. */
  files?: string[];
  entry?: string;
  summary?: string;
  zipUrl?: string;
  artifactId?: string;
  [key: string]: unknown;
}

/**
 * The upload endpoint returns the asset and the updated project (the asset is
 * already persisted on it and the project version has advanced).
 */
export interface UploadAssetResponse {
  asset: Asset;
  project: Project | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? defaultMessage(status, body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultMessage(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim().length > 0) return body;
  if (isRecord(body)) {
    const message = body.message ?? body.error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  if (status === 0) return "Network request failed.";
  return `Request failed with status ${status}.`;
}

function unwrapProject(value: unknown): Project {
  if (isRecord(value) && isRecord(value.project)) return value.project as unknown as Project;
  return value as Project;
}

function unwrapAsset(value: unknown): Asset {
  if (isRecord(value) && isRecord(value.asset)) return value.asset as unknown as Asset;
  return value as Asset;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export interface ApiClientOptions {
  /** Defaults to an empty string (same origin). */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 15 seconds. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** The subset of the server API the editor depends on. */
export interface ProjectApi {
  health(): Promise<HealthResponse>;
  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string): Promise<Project>;
  getProject(id: string): Promise<Project>;
  saveProject(id: string, project: Project, expectedVersion: number): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  uploadAsset(id: string, file: File | Blob): Promise<UploadAssetResponse>;
  publish(
    id: string,
    adapterId: string,
    options?: Record<string, unknown>,
  ): Promise<PublishResponse>;
}

export class ApiClient implements ProjectApi {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.url(path), {
        credentials: "same-origin",
        ...init,
        signal: controller.signal,
      });
      const body = await readBody(response);
      if (!response.ok) {
        throw new ApiError(response.status, body, defaultMessage(response.status, body));
      }
      return body as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError(
          0,
          null,
          `Request to ${path} timed out after ${this.timeoutMs} ms.`,
        );
      }
      throw new ApiError(0, null, error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/api/health");
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const body = await this.request<ProjectSummary[] | { projects: ProjectSummary[] }>(
      "/api/projects",
    );
    if (Array.isArray(body)) return body;
    return body.projects;
  }

  async createProject(name: string): Promise<Project> {
    const body = await this.request<unknown>("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return unwrapProject(body);
  }

  async getProject(id: string): Promise<Project> {
    const body = await this.request<unknown>(`/api/projects/${encodeURIComponent(id)}`);
    return unwrapProject(body);
  }

  async saveProject(id: string, project: Project, expectedVersion: number): Promise<Project> {
    const body = await this.request<unknown>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, expectedVersion }),
    });
    return unwrapProject(body);
  }

  async deleteProject(id: string): Promise<void> {
    await this.request<unknown>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async uploadAsset(id: string, file: File | Blob): Promise<UploadAssetResponse> {
    const form = new FormData();
    const named = file as File;
    const filename = typeof named.name === "string" && named.name.length > 0 ? named.name : "upload";
    form.append("file", file, filename);
    const body = await this.request<unknown>(
      `/api/projects/${encodeURIComponent(id)}/assets`,
      { method: "POST", body: form },
    );
    if (isRecord(body) && isRecord(body.asset)) {
      return {
        asset: body.asset as unknown as Asset,
        project: isRecord(body.project) ? (body.project as unknown as Project) : null,
      };
    }
    return { asset: unwrapAsset(body), project: null };
  }

  async publish(
    id: string,
    adapterId: string,
    options: Record<string, unknown> = {},
  ): Promise<PublishResponse> {
    return this.request<PublishResponse>(`/api/projects/${encodeURIComponent(id)}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adapterId, options }),
    });
  }
}

export function createApiClient(options: ApiClientOptions = {}): ProjectApi {
  return new ApiClient(options);
}

export const api: ProjectApi = createApiClient();
