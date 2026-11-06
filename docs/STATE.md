# State

Living record. Update after every integrated milestone. Dates are absolute.

**Updated:** 2026-11-06 22:30

## Current milestone

Core editor vertical slice (D2) is built and browser-verified. The pixel-for-pixel
Framer shell is working: insert, select, move, resize, text edit, layers, pages,
responsive breakpoints, undo/redo, assets, preview, publish and persistence.

## Areas

| Area | Status | Notes |
| --- | --- | --- |
| Repository | done | Public `morewebs/WebFM`, AGPL-3.0, CI green on `main`. |
| Scaffold | done | npm workspaces, strict TypeScript, Vitest, Biome. |
| Document model | done | Types, defaults, tree, operations, Immer patch history, 40 tests. |
| Renderer | done | Shared DOM renderer; editor inline styles, publish CSS + media queries; editor bundle has no server code. |
| Server | done | Fastify API, filesystem stores, atomic saves, optimistic concurrency, publish artifacts + zip. |
| Publishing | done | `PublishAdapter`, static exporter, document wrapper, assets, routes, zip. |
| Editor plumbing | done | API client, Zustand store, autosave, 409 handling, shortcuts. |
| Editor shell | done | Framer 3.0 geometry, extracted Inter UI font, extracted chrome SVGs. |
| Canvas | done | Select, hover, move, 8-handle resize, text edit, draw tools, zoom/pan, nudges. |
| Panels | done | Layers (tree, rename, hide/lock, DnD), Pages (add/switch/rename), Assets, Properties, Insert, menus, Publish dialog, Preview. |
| Breakpoints | done | 1200/810/390 defaults, per-breakpoint overrides verified; add/remove UI not built. |
| Assets | done | Upload API + panel listing + image insertion + publish copy verified. File picker handoff blocked by Chrome extension setting. |
| Framer reference | done for core | 74 screenshots; computed tokens and 23 extracted SVG glyphs + fonts. |
| Manual verification | done for core | See verified list below. |

## Verified in Chrome (WebFM at 127.0.0.1:5173)

- Shell loads a project and renders the 1200x1000 white page; panels match the
  Framer reference geometry and typography.
- Layer selection shows the full Style panel (Template, Breakpoint, Layout,
  Typography, Overlays, Cursor, Effects, Styles, Code overrides).
- Frame insert with F + drag; move; 8-handle resize; undo restores each gesture.
- Text insert with T + click; double-click edit commits on Enter/blur.
- Stack insert from the layout flyout; Layout section reads Stack/Vertical.
- Breakpoint switch Desktop/Tablet/Phone; tablet move writes an override while
  desktop keeps its own position and tablet restores its override.
- Pages: add page, switch Home/New Page, layers restore per page.
- Insert menu: Elements/CMS categories, icon-library grid, Media image insert.
- Asset upload through the API, asset card, image insertion, publish copies the
  asset into `assets/` and references it from `index.html`.
- Publish dialog returns a 2-file artifact for the blank page and a 4-file
  artifact with the asset; `styles.css` has the breakpoint media query.
- Preview overlay renders the page with a breakpoint selector.
- Reload preserves frames, text, stack, pages and the asset.

- Bugs found and fixed during verification: detached `fetch` binding
  (Illegal invocation), document text using the unaliased `Inter` family,
  responsive merge wiping `layout.mode` fields (crashed the Stack inspector),
  new pages missing tablet/phone root overrides.

## Next

1. Commit this integrated slice on `build/core` and merge to `main` when green.
2. Components + variants + property controls (D3 next slice).
3. Interactions, then code components, then CMS.
4. Add/remove custom breakpoints; alignment actions; auto-rename text layers.
5. Cloud/auth design discussion (deferred).

## Blocked / deferred

- Cloud deployment and auth (D4, D11, D12).
- Browser file-picker handoff: the Chrome extension's "Allow access to file
  URLs" is off; the user's decision. The same upload path is verified via the API.
- Components, interactions, code components, CMS, effects, comments, multiplayer,
  hosting: later slices.
- Alignment toolbar buttons are present but disabled until alignment operations
  exist.

## Known limits

- Page background editing was removed from the no-selection panel to match
  Framer's Typography/Template panel; the page background is still white by
  default and editable only through the document/API today.
- Text layers do not auto-rename when their content changes.
- Static exports use root-absolute asset URLs, so hosting under a subpath would
  need a base-path option.
- Extracted Framer assets carry redistribution risk (D17).
