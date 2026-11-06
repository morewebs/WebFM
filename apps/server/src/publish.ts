import type { AssetResolver, PublishFiles } from "@webfm/publish";
import { createId, type Project } from "@webfm/model";
import { sanitizeFilename } from "./store/file-store";
import type { AssetStore } from "./store/types";

export interface PublishInput {
  projectId: string;
  project: Project;
  adapterId: string;
  options?: Record<string, unknown>;
}

/**
 * Result of a publish run. `files` is the adapter's file map; the HTTP layer
 * persists it below the project's publish directory and builds the zip.
 */
export interface PublishResult {
  artifactId: string;
  entry: string;
  summary: string;
  files: PublishFiles;
}

export interface PublishService {
  publish(input: PublishInput): Promise<PublishResult>;
}

/**
 * Default service: delegates to @webfm/publish and resolves assets through the
 * asset store. The publish package is imported lazily so a stub or a missing
 * implementation does not break the rest of the server (tests inject fakes).
 */
export class DefaultPublishService implements PublishService {
  constructor(private readonly assets: AssetStore) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const { publishWithAdapter } = await import("@webfm/publish");

    const resolver: AssetResolver = {
      resolve: async (assetId) => {
        const asset = await this.assets.getAsset(input.projectId, assetId);
        if (asset === null) return null;
        return {
          path: `assets/${assetId}-${sanitizeFilename(asset.name)}`,
          mimeType: asset.mimeType,
          bytes: asset.bytes,
        };
      },
    };

    const result = await publishWithAdapter({
      adapterId: input.adapterId,
      project: input.project,
      config: input.options ?? input.project.publish?.options ?? {},
      assets: resolver,
    });

    return {
      artifactId: createId("pub"),
      entry: result.entry,
      summary: result.summary,
      files: result.files,
    };
  }
}
