# WebFM

An open-source, Framer-familiar visual web design editor. Framer's editor is the
reference: the same information architecture, panel placement, terminology,
shortcuts, interactions and dark visual language, rebuilt from scratch.

**Status: early development.** The core editor is being built in public. Nothing
here is production-ready yet.

## Quick start

```bash
npm install
npm run dev
```

- Editor: <http://127.0.0.1:5173>
- API: <http://127.0.0.1:8787>

Projects are stored as plain JSON under `.webfm-data/` by default. Set
`WEBFM_DATA_DIR` to use another directory.

## What works today

- The Framer 3.0-shaped editor: top bar, Pages/Layers/Assets, Agent/Style,
  canvas, breakpoint bar, floating toolbar, extracted Inter UI font and chrome
  SVGs.
- Pages with Frame, Stack, Text and Image; select, move, resize, text editing,
  layers with rename/hide/lock/drag, align/distribute, undo/redo and nudges.
- A Style panel for breakpoint position/size, layout, typography, fill, border,
  radius, shadow, opacity and overflow, with responsive overrides.
- Components: create from a layer, instances, master editing, variants,
  property controls with instance overrides, and default variants.
- Custom breakpoints (add/remove) and Appear/Hover/Tap effects with
  Fade/Slide/Scale, duration, delay and easing.
- Preview and a pluggable static publish pipeline with assets and zip download.

Not built yet: code components, CMS, auth/cloud deployment, hosting,
multiplayer, comments, scroll/drag interactions and import.

## What is here

| Path | Purpose |
| --- | --- |
| `packages/model` | Versioned project document, operations, history. No DOM. |
| `packages/render` | Shared React/DOM renderer used by the editor and the publisher. |
| `packages/publish` | `PublishAdapter` interface, static-site exporter, zip output. |
| `apps/server` | Local/cloud-ready HTTP API, filesystem project store, assets. |
| `apps/editor` | The editor UI (Vite + React + TypeScript). |
| `docs/` | Architecture, decisions, state, Framer reference notes. |

## Scripts

| Command | Meaning |
| --- | --- |
| `npm run dev` | Start API and editor together. |
| `npm run check` | Typecheck, unit tests, production builds. |
| `npm test` | Unit tests (Vitest). |
| `npm run build` | Build server and editor. |

## Publishing

Publishing is an adapter boundary, not a hosting product. The repository ships a
static exporter that writes self-contained HTML/CSS/JS and assets, plus a zip
artifact. Other targets implement `PublishAdapter`. See
[`docs/PUBLISHING.md`](docs/PUBLISHING.md).

## Framer reference material

UI reference screenshots, extracted icons and computed-style notes live under
`.reference/` and are not committed. Their provenance and redistribution caveat
are recorded in [`docs/FRAMER-ASSETS.md`](docs/FRAMER-ASSETS.md). WebFM does not
contain Framer source code.

## License

AGPL-3.0. See [`LICENSE`](LICENSE).
