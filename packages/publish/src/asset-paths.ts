/**
 * Asset path helpers for the static exporter.
 *
 * Asset payloads arrive from the server with a suggested output path. The
 * exporter accepts it only when it is a safe relative path; otherwise it falls
 * back to "assets/<assetId>-<safe name>".
 */

const MAX_FILENAME_LENGTH = 120;

/** A safe file basename derived from an asset name. */
export function safeAssetFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-_]+/, "")
    .slice(0, MAX_FILENAME_LENGTH);

  if (cleaned.length === 0 || cleaned === "." || cleaned === "..") return "file";
  return cleaned;
}

/** A safe path segment for an asset id. */
export function safeAssetId(assetId: string): string {
  const cleaned = assetId
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_FILENAME_LENGTH);
  return cleaned.length === 0 ? "asset" : cleaned;
}

/** The default published path for an asset. */
export function defaultAssetPath(assetId: string, name: string): string {
  return `assets/${safeAssetId(assetId)}-${safeAssetFilename(name)}`;
}

/**
 * Normalizes a suggested output path into a safe relative path, or returns
 * null when the path is empty, absolute or escapes the output directory.
 */
export function normalizeAssetPath(path: string): string | null {
  if (typeof path !== "string") return null;

  const value = path.trim();
  if (value === "") return null;
  if (/^[A-Za-z]:/.test(value) || value.startsWith("\\\\")) return null;

  const segments = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".");

  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (segment === ".." || segment.includes("\0")) return null;
  }

  return segments.join("/");
}

/** Published URL for a path, always rooted at the site origin. */
export function publishAssetUrl(path: string): string | null {
  const normalized = normalizeAssetPath(path);
  return normalized === null ? null : `/${normalized}`;
}
