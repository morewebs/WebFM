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
  size are instance-owned. Style/content overrides are the next slice.

## Next: property controls (not built)

The model and renderer already support component properties and bindings. The
next sub-slice should add:

- In component edit mode, a **Properties** section under the Style panel with a
  `+` menu: Text, Boolean, Color, Number, Enum. Each property has a name, a
  default value, and one binding to the selected node's prop (`text.content`,
  `text.color`, `visible`, `text.fontSize`, etc.).
- In the instance inspector, one control per component property (text field,
  switch, color picker, number field, select), writing
  `setInstancePropertyValue`.
- Purple override styling for instance values that differ from the default.
- A default-variant action in the component panel.

## Out of scope for this slice

- Property-control **UI** (add/remove/bind controls) — model-level only.
- Component variables, code overrides, effects, slots.
- Creating a component from an instance of another component (nested master).
- Deleting components that have instances (the model refuses).
- Component-specific breakpoints; the project breakpoints apply.
- Component thumbnails; Assets cards use the component glyph.
