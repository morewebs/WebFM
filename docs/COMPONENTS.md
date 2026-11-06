# Components

Components are a first-class part of the Framer editor; WebFM's first component
slice covers creation, instances, editing the main component, and variants.
Property controls (Framer's Variables) are the next sub-slice and are not
exposed in the UI yet (the model and renderer accept bindings).

## Data model

`packages/model/src/types.ts` already defines:

- `ComponentDefinition` — id, name, variants, properties, bindings,
  defaultVariantId.
- `ComponentVariant` — id, name, root `FrameNode`.
- `ComponentInstanceNode` — componentId, variantId, propertyValues, plus its own
  responsive box props (placement).
- `ComponentProperty` / `PropertyBinding` — the model for controls; the UI for
  creating them is deliberately not built in this slice.

`SceneTarget` lets every node operation address a page or a component variant:

```ts
type SceneTarget =
  | { pageId: PageId }
  | { componentId: ComponentId; variantId?: VariantId };
type NodeLocation = SceneTarget & { nodeId: NodeId };
```

## Create a component

- Select a layer (frame, text, image or instance) and press **Cmd/Ctrl+Alt+K**,
  or use the layer context menu → **Create Component**.
- The layer is replaced in place by an instance with the same position/size.
- The master is stored on the project and the editor enters **component edit
  mode** for its Default variant.
- A non-frame layer is wrapped in a hug-sized frame; the original layer is
  preserved inside.

## Component edit mode

- The canvas shows the variant root instead of the page, at the active
  breakpoint width.
- A bar above the canvas shows the component name, a **Variant** selector, an
  **Add variant** action, and **Back to page**.
- The Layers panel and Style panel act on the variant's nodes exactly as they do
  on page nodes. Edits change the master, so every instance updates.
- Back returns to the page with the instance selected.
- The canvas is white and page-sized; this is the component's own scene, not a
  page.

## Instances

- The **Assets** panel has a **Components** section. Each card shows the
  component name, variant count and instance count. Clicking inserts an
  instance into the active root (or the selected frame).
- An instance renders the master variant's layout and appearance with its own
  position and size. Resizing an instance changes its box in the editor.
- The Style panel adds a **Component** section for a selected instance: component
  name, **Variant** select, and **Edit main component**. The section sits above
  Template.
- Layer rows for instances use the component glyph and the component name.

## Variants

- Default variant is created with the component.
- **Add variant** clones the current variant with a fresh variant id, **the same
  node ids** and a unique name (`Variant 2`, `Variant 3`, …). Shared node ids
  keep layer identity and component-wide bindings working across variants.
- Instances choose a variant in the Style panel; the master can set a default
  variant (model supports it; the UI action lands with property controls).
- Deleting the last variant is forbidden; deleting the default reassigns it.

## Rendering and publishing

- The instance's variant (or component default) resolves to a cloned root.
- Component bindings apply instance property values onto the variant's node
  props. Property-control UI is not built yet, but the model/renderer path is
  tested.
- Instance placement (position/size) overrides the variant root; master style
  and inner layout remain authoritative.
- Nested components render recursively with a depth/cycle guard.
- Static export uses the same renderer, so instances publish as their resolved
  variant markup.

## Known limits in this slice

- Static publish uses shared node classes for component variant children. Two
  instances (or two variants) with different child styles can collide in the
  generated CSS; the markup and content are correct, but per-instance class
  scoping is a follow-up. The editor is unaffected (inline styles).
- Component create/insert is page-only in the model, so nested components are
  not created or inserted from the UI yet. Instances can still contain
  components that existed in the copied tree.
- Instances inherit the master's layout, typography and style; only position and
  size are instance-owned. Content overrides work through property controls;
  style overrides (fill, border, radius, …) are the next slice.
- Component property defaults are component-wide. A property added while
  editing a variant captures that variant's value and applies it to every
  variant unless an instance overrides it. Per-variant defaults are a follow-up.

## Property controls (built)

- In component edit mode, selecting a node shows a purple **Properties** section
  with a `+` menu. Options depend on the node:
  - Text: **Text content**, **Text color**, **Font size**.
  - Image: **Alt text**.
  - Any node: **Visible**, **Opacity**.
- Adding one runs `addComponentProperty` + `setComponentBinding` in a single
  history entry. Rows show the name, `type · path` hint, and a remove ×.
- The instance inspector shows a **Properties** section with one control per
  property: text field, color picker + hex, number field, switch, or select for
  enum/variant properties.
- Overridden values are purple and carry a reset ×; reset removes the override
  so the component default applies again.
- The component panel marks the default variant and offers **Set default** on the
  others.
- The renderer applies defaults and bindings, including top-level
  `visible`/`locked`/`name` paths; published output reflects instance values.

## Out of scope for this slice

- Enum property creation UI (the model and instance select support enums).
- Per-variant property defaults and component variables beyond text/boolean/
  color/number/enum.
- Instance style overrides (fill, border, radius, shadow).
- Creating a component from an instance of another component (nested master).
- Deleting components that have instances (the model refuses).
- Component-specific breakpoints; the project breakpoints apply.
- Component thumbnails; Assets cards use the component glyph.
