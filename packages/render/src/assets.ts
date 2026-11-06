import type { Project } from "@webfm/model";
import type { AssetUrlResolver } from "./styles";
import type { RenderOptions } from "./types";

/**
 * Builds the asset id -> URL resolver for a render pass. `options.assetUrl`
 * lets the editor or publisher rewrite URLs (for example to a server endpoint);
 * without it the asset record's own URL is used.
 */
export function createAssetUrlResolver(project: Project, options: RenderOptions): AssetUrlResolver {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  return (assetId) => {
    const asset = assets.get(assetId);
    if (!asset) return null;
    return options.assetUrl ? options.assetUrl(asset) : asset.url;
  };
}
