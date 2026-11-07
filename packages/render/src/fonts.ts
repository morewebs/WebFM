/**
 * Font catalog and Google Fonts helpers.
 *
 * The catalog is deliberately curated: every entry is a font a designer
 * expects to find in Framer's picker. Google families are loaded on demand
 * through a stylesheet link, both in the editor and in published documents;
 * system families always resolve through the visitor's operating system.
 */

import { type Project, type SceneNode, walkNode } from "@webfm/model";

export type FontCategory = "sans" | "serif" | "display" | "handwriting" | "mono" | "system";

export interface FontOption {
  family: string;
  category: FontCategory;
  /** True when the family is served by Google Fonts. */
  google: boolean;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  /* Google — sans serif */
  { family: "Inter", category: "sans", google: true },
  { family: "Roboto", category: "sans", google: true },
  { family: "Open Sans", category: "sans", google: true },
  { family: "Lato", category: "sans", google: true },
  { family: "Montserrat", category: "sans", google: true },
  { family: "Poppins", category: "sans", google: true },
  { family: "Source Sans 3", category: "sans", google: true },
  { family: "Nunito", category: "sans", google: true },
  { family: "Raleway", category: "sans", google: true },
  { family: "Work Sans", category: "sans", google: true },
  { family: "DM Sans", category: "sans", google: true },
  { family: "Manrope", category: "sans", google: true },
  { family: "Space Grotesk", category: "sans", google: true },
  { family: "IBM Plex Sans", category: "sans", google: true },
  { family: "Plus Jakarta Sans", category: "sans", google: true },
  { family: "Figtree", category: "sans", google: true },
  { family: "Outfit", category: "sans", google: true },
  { family: "Sora", category: "sans", google: true },
  { family: "Urbanist", category: "sans", google: true },
  { family: "Karla", category: "sans", google: true },
  { family: "Rubik", category: "sans", google: true },
  { family: "Quicksand", category: "sans", google: true },
  { family: "Barlow", category: "sans", google: true },

  /* Google — serif and display */
  { family: "Playfair Display", category: "serif", google: true },
  { family: "Merriweather", category: "serif", google: true },
  { family: "Lora", category: "serif", google: true },
  { family: "Libre Baskerville", category: "serif", google: true },
  { family: "Crimson Text", category: "serif", google: true },
  { family: "DM Serif Display", category: "display", google: true },
  { family: "Oswald", category: "display", google: true },

  /* Google — handwriting */
  { family: "Caveat", category: "handwriting", google: true },
  { family: "Pacifico", category: "handwriting", google: true },

  /* Google — monospace */
  { family: "JetBrains Mono", category: "mono", google: true },
  { family: "IBM Plex Mono", category: "mono", google: true },
  { family: "Space Mono", category: "mono", google: true },
  { family: "Fira Code", category: "mono", google: true },

  /* System families */
  { family: "Arial", category: "system", google: false },
  { family: "Georgia", category: "system", google: false },
  { family: "Times New Roman", category: "system", google: false },
  { family: "Courier New", category: "system", google: false },
];

/** Canonical catalog spellings, keyed by lowercased family name. */
const CANONICAL_FAMILIES = new Map<string, FontOption>(
  FONT_OPTIONS.map((option) => [option.family.toLowerCase(), option]),
);

/** Google family names, lowercased, for fast membership checks. */
const GOOGLE_FAMILIES = new Set(
  FONT_OPTIONS.filter((option) => option.google).map((option) => option.family.toLowerCase()),
);

/**
 * Stylesheet URL for one Google font. Spaces become `+` in the `family`
 * parameter, matching the Google Fonts CSS API.
 */
export function googleFontHref(family: string): string {
  const encoded = encodeURIComponent(family.trim()).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
}

/** True only for catalog entries served by Google Fonts. */
export function isGoogleFont(family: string): boolean {
  return GOOGLE_FAMILIES.has(family.trim().toLowerCase());
}

/** Canonical catalog spelling, or the trimmed input when it is unknown. */
function canonicalFamily(family: string): string {
  const trimmed = family.trim();
  return CANONICAL_FAMILIES.get(trimmed.toLowerCase())?.family ?? trimmed;
}

/**
 * Every Google font used by text nodes in the project, in first-seen order.
 *
 * Scans each page and every variant of every component. Only the base text
 * properties are read: text styles and per-breakpoint overrides that change
 * the family are not linked yet.
 */
export function collectProjectFonts(project: Project): string[] {
  const families: string[] = [];
  const seen = new Set<string>();

  const scan = (root: SceneNode): void => {
    walkNode(root, (node) => {
      if (node.type !== "text") return;
      const family = node.responsive.base.text.fontFamily;
      if (!isGoogleFont(family)) return;
      const canonical = canonicalFamily(family);
      const key = canonical.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      families.push(canonical);
    });
  };

  for (const page of project.pages) scan(page.root);
  for (const component of project.components) {
    for (const variant of component.variants) scan(variant.root);
  }

  return families;
}

/** Unique Google Fonts stylesheet URLs needed by the project. */
export function projectFontHrefs(project: Project): string[] {
  return collectProjectFonts(project).map((family) => googleFontHref(family));
}
