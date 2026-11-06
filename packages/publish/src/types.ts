import type { Project } from "@webfm/model";

export type PublishFile = string | Uint8Array;
export type PublishFiles = Record<string, PublishFile>;

export interface AssetPayload {
  /** Filename used inside the published output, e.g. "assets/abc-logo.png". */
  path: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface AssetResolver {
  resolve(assetId: string): Promise<AssetPayload | null>;
}

export interface PublishInput<Config = Record<string, unknown>> {
  project: Project;
  config: Config;
  assets: AssetResolver;
  outDir?: string;
}

export interface PublishResult {
  files: PublishFiles;
  summary: string;
  /** Entry path, usually "index.html". */
  entry: string;
}

export interface PublishAdapter<Config = Record<string, unknown>> {
  id: string;
  name: string;
  publish(input: PublishInput<Config>): Promise<PublishResult>;
}

export interface PublishAdapterInfo {
  id: string;
  name: string;
}

export interface PublishRequest {
  adapterId: string;
  project: Project;
  config?: Record<string, unknown>;
  assets: AssetResolver;
  outDir?: string;
}
