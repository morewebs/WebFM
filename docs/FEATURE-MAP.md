# Feature map — WebFM vs Framer 3.0

Verified against the live Framer editor (2026-11-06/07, Free plan scratch
project) and the official docs. `Done` means built and browser-verified;
`Partial` means the core exists but a Framer user will find gaps; `Missing`
means absent; `Reserved` means deliberately left for the user; `Out` means
outside this project's scope.

## Summary

- **Done:** editor shell, pages, Frame/Stack/Text/Image, canvas select/move/
  resize, text editing, layers, grouping/wrapping, core Style panel with
  solid/gradient/image fills, color styles, text styles, positioning modes,
  overflow X/Y/scroll, viewport sizing, min/max fields,
  rectangle/rounded/oval tools, Google Fonts picker, rulers, guides and
  smart-guide snapping, responsive breakpoints,
  components/instances/variants/property controls, instance style overrides,
  Appear/Hover/Tap effects, scroll effects,
  alignment, context menus, preview, static publish.
- **Partial:** Pages, Layers, Assets, Style, Components, Interactions, menus,
  shortcuts, publishing.
- **Missing (editor-level):** polygon/star/pen and vector editing, grid
  overlay, marquee selection, visual effects, code components, CMS,
  localization, analytics, settings, code overrides, comments/collaboration,
  branching, Figma import, versioned publishing.
- **Reserved:** the Agent panel and all AI actions.
- **Out:** hosting, accounts/cloud deployment (deferred), and Framer's cloud
  marketplace/community.

## Views and shell

| Feature | Status | Notes |
| --- | --- | --- |
| Canvas view | Done | Framer 3.0 geometry, dark tokens, extracted font/SVGs. |
| Five-view switcher (Canvas/CMS/Localization/Analytics/Settings) | Partial | Canvas only; the other entries are disabled in the menu. |
| Top bar tools (Insert, Layout, Text, Vector) | Partial | Insert menu, layout flyout, oval, text, vector placeholder. Missing rectangle/rounded/polygon/star/pen/link/scale tools. |
| Project name + branch | Partial | Branch pill is visual only; branching/version history missing. |
| Preview button | Done | Overlay with breakpoint selector; missing fullscreen/highlights/inspect/responsive toggles. |
| Publish button | Partial | Static export dialog; no versions/staging/domains/SEO/custom code. |
| Invite / collaboration | Out | Single-user local build. |
| Bottom toolbar | Partial | Select/hand/zoom/theme; comments and theme actions disabled, no fast zoom/nudge amount. |
| Agent panel/tab | Reserved | Visible with a not-in-this-build notice. |

## Panels

| Feature | Status | Notes |
| --- | --- | --- |
| Pages: add/switch/rename/search | Done | |
| Pages: Design Pages | Missing | Disabled + in the Pages panel. |
| Pages: page settings/templates/CMS pages/duplicate/delete | Missing | |
| Layers: tree, expand, rename, hide/lock, drag, context menu | Done | |
| Layers: grouping/ungrouping, wrap/unwrap frame or stack | Done | Group/ungroup, Add frame/Add stack, Remove wrapper; shortcuts and context menu verified. |
| Layers: multi-select drag, range select | Partial | Multi-select exists; drag is single-row. |
| Layers: alphabetical sort | Done | Empty-canvas context menu. |
| Assets: image upload/list/insert | Done | |
| Assets: components | Done | Cards with variant/instance counts and edit. |
| Assets: colors | Done | Colors section: create (links the source layer), inline rename/recolor/opacity, delete, usage counts; click to apply to the selection. Saved styles also appear in the Fill and Typography editors with linked badges and Detach. Verified. |
| Assets: text styles | Done | Text styles section: create from the selection, inline editor for every typography field, "Aa" preview, usage counts, click to apply to selected text layers, hover Edit/Delete. Editing propagates along the breakpoint cascade; manual typography edits detach. Verified. |
| Assets: vectors, code overrides | Missing | |
| Assets: folders/templates | Missing | Framer asset panel is folder-based since 2026-10-26. |
| Style panel | Partial | See Styling. |
| Agent | Reserved | |

## Canvas

| Feature | Status | Notes |
| --- | --- | --- |
| Pan/zoom, breakpoint bar, page root | Done | |
| Select/hover/move/resize/nudge | Done | |
| Text editing (plain text) | Partial | No rich text spans, links, lists, paragraph spacing. |
| Draw tools: frame, stack, grid, oval, text, image | Done | |
| Shape tools: rectangle, rounded, polygon, star | Partial | Rectangle (R), Rounded (U) and Oval (O) work; polygon/star/pen missing. |
| Pen/path/vector editing | Missing | |
| Rotation, scale tool, link tool, sample color | Missing | |
| Rulers, guides and smart-guide snapping | Done | Drag from a ruler to create, drag a guide to move, drag it off the page to delete; nodes snap to parent/sibling/page/guide edges and centers (4px screen threshold, Alt bypasses). Verified. |
| Grid overlay | Missing | |
| Marquee/lasso selection | Missing | Additive click selection only. |
| Multi-selection transform | Partial | Movement/resize per node; no group bounding transform. |
| Component edit mode | Done | Basic bar, variant switching, back to page. |
| Nested components | Missing | Page-only create/insert. |
| Positioning modes | Done | Relative/Absolute/Fixed/Sticky; fixed is absolute in the editor and fixed when published. |
| Constraints/auto-pin | Missing | |
| Scroll containers | Missing | |
| Page templates | Missing | |
| Comments/cursor chat | Missing | |
| Preview inspect/highlights | Missing | |

## Styling

| Feature | Status | Notes |
| --- | --- | --- |
| Size fixed/relative/fill/fit content/viewport | Done | Viewport emits vw/vh; min/max fields added. |
| Min/max sizing/constraints/aspect ratio | Partial | Min/max fields added with clear; auto-pin/constraints and aspect-ratio UI still missing. |
| Layout none/stack/grid; direction/gap/padding/align/justify/wrap | Done | |
| Grid columns/rows/gaps | Done | |
| Fill solid | Done | |
| Fill gradient / image | Done | Fill type selector, gradient stops, image asset upload/select, fit and focal position. |
| Color picker opacity/gradients/stops | Partial | Native color + hex for solid only. |
| Color styles (saved swatches) | Done | Project color styles link solid fills and text colors. Style edits propagate to every usage across pages and component variants along the breakpoint cascade; manual color edits detach. Values stay denormalized so publish CSS needs no lookup. No-op apply/edit adds no history. Verified. |
| Border width/color/style | Done | Per-side borders missing. |
| Radius corners | Done | |
| Shadow list | Done | Add/remove basic. |
| Opacity/blend modes | Partial | Opacity UI; blend modes model/renderer only. |
| Visual effects (blur, backdrop, etc.) | Missing | Effects section is currently interactions. |
| Overflow clip/hidden/visible/scroll + X/Y | Done | Per-axis selects and scroll added. |
| Typography: family/size/weight/line height/spacing/color/align/italic/underline/case | Done | Static font list. |
| Google Fonts/custom font picker | Partial | Curated Google Fonts catalog works; custom font upload missing. |
| Text styles | Done | Text style control at the top of Typography: "None"/saved styles, linked badge, Detach; style edits propagate across pages and component variants. Detaching at a breakpoint freezes the resolved typography. Paragraph spacing and rich-text spans remain missing. |
| Paragraph spacing/rich text | Missing | No paragraph spacing, lists, links or rich-text spans. |
| Image fit/position/alt/replace | Done | Intrinsic size missing. |
| Cursor | Missing | |
| Code overrides | Missing | |
| User select | Missing | |
| Template section | Missing | Placeholder. |

## Components

| Feature | Status | Notes |
| --- | --- | --- |
| Create from layer, instances | Done | |
| Component edit mode | Done | |
| Variants add/switch/default | Done | |
| Property controls (text/color/number/boolean/visible/opacity) | Done | |
| Instance overrides for those properties | Done | Purple override state + reset. |
| Style overrides on instances | Done | Fill (including color-style links/swatches), border, radius, shadow, opacity/blend, overflow and effects in the instance Styles section; sparse per-breakpoint layers merge over the master; Overridden badge and active-breakpoint Reset. Color styles can be created/applied from an instance selection. Verified; published CSS uses disjoint breakpoint blocks. |
| Per-variant property defaults | Missing | Component-wide defaults. |
| Nested components/slots | Missing | Page-only model create/insert. |
| Replace with / unlink / update badges | Missing | |
| Code components | Missing | |
| Component effects | Missing | |

## Interactions

| Feature | Status | Notes |
| --- | --- | --- |
| Appear/Hover/Tap with Fade/Slide/Scale, duration/delay/easing | Done | First effect per trigger emitted. |
| Press/drag/loop effects | Missing | |
| Scroll effects | Partial | Scroll trigger with Fade/Slide/Scale, direction, duration, delay and easing; the first scroll effect per layer reveals once when it enters the viewport. Published CSS hides layers only under `.wfm-js`; the static exporter emits `webfm-scroll.js` (IntersectionObserver, dependency-free) and Preview mirrors it with an effect. Verified; hover/tap still work after reveal, print shows final states, and variant-root effects apply to instances. No parallax, speed, sticky or scroll-linked transforms; no scroll variants. |
| Show overlay / set variant actions | Missing | |
| Trigger conditions (cookies, params, visited pages, forms, link click) | Missing | |
| Page transitions/view transitions | Missing | |
| Custom easing | Missing | |

## Content and platform

| Feature | Status | Notes |
| --- | --- | --- |
| CMS collections/fields/items/references/dynamic pages/on-page editing | Missing | |
| Localization/locales/content panel | Missing | |
| Analytics view | Missing | |
| Settings view (site settings, code, fonts, redirects, robots) | Missing | |
| Code components/code overrides/custom code/plugins | Missing | |
| Branching/version history | Missing | |
| Figma import | Missing | |
| Comments/multiplayer | Out for now | |
| Hosting/domains/versions/staging | Out | Publishing produces static artifacts only. |
| Accounts/cloud deployment | Out/deferred | Storage/auth seams exist. |
| Agent/AI features | Reserved | User has plans. |

## P0 gaps to implement next (core editor completeness)

1. ~~Grouping/wrapping/unwrapping~~ — done and verified.
2. ~~Fill gradients and image fills in the Style panel~~ — done and verified.
3. ~~Positioning modes and overflow X/Y/Scroll, viewport sizing, min/max~~ — done and verified.
4. ~~Google Fonts/custom font picker~~ — Google Fonts done; custom font upload
   remains.
5. Shape tools: rectangle and rounded done; polygon/star still missing.
6. ~~Color styles and text styles in Assets~~ — done and verified.
7. ~~Rulers/guides/smart guides and snapping~~ — done and verified.
8. ~~Instance style overrides~~ — done and verified.

## P1 gaps

- Press/drag interactions, overlays, set-variant actions; scroll variants,
  parallax, speed and scroll-linked transforms.
- Per-variant property defaults, nested components.
- Code components and code overrides.
- CMS, localization, analytics, settings.
- Versioned publishing/SEO/domains (hosting out).

Every row above is a candidate for a verified slice; this map is the shared
backlog. Update the status here when a slice lands.
