/**
 * Page route -> output file mapping for the static exporter.
 *
 * Routes are always web paths ("/" is the site root). The output is a flat
 * directory of files, so "/" becomes "index.html" and every other route
 * becomes "<route>/index.html". Anything that could escape the output
 * directory is rejected rather than silently rewritten.
 */

const WINDOWS_DRIVE = /^[A-Za-z]:/;
const WINDOWS_UNC = /^\\\\/;

/**
 * Normalizes a page route into zero or more safe path segments.
 *
 * Duplicate and trailing slashes and "." segments are dropped. Parent
 * segments (".."), NUL bytes, Windows drive paths and UNC paths are rejected
 * because they must never reach a filesystem or an archive entry.
 */
export function normalizeRoute(path: string): string {
  if (typeof path !== "string") {
    throw new Error("Unsafe page route: expected a string.");
  }

  const value = path.trim();
  if (value === "") return "";

  if (WINDOWS_DRIVE.test(value) || WINDOWS_UNC.test(value)) {
    throw new Error(`Unsafe page route: ${JSON.stringify(path)} is an absolute filesystem path.`);
  }

  const segments: string[] = [];
  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." || segment.includes("\0")) {
      throw new Error(`Unsafe page route: ${JSON.stringify(path)} escapes the output directory.`);
    }
    segments.push(segment);
  }

  return segments.join("/");
}

/** Number of directory levels below the output root, used for relative links. */
export function routeDepth(path: string): number {
  const route = normalizeRoute(path);
  return route === "" ? 0 : route.split("/").length;
}

/**
 * Maps a route to its output file:
 *   "/"      -> "index.html"
 *   "/about" -> "about/index.html"
 *   "/a/b"   -> "a/b/index.html"
 */
export function routeToFilePath(path: string): string {
  const route = normalizeRoute(path);
  return route === "" ? "index.html" : `${route}/index.html`;
}

/** Adds a numeric collision suffix ("about/index.html" -> "about-2/index.html"). */
export function withRouteSuffix(filePath: string, suffix: number): string {
  if (filePath === "index.html") return `index-${suffix}.html`;

  if (filePath.endsWith("/index.html")) {
    return `${filePath.slice(0, -"/index.html".length)}-${suffix}/index.html`;
  }

  const slash = filePath.lastIndexOf("/");
  const directory = slash === -1 ? "" : filePath.slice(0, slash + 1);
  const base = slash === -1 ? filePath : filePath.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return `${directory}${base}-${suffix}`;
  return `${directory}${base.slice(0, dot)}-${suffix}${base.slice(dot)}`;
}
