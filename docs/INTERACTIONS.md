# Interactions (effects)

**Status: built and verified 2026-11-07.** Appear/Hover/Tap with Fade/Slide/
Scale, duration, delay and easing are editable in the Effects section; Preview
plays them and the static exporter emits the same CSS.

This slice implements the first Framer-style effects on any node: **Appear**,
**Hover** and **Tap** with **Fade**, **Slide** and **Scale**, plus duration,
delay and easing. Scroll, drag, loop and custom code effects are out of scope.

## Model

Add to the shared node base an optional, ordered `interactions` list. An
interaction is one record:

```ts
type InteractionTrigger = "appear" | "hover" | "tap";
type InteractionEffect = "fade" | "slide" | "scale";
type InteractionDirection = "up" | "down" | "left" | "right";
type InteractionEasing = "ease" | "linear" | "ease-in" | "ease-out";

interface Interaction {
  id: string;
  trigger: InteractionTrigger;
  effect: InteractionEffect;
  /** Slide direction; ignored for fade/scale. */
  direction: InteractionDirection;
  duration: number; // ms
  delay: number;    // ms
  easing: InteractionEasing;
}
```

The field is optional so existing projects load unchanged. Operations:

- `addInteraction(draft, NodeLocation, input): InteractionId`
- `updateInteraction(draft, NodeLocation, interactionId, patch): void`
- `removeInteraction(draft, NodeLocation, interactionId): void`

Validate duration 0..10000 and delay 0..10000; unknown ids throw.

## UI

The Style panel's existing **Effects** section becomes functional (the
placeholder note goes away):

- `+` menu offers **Appear**, **Hover**, **Tap**. Adding one creates a row with
  sensible defaults: Fade (appear), Scale (hover), Scale (tap), 300ms, 0ms,
  ease.
- Each row: trigger select, effect select, direction select (only for slide),
  duration and delay number fields (ms), easing select, remove ×.
- Rows write through `applyRecipe` against the active page/component target.
- Multiple interactions per node are allowed.
- In Framer the label is "Effects"; keep that section name and position.

## Rendering

- **Editor canvas:** the node is drawn in its final state. No animation runs
  while editing (Framer's canvas does not play effects on every render either);
  the Preview button shows them.
- **Preview:** the preview already mounts the page through publish mode with
  `buildPageCss`; effects therefore play there.
- **Static publish:** the CSS builder emits:
  - Appear: a `@keyframes` block and an `animation` on the node class with
    duration, delay and easing. Final state is opacity 1 / transform none.
  - Hover: a `:hover` rule with the target state and a `transition` on the base
    node rule.
  - Tap: the same with `:active`.
  - Fade: opacity 0 -> 1 (appear) or opacity target on hover/tap.
  - Slide: translate from the opposite direction (appear) or a small offset on
    hover/tap; direction up/down/left/right.
  - Scale: 0.95 -> 1 (appear) or 1 -> 1.03 on hover/tap.
- Interactions must not break component instances or variants: the effect lives
  on the instance wrapper's class and is emitted with that node's CSS.
- Publish HTML/markup is unchanged; only CSS is added.

## Implementation notes

- CSS uses the first interaction per trigger. Multiple interactions of other
  triggers are kept in the document for future effects work.
- Appear keyframes are emitted once per page; hover/active rules and the base
  transition repeat in each breakpoint rule set (the styles are resolved per
  breakpoint).
- The editor canvas shows the final design state; Preview and published pages
  animate.
- Interactions live on the node wrapper, including component instances.
- Scroll, drag, loop, custom easing and multiple effects per trigger are out.

## Acceptance

- Model tests for add/update/remove and validation.
- Renderer tests asserting keyframes, hover/active rules and transition in
  `buildPageCss`, including for a component instance.
- Browser: add an Appear Fade and Hover Scale to a frame; Preview plays the
  appear animation and hover scales; publish output contains the same CSS and
  plays when opened.
- Existing tests remain green; `npm run check` passes.
