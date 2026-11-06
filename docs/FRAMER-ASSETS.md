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
