# State

Living record. Update after every integrated milestone. Dates are absolute.

**Updated:** 2026-11-06 22:45

## Current milestone

The core editor is built and browser-verified. The component slice (create,
instances, component edit mode, variants) is built and browser-verified.
Property controls are the next sub-slice.

## Areas

| Area | Status | Notes |
| --- | --- | --- |
| Repository | done | Public `morewebs/WebFM`, AGPL-3.0, CI green on `main`. |
| Document model | done | Types, defaults, tree, operations, history, component targets/ops. |
| Renderer | done | Shared DOM renderer; editor inline styles, publish CSS + media queries; component defaults/bindings, instance size, nested guard. |
| Server | done | Fastify API, filesystem stores, atomic saves, optimistic concurrency, publish artifacts + zip. |
| Publishing | done | `PublishAdapter`, static exporter, assets, routes, zip; component instances render. |
| Editor plumbing | done | API client, store, autosave, 409 handling, shortcuts, component edit mode. |
| Editor shell | done | Exact Framer 3.0 geometry (51px top bar, 260px panels), extracted Inter UI font and chrome SVGs. |
| Canvas | done | Select, move, resize, text edit, draw tools, zoom/pan, breakpoint bar states, component stage and bar. |
| Panels | done | Layers (component breadcrumb, instance purple accent, Create/Edit component), Pages, Assets (Components section), Properties (instance inspector), Insert, menus, Publish dialog, Preview. |
| Breakpoints | done | 1200/810/390 defaults, per-breakpoint overrides verified; add/remove not built. |
| Components | done (core) | Create from layer, instances, edit master, variants, defaults/bindings in the model+renderer. Property-control UI next. |
| Assets | done | Upload API, panel listing, image insertion, publish copy. File picker handoff blocked by a Chrome extension setting. |
| Framer reference | done for core | 74 screenshots; computed tokens, 23 extracted SVGs, fonts. |
| Manual verification | done for core+components | See verified list below. |

## Verified in Chrome

- Shell geometry matches the reference: 51px top bar, 260px sidebars, page at
  x360/y211, neutral #212121 breakpoint bar, exact canvas offsets.
- Layer selection shows the full Style panel; no selection shows Typography +
  Template; instance selection shows Component + Breakpoint + Overrides.
- Frame insert with F + drag; move; resize; text insert/edit; undo.
- Breakpoint switch; tablet edits override while desktop keeps its position.
- Pages add/switch; layer trees restore per page.
- Assets: image upload via API, asset card, image insertion, publish copy.
- Publish dialog and static export; preview overlay; reload persistence.
- Components: create from a frame with Ctrl+Alt+K, component edit mode shows
  the ComponentBar and variant root; master text edit commits; Back to page
  selects the instance; Add variant; instance variant switch changes rendered
  content; second instance inserted from Assets; publish renders both instances
  with their variant content.

- Bugs found and fixed: detached `fetch` binding, unaliased `Inter` document
  font, responsive merge wiping layout fields, new pages missing breakpoint
  overrides, breakpoint bar always blue, 1px shell offsets, variant node ids
  (now shared across variants).

## Next

1. Property controls: add/expose/bind in component edit mode; instance controls;
   purple override state; default-variant action.
2. Interactions (appear/scroll/hover/tap) after components.
3. Code components, then CMS.
4. Add/remove custom breakpoints; alignment actions; text auto-rename.
5. Cloud/auth design discussion (deferred).

## Known limits

- Static publish shares component child class names across instances/variants;
  per-instance class scoping is a follow-up (editor is unaffected).
- Component create/insert is page-only; nested component creation from the UI is
  disabled.
- Instances inherit master layout/typography/style; only position and size are
  instance-owned until overrides land.
- Page background editing is not exposed in the no-selection panel (matches
  Framer's Typography/Template panel).
- Text layers do not auto-rename with content.
- Static exports use root-absolute asset URLs (no base-path option yet).
- Extracted Framer assets carry redistribution risk (D17).
