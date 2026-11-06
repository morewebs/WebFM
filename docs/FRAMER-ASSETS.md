# Framer-derived assets

WebFM's dark editor is a pixel-for-pixel reference build of Framer's editor, as
requested. Assets are extracted from the live Framer web application instead of
being redrawn, so the layout and glyphs match.

## What is extracted

- UI glyphs and icons from the editor chrome (SVG).
- Computed style tokens: colors, typography, spacing, radii, control sizes.
- No project content, user data, comments, account data or customer material.
- No Framer source code, bundled JavaScript, or private API is copied.

## Where it lives

- Raw extracts and screenshots: `.reference/` (gitignored).
- Promoted editor assets: `apps/editor/src/assets/framer/` with
  `MANIFEST.json` recording source selector/URL, file, and extraction date.

## Licensing caveat

Framer's UI artwork, icons and fonts remain Framer's property. The AGPL-3.0
license on this repository covers WebFM's own code; it cannot grant rights to
extracted Framer assets. Redistributing them may require permission. Before any
public release or commercial distribution, replace extracted assets with
original equivalents or obtain permission. This risk is accepted for the
reference build per D17 and must be revisited before launch.

If a font is extracted, check its license first. Prefer the public upstream font
(e.g. Inter from Google Fonts) when the Framer UI uses a public typeface.

## Extraction record (2026-11-06)

- Source: live Framer editor, `framer.com/projects/Expanded-Author…`, 1920x897
  viewport, logged-in Free plan.
- Method: serialized the live DOM's `<svg>` elements and computed styles with
  `browser_execute_script`; downloaded the font files from Framer's public static
  host. Raw JSON kept at `.reference/framer/assets/framer-ui-assets.json`
  (gitignored).
- Promoted assets: `apps/editor/src/assets/framer/icons.ts` (23 chrome glyphs)
  and `MANIFEST.json` (source index/label, dimensions, font URLs).
- Fonts: `apps/editor/src/assets/fonts/InterVariable.latin.woff2`,
  `InterVariable.latin-ext.woff2`, `InterVariable-Italic.latin.woff2`, wired as
  both `Inter Variable UI` (editor chrome) and `Inter` (document text).
  Source URLs are recorded in the manifest. Inter is SIL OFL 1.1; the OFL permits
  redistribution. Framer's UI build is a subset of the public variable font.
- Extracted glyphs use `currentColor`, so the shell controls their color.
- Not extracted: the Oval tool glyph (no SVG in the captured DOM; WebFM uses a
  one-stroke circle), icon-library logos, and interaction/component assets.

