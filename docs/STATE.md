# State

Living record. Update after every integrated milestone. Dates are absolute.

**Updated:** 2026-11-08 13:20

## Current milestone

The core editor, component slice (including instance style overrides),
interactions (Appear/Hover/Tap/Scroll), guides/snapping and linked color/text
styles are built. Working through the remaining backlog: polygon/star,
per-variant property defaults, richer interactions, then code components and
CMS.

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
| Panels | done | Layers (component breadcrumb, instance purple accent, Create/Edit component), Pages, Assets (Components, Colors, Text styles, Images), Properties (instance inspector), Insert, menus, Publish dialog, Preview. |
| Color styles | done | Assets Colors section: create (auto-links the source layer), rename/recolor/opacity, delete with usage counts. Linked solid fills and text colors; edits propagate across pages and component variants following the breakpoint cascade; manual edits and Delete detach. No-op apply/edit adds no history. Publishing uses denormalized values. Verified. |
| Text styles | done | Assets Text styles section (create from selection, inline editor for all typography fields, "Aa" preview, usage counts, apply/delete) and a Typography text-style control with linked badge and Detach. Edits propagate across pages and component variants along the breakpoint cascade; manual typography edits detach and freeze resolved values at that breakpoint; applying a text style clears the color link while applying a color style keeps the text link. Color wins for color only. No-op apply/edit adds no history. Verified. |
| Breakpoints | done | 1200/810/390 defaults, per-breakpoint overrides, custom add (narrower than primary) and remove; verified. |
| Components | done (core+controls+styles) | Create from layer, instances, edit master, variants, property controls with defaults/bindings, publish. |
| Instance style overrides | done | Sparse fill/border/radius/shadow/opacity/blend/overflow overrides layered over the master at each breakpoint; shared resolver for editor and publish; Styles inspector with Overridden badge and per-breakpoint Reset; color-style propagation/removal/usage scanning; color styles can be created/applied from an instance. Verified. |
| Layout modes | done | Relative/Absolute/Fixed/Sticky, overflow X/Y/scroll, viewport sizing, min/max with clear; verified. |
| Shape tools | partial | Rectangle (R), Rounded (U), Oval (O); polygon/star missing. |
| Grouping | done | Group/ungroup, Add frame/Add stack, Remove wrapper; one history entry; verified. |
| Fill editor | done | Solid, linear/radial gradients (stops/angle), image fills (asset select/upload, fit, focus); verified. |
| Context menus | done | Framer-style node/layer and empty-canvas menus with search, submenus and working actions; verified. |
| Alignment | done | 8 align/distribute actions for free-layout siblings; buttons + Alt shortcuts; verified. Text layers auto-rename on content edit. |
| Rulers and guides | done | Ctrl+R rulers, Alt+G guides, drag from a ruler to create, drag to move, drag off the page to delete; page-owned guides persist. Verified. |
| Smart-guide snapping | done | Parent/sibling/page/guide edges and centers, 4px screen threshold, snap lines, Alt bypasses; rects measured synchronously at pointer-down. Verified. |
| Interactions | done | Appear/Hover/Tap with fade/slide/scale, duration, delay and easing; Preview and publish CSS; verified. |
| Scroll effects | partial (verified) | Scroll trigger with fade/slide/scale, duration, delay and easing; `data-wfm-scroll`, `.wfm-js` progressive enhancement, per-breakpoint keyframes and a generated `webfm-scroll.js` (IntersectionObserver, once per layer); Preview mirrors it. Verified. Hover/tap survive reveal, reduced motion and print show final content, and variant-root effects apply to instance wrappers. Trigger-once only: no parallax/speed/sticky/scroll-linked transforms. |
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
- Layout modes: set Fixed positioning, overflow X scroll, width 100vw and a
  120px min width, then cleared it; published CSS showed position fixed,
  overflow-x scroll and width 100vw.
- Shape tools: R drew a 150x100 rectangle (#e5e5e5), U drew a rounded frame with
  a 20px radius.
- Grouping: Shift+F wrapped two selected instances into one frame without moving
  them; Ctrl+Delete unwrapped it and kept the screen positions.
- Fill editor: switched a text layer to a linear gradient and saw the
  background-image update; type/stops/angle controls rendered.
- Context menus: right-clicked layer rows and canvas nodes; verified duplicate,
  copy/paste, rename, lock, overflow, move-to-front, align, add breakpoint,
  instance guards, empty-canvas menu and search filtering.
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

- Rulers/guides: Ctrl+R toggled the 20px rulers; Alt+G hid/showed guides;
  dragged a vertical guide from the top ruler (x=200) and a horizontal guide
  from the left ruler (y=150); moved a guide 200→300 and dragged another off
  the page to delete it; all changes persisted through autosave.
- Snapping: dropping a frame 2px from a vertical guide snapped its left edge
  exactly to 300 with a snap line; dropping it 2px from a horizontal guide
  snapped its top to 150; holding Alt while dragging left it unsnapped at 312
  with no snap line.
- Color styles: creating a style from a selected rectangle auto-linked it
  (Fill row showed the style name instead of the hex, usage 1); applying it to
  a second rectangle and a text layer raised usage to 3; editing the style
  color updated both linked fills and the text color; editing opacity to 50%
  produced rgba(0,0,255,0.5) everywhere; Detach and a manual hex edit left the
  color while dropping the link; Delete removed the style, kept colors, and
  Ctrl+Z restored the style and links; reload persisted; published
  styles.css contained the resolved values.
- Creating a color style from a layer links that layer in one history entry;
  Ctrl+Z removed both the style and the link.
- Review fixes verified: an empty opacity field shows an error instead of
  saving 0%; deleting a different style keeps the open inline editor and its
  draft; undo while the editor is open re-seeds the name field; Phone-breakpoint
  text Detach froze cyan while editing the style turned only Desktop yellow.
- Adversarial review (4 finders, 8 verified findings) also reproduced and fixed
  intermediate-breakpoint propagation, detached base links leaking into
  narrower breakpoints, no-op undo entries on repeated apply/save, and keyboard
  focus on the new controls. New model/store tests cover the cascade and no-op
  cases.
- Text styles: creating from a selected text layer linked it (1 layer, "Aa"
  16px preview); editing the style to 40px magenta updated the layer; a second
  text layer applied the style (2 layers); a manual 20px edit detached only
  that layer; a later style edit to 60px cyan left the detached layer at 20px
  magenta; applying a color style kept both links while text-style color edits
  left the color style's yellow intact and still propagated size to 70px;
  Phone Detach froze 70px while Desktop followed a later 30px edit; delete
  kept values and Ctrl+Z restored the style and link; reload persisted;
  published styles.css contained the resolved font/size/color values.
- Review fixes verified: editing a style family to Lora left a Phone manual
  edit frozen at Inter; saved Google fonts load for style previews; an open
  inline text-style draft survives autosave; different-style breakpoint
  overrides are no longer recolored by the wider style (model tests).

- Instance style overrides: created a component from a rectangle and selected
  its instance; the Styles section showed the master fill. Changed it to
  magenta (Overridden badge appeared, Reset enabled) while the master and a
  second inserted instance stayed #123456; added a Phone-only green fill and
  confirmed Desktop stayed magenta; Reset at Phone returned to the inherited
  magenta, Ctrl+Z restored green; applied a saved color style from the
  instance swatches, edited the style (instance followed), then a manual hex
  detached it and later style edits stopped; reload persisted; published CSS
  emitted #123456 at Desktop, #00ff00 in the Phone block, and the second
  instance remained #123456. Preview at Phone 390 showed green through
  container queries.
- Review fixes verified/covered: disjoint media blocks (primary min-width,
  bounded middle, narrowest max-width) let a Phone solid fill replace a
  Desktop gradient; per-breakpoint appear keyframes bake the resolved end
  state; removeBreakpoint clears instance override layers; fill:null and
  sparse fills follow the link cascade; color styles create/apply on
  instances; copy/paste fill/style use the effective instance appearance.
- Scroll effects: added Scroll via Effects + to a below-the-fold text layer;
  editor canvas stayed in its final state, Preview hid it under `.wfm-js`,
  exposed the hide/reveal rules, per-breakpoint keyframes and reduced-motion
  rules, and revealed via the observer; published document contained the
  pre-paint class script, depth-relative deferred runtime tag and
  `webfm-scroll.js`, and the CSS contained the scroll rules. A served
  published page loaded the runtime asset. Review then fixed hover/tap being
  pinned by animation fill, print omission, component-root effects, Preview
  autosave/breakpoint reveal loss, and added the runtime-load fallback.

- Text tool (Framer parity pass): Text tool + canvas click created an empty
  text layer and focused an empty editor with the caret at 0; the editor grew
  from 1px to 96px as "Hello Framer" was typed and the layer beneath stayed
  hidden; Escape committed the changed text, resized the box and auto-renamed
  the layer; Enter produced a hard break (`<br>`, two lines, 40px height);
  leaving an empty layer discarded it; double-clicking an existing text placed
  the caret at the click offset (7 in "Hello Framer") instead of selecting all.
  Reported by the user after Framer comparison and fixed.
- Canvas basics (Framer parity pass): plain wheel panned the canvas (stage top
  160→40 for deltaY 120) while Cmd/Ctrl+wheel zoomed; Cmd+= zoomed to 125%
  around the centre; dragging 480,380→920,660 selected the four intersecting
  top-level layers while a plain click cleared the selection; hovering a layer
  row outlined that layer on the canvas; ArrowUp stepped Position X 140→141;
  Ctrl+C then Ctrl+V added one layer with a fresh id and selected it, and
  Ctrl+A selected all nine top-level layers.
- Editing focus (2026-11-08): a trusted mouse click performs a default focus
  change after pointerup, which could blur the just-opened text editor, run
  closeEditor(true) and delete the empty layer — invisible to synthetic checks
  because a scripted click does not move focus. Two guards now protect that
  path: draw-tool pointerdown calls preventDefault (suppressing the
  compatibility mousedown/focus change), and a blur arriving within 120 ms of
  opening refocuses the textarea. Verified with real CDP key input: Text tool
  -> canvas click -> typed "Hello" with real keystrokes -> Escape committed a
  38.56 x 19.2 layer; an immediate focusout after mount kept the editor open
  and focused. The trusted mouse click itself cannot be dispatched in this
  environment (window unfocused), so the exact trigger remains guarded rather
  than reproduced.
- Selection chrome measured from Framer 3.0: 1px accent edges drawn inside the
  layer bounds, one 9px round handle centred on the bottom-right corner for a
  single selection (a single bounding box with four corner handles for a
  multi-selection), and a full-accent 1px hover outline. Matched the edges,
  the single round handle and the multi-selection bounding box. Verified in
  WebFM: one 9x9 radius-8 handle, union box 380,600,416x257 for two layers.
- Double-click text now selects the word under the pointer (measured in Framer:
  double-clicking "World" in "Hello World" selected offsets 6-11). Verified in
  WebFM: double-clicking "typing" selected offsets 11-17.
- Measured parity pass (interpreter report, 2026-11-08): a fresh Fit/Fit "Hello"
  at 16px renders 38.56 x 19.2 (Framer: 39 x 19.2, line-height 1.2 measured in
  the canvas iframe); the Style panel now shows Width 39 / Height 19 with both
  selects still "hug", and typing 200 into Width switched it to Fixed while
  Height stayed Fit; dragging the east handle 200 -> 243 kept Height Fit;
  auto line height now resolves to 1.2x in editor and publish (test at 20px
  expects 24px). The report's font-identity claim did not reproduce: the
  current Inter face measures 38.56 at 16px, so the fonts were left unchanged.
- Fidelity follow-ups: locking a frame made its child unselectable on canvas;
  Enter on a selected text used to open the editor, but Framer was measured to
  do nothing there, so that extra binding was removed; the
  context menu's Paste used the same clipboard as Ctrl+C/V (13→14 nodes);
  Ctrl+L and Ctrl+; toggled lock and visibility; Shift-click in the layer tree
  selected a contiguous five-row range; selecting a layer expanded its
  collapsed ancestors; clicking inside a component instance selected the
  instance instead of leaving the page root selected.
- Bugs found and fixed: detached `fetch` binding, unaliased `Inter` document
  font, responsive merge wiping layout fields, new pages missing breakpoint
  overrides, breakpoint bar always blue, 1px shell offsets, variant node ids
  (now shared across variants), snapping using rects cached by the last
  animation frame (now measured synchronously at pointer-down), color-style
  propagation ignoring intermediate breakpoint links, no-op style actions
  creating undo steps, Typography Detach not freezing the current color,
  text-style propagation overwriting breakpoints linked to another style,
  partial typography detaches still inheriting base edits, style fonts missing
  after reload, orphaned instance overrides on breakpoint removal, sparse-fill
  links, non-disjoint publish media blocks, primary-baked appear keyframes,
  scroll reveal pinning hover/tap, print-hidden scroll layers,
  component-root scroll effects not reaching the instance wrapper, and
  Text-tool creation not entering editing.

## Next

1. Code components, then CMS.
2. Polygon/star tools.
3. Per-variant property defaults; publish class scoping; more interactions.
4. More interaction triggers (drag/loop) and effect types; multiple effects per
   trigger; scroll-linked transforms and parallax.
5. Cloud/auth design discussion (deferred).

## Known limits

- Linked color styles apply to solid fills and text colors only. Gradient/image
  fills, borders, shadows and page backgrounds are not linked. Instance style
  overrides support those linked solid fills just like frames; Assets can apply
  a saved color to a selected frame or text layer, while instances use the Fill
  swatches in their own Styles section.
- Instance style overrides cover fill, border, radius, shadows, opacity/blend,
  overflow and effects. Typography is not part of an instance override (an
  instance has no text of its own), and layout stays owned by the master.
- Instance Reset clears the whole active-breakpoint style layer; there is no
  per-property reset yet.
- Text styles cover typography only: no paragraph spacing, lists, links or
  rich-text spans. Applying a text style requires an all-text selection.
- A text style and a color style can be linked together; the color style always
  wins for color. Applying a text style clears the color link in that layer.
- Static publish shares component child class names across instances/variants;
  per-instance class scoping is a follow-up (editor is unaffected).
- Component create/insert is page-only; nested component creation from the UI is
  disabled.
- Instances own position, size, component property values and style overrides;
  layout and typography come from the master.
- Component property defaults are component-wide; per-variant defaults are next.
- Page background editing is not exposed in the no-selection panel (matches
  Framer's Typography/Template panel).
- Text layers auto-rename from their content when an edit commits.
- Only the first interaction per trigger (appear/scroll/hover/tap) is emitted;
  drag and loop triggers are not built.
- Scroll effects reveal once when a layer enters the viewport. There is no
  parallax, speed control, sticky behavior or scroll-linked transform, and a
  layer cannot run more than one scroll effect at a time.
- Alignment applies to siblings whose parent uses free layout; stack/grid
  alignment follows the layout and the buttons disable. Distribution needs 3+
  layers; the extra alignment menu is not built.
- Static exports use root-absolute asset URLs (no base-path option yet).
- Extracted Framer assets carry redistribution risk (D17).
