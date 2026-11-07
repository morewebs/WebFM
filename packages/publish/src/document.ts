/**
 * HTML document wrapper for the static exporter. The renderer returns a page
 * fragment only; the adapter turns it into a self-contained document.
 */

/** Escapes text for HTML text and double-quoted attribute contexts. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Relative path to the shared stylesheet from a route's output depth. */
export function relativeStylesheetHref(depth: number): string {
  const safeDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
  return `${"../".repeat(safeDepth)}styles.css`;
}

export interface PageDocumentOptions {
  title: string;
  /** Relative link to the shared stylesheet, e.g. "../styles.css". */
  stylesheetHref: string;
  /** Google Fonts stylesheet URLs used by the page. */
  fontLinks?: string[];
  /** Rendered page fragment (the `.wfm-page` element). */
  body: string;
}

/** Wraps a rendered fragment in a complete standalone HTML document. */
export function renderPageDocument(options: PageDocumentOptions): string {
  const { title, stylesheetHref, fontLinks = [], body } = options;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    ...fontLinks.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`),
    `<link rel="stylesheet" href="${escapeHtml(stylesheetHref)}">`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
