# Framer editor reference

Verified against the live editor on 2026-11-06 (Webb's Workspace, Free plan).
Every statement here must carry a verification date and come from the live
product, a screenshot in `.reference/`, or extracted computed style. Anything
unverified is marked **unverified** and must not drive implementation.

## Environment

- Framer in Chrome, logged in. One scratch project (`WebFM Reference`) is used
  for study. The existing `Irresistible System` project is never touched.
- Account badge: Free.
- Dashboard: dark, left sidebar (`Webb's Workspace`, Search, Projects: All,
  Archive, New folder…), project grid, `Last viewed by me` sort, `New project`
  button.

## Editor chrome

**To be filled from the verified inventory.** Sections:

- Top bar / toolbar: order, controls, labels, dimensions.
- Left rail and panels: Insert, Assets, Pages, Layers, their order and states.
- Canvas: rulers, zoom controls, breakpoint switcher, page indicator.
- Right properties panel: tabs, sections, control order for Frame, Stack, Text,
  Image.
- Bottom bar: status, zoom, help.
- Menus and context menus: exact items and separators.
- Keyboard shortcuts: exact bindings.
- Insert menu: groups and items.
- Breakpoint flow: defaults, adding, widths, labels.
- Layers: row anatomy, icons, drag behavior.
- Component flow: create, variants, properties.
- Preview and Publish dialogs: options.

## Design tokens

**To be filled.** Colors, typography, spacing, radii, shadows, icon sizes,
panel widths, toolbar heights, extracted with `getComputedStyle`.

## Assets

Extracted UI assets and their manifest live in `.reference/framer/assets/`
until promoted into the editor with provenance. See
[`FRAMER-ASSETS.md`](FRAMER-ASSETS.md).
