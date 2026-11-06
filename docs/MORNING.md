# Morning summary — WebFM, 2026-11-06 → 2026-11-07

Repository: <https://github.com/morewebs/WebFM> (public, AGPL-3.0).
`main` is green; CI runs typecheck, unit tests and both production builds.

## Run it

```bash
npm install
npm run dev
# editor  http://127.0.0.1:5173
# API     http://127.0.0.1:8787
```

Projects are plain JSON under `apps/server/.webfm-data/` (gitignored). Set
`WEBFM_DATA_DIR` to move them.

## What was built

**Core editor** — Framer 3.0 shell geometry measured from the live editor:
51px top bar, 260px sidebars, exact panel/tab/control metrics, dark tokens,
the extracted **Inter Variable UI** font and 23 extracted chrome SVGs.
Pages, Frame/Stack/Text/Image, infinite canvas with pan/zoom, insert, select,
move, 8-handle resize, text editing, layers tree (rename, hide, lock, drag),
Style panel (breakpoint position/size, layout, typography, fill/border/radius/
shadow/opacity, overflow), responsive breakpoints 1200/810/390 with cascading
overrides, undo/redo, preview, assets, publish and persistence.

**Publishing** — a `PublishAdapter` boundary; the static exporter renders every
page, copies assets and writes `index.html`, route folders, `styles.css` and a
zip. No hosting is included.

**Components** — create from a layer (Ctrl/Cmd+Alt+K), instances, component edit
mode with a variant bar, variants (add/switch/default), Assets component cards,
and property controls: expose text content/color/size, alt text, visible or
opacity; instance controls with purple override state and reset. Published
instances render their variant and property values.

**Breakpoints** — add a custom breakpoint with the breakpoint bar + (name and
width; narrower than the primary), switch, and remove non-primary breakpoints;
page roots get width overrides and dead overrides are cleaned up. Verified in
Chrome.

**Interactions** — Appear/Hover/Tap with Fade/Slide/Scale, duration, delay and
easing in the Effects section; CSS keyframes/transitions in Preview and publish.
(If this line is present, it was verified.)

## Verified in Chrome

The list is maintained in [`STATE.md`](STATE.md), including the exact flows
that were exercised and the bugs found while verifying them.

## Known limits

- Component instances inherit master style; style overrides and per-variant
  property defaults are next.
- Published component variants share child class names, so variant-specific
  styles can collide; per-instance class scoping is a follow-up.
- Nested component creation from the UI is disabled (the model create path is
  page-only).
- Alignment buttons are visible but disabled; add/remove breakpoints and text
  auto-rename are the next core polish.
- Cloud deployment and auth are deliberately deferred; the storage and auth
  seams are documented.

## Next slices

Interactions (if not done), code components, CMS, then cloud/auth.

## Where to look

- `docs/ARCHITECTURE.md` — package boundaries and data flow.
- `docs/STATE.md` — built/missing/verified, updated through the night.
- `docs/DECISIONS.md` — every product/architecture decision and why.
- `docs/FRAMER-REFERENCE.md` — verified live-editor measurements and labels.
- `docs/COMPONENTS.md`, `docs/PUBLISHING.md`, `docs/FRAMER-ASSETS.md`.
