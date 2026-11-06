# State

Living record. Update after every integrated milestone. Dates are absolute.

**Updated:** 2026-11-06

## Current milestone

Core editor vertical slice (D2), building on a stable document model. Framer
reference extraction is running; the editor shell waits for verified facts.

## Areas

| Area | Status | Notes |
| --- | --- | --- |
| Repository | done | Public `morewebs/WebFM`, AGPL-3.0, CI workflow pending first push. |
| Scaffold | done | npm workspaces, strict TypeScript, Vitest, Biome, root scripts. |
| Document model — types/defaults/tree | done | `packages/model/src/types.ts`, `defaults.ts`, `tree.ts`. |
| Document model — operations/history | in progress | Immer recipes + patch history + unit tests. |
| Renderer | not started | Shared DOM renderer, style resolution for editor and publish modes. |
| Server | not started | Fastify API, filesystem project/asset stores. |
| Publishing | not started | `PublishAdapter`, static exporter, zip. |
| Editor shell | blocked on reference | Layout/panels/skin require the verified Framer inventory. |
| Canvas interactions | not started | Select, move, resize, text edit, guides. |
| Panels | not started | Insert, Layers, Properties, Pages, Assets. |
| Breakpoints | not started | UI + override writes. |
| Preview / Publish UI | not started | |
| Framer reference | in progress | One scratch project; screenshots, computed styles, extracted assets. |
| Manual verification | not started | Lead runs editor in Chrome and checks against Framer. |

## Built

- Repository and open-source license.
- Monorepo scaffold with root `dev`, `build`, `test`, `typecheck`, `check`.
- Shared model types covering project, pages, nodes, responsive props, layout,
  sizing, fills, text, images, components, assets, publish config.
- Model defaults and factories; breakpoint cascade resolver; tree helpers.

## Missing / next

1. Model operations and patch history with tests.
2. Renderer + style resolver with tests.
3. Server storage/API with tests.
4. Static publish adapter + zip with tests.
5. Verified Framer reference document and extracted assets.
6. Editor shell, canvas, panels, breakpoints, preview.
7. Integration, manual browser verification, first green commit on `main`.

## Blocked

- Editor shell: waiting for verified Framer inventory (labels, panel order,
  dimensions, colors, assets). Do not guess.
- Cloud/auth: deliberately deferred (D4, D11, D12).

## Known risks

- Pixel replica from extracted Framer assets has redistribution risk (D17).
- Immersive UI scope is large; components/interactions/code/CMS are explicitly
  after the core.
