# State

Living record. Update after every integrated milestone. Dates are absolute.

**Updated:** 2026-11-06 22:45

## Current milestone

The core editor and the component slice are built and browser-verified,
including component property controls. Interactions are the next slice.

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
| Breakpoints | done | 1200/810/390 defaults, per-breakpoint overrides, custom add (narrower than primary) and remove; verified. |
| Components | done (core+controls) | Create from layer, instances, edit master, variants, property controls with defaults/bindings, publish. Instance style overrides next. |
| Alignment | done | 8 align/distribute actions for free-layout siblings; buttons + Alt shortcuts; verified. Text layers auto-rename on content edit. |
| Interactions | done | Appear/Hover/Tap with fade/slide/scale, duration, delay and easing; Preview and publish CSS; verified. |
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
- Breakpoints: + added a Custom 1000 breakpoint (active, page 1000 wide, root override), the switcher listed it with a remove ×, and removing the active breakpoint fell back to Desktop 1200 and removed its overrides.
- Components: create from a frame with Ctrl+Alt+K, component edit mode shows
  the ComponentBar and variant root; master text edit commits; Back to page
  selects the instance; Add variant; instance variant switch changes rendered
  content; second instance inserted from Assets; publish renders both instances
  with their variant content.
- Alignment: selected two instances, aligned left (both x=0) and center-h
  (x=450) with one undo entry each; Alt+A triggered the same alignment; a text
  content edit renamed the layer to "Auto renamed".
- Interactions: added Appear (slide up, 600ms) and Hover (scale) to a
  component instance; Preview contained the keyframes and :hover rule with the
  expected animation/transition; publish CSS contained the same; changing the
  duration updated the CSS; removing the appear effect removed the keyframes
  while keeping hover.
- Property controls: added Text content + Visible bindings in component edit
  mode; instance inspector rendered the text field and switch; the text
  override changed only one instance; the switch hid the instance's text; reset
  returned to the default; Set default variant moved the DEFAULT badge; publish
  contained the overridden and default instance content.

- Bugs found and fixed: detached `fetch` binding, unaliased `Inter` document
  font, responsive merge wiping layout fields, new pages missing breakpoint
  overrides, breakpoint bar always blue, 1px shell offsets, variant node ids
  (now shared across variants).

## Next

1. Code components, then CMS.
2. Page background editing; instance style overrides; per-variant property defaults.
3. Instance style overrides; per-variant property defaults; publish class
   scoping for component variants.
4. More interaction triggers (scroll, drag) and effect types; multiple effects
   per trigger.
5. Cloud/auth design discussion (deferred).

## Known limits

- Static publish shares component child class names across instances/variants;
  per-instance class scoping is a follow-up (editor is unaffected).
- Component create/insert is page-only; nested component creation from the UI is
  disabled.
- Instances inherit master layout/typography/style; position, size and component
  property values are instance-owned. Style overrides (fill/border/radius/shadow)
  are next.
- Component property defaults are component-wide; per-variant defaults are next.
- Page background editing is not exposed in the no-selection panel (matches
  Framer's Typography/Template panel).
- Text layers do not auto-rename with content.
- Only the first interaction per trigger (appear/hover/tap) is emitted; scroll,
  drag and loop triggers are not built.
- Alignment applies to siblings whose parent uses free layout; stack/grid
  alignment follows the layout and the buttons disable. Distribution needs 3+
  layers; the extra alignment menu is not built.
- Static exports use root-absolute asset URLs (no base-path option yet).
- Extracted Framer assets carry redistribution risk (D17).
