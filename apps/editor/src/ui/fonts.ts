/**
 * Editor-side Google Fonts loading.
 *
 * The canvas and Preview render real text, so a Google family must be present
 * as a stylesheet in the editor document. Links are injected on demand and
 * never duplicated; system families need no work.
 */

import type { Project } from "@webfm/model";
import { collectProjectFonts, googleFontHref, isGoogleFont } from "@webfm/render";

/** CSS attribute-selector escaping for a family name. */
function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Injects a Google Fonts stylesheet for `family` once. Unknown and system
 * families are ignored, and DOM failures never break the editor.
 */
export function ensureFontLoaded(family: string): void {
  if (!isGoogleFont(family)) return;
  if (typeof document === "undefined") return;

  const key = family.trim();
  try {
    const selector = `link[data-wfm-font="${escapeAttribute(key)}"]`;
    if (document.head.querySelector(selector)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = googleFontHref(key);
    link.dataset.wfmFont = key;
    document.head.appendChild(link);
  } catch {
    // A blocked or unavailable head must not prevent editing.
  }
}

/** Loads every Google family used by the project. */
export function ensureProjectFonts(project: Project): void {
  for (const family of collectProjectFonts(project)) ensureFontLoaded(family);
}
