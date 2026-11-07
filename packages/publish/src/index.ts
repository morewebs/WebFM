/**
 * @webfm/publish — the publish adapter boundary and the static site exporter.
 *
 * Adapters are pure with respect to the project: everything they need arrives
 * through `PublishInput`. The static exporter renders every page through
 * `@webfm/render` in publish mode, copies resolvable assets, and returns a
 * file map plus a zip helper for download.
 */

export { staticAdapter } from "./adapters/static";
export {
  defaultAssetPath,
  normalizeAssetPath,
  publishAssetUrl,
  safeAssetFilename,
  safeAssetId,
} from "./asset-paths";
export {
  escapeHtml,
  type PageDocumentOptions,
  relativeScriptHref,
  relativeStylesheetHref,
  renderPageDocument,
} from "./document";
export {
  getAdapter,
  listAdapters,
  publishWithAdapter,
  registerAdapter,
} from "./registry";
export { normalizeRoute, routeDepth, routeToFilePath, withRouteSuffix } from "./routes";
export * from "./types";
export { zipFiles } from "./zip";
