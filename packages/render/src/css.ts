import type {
  BoxProps,
  Interaction,
  InteractionDirection,
  Page,
  Project,
  SceneNode,
} from "@webfm/model";
import { resolveNodeProps } from "@webfm/model";
import type { CSSProperties } from "react";
import { createAssetUrlResolver } from "./assets";
import { resolveComponentInstance, resolveInstanceBox } from "./components";
import { firstInteraction } from "./interactions";
import {
  type AssetUrlResolver,
  imageClassName,
  nodeClassName,
  resolveBoxStyles,
  resolveFillStyles,
  resolveImageStyles,
  resolveTextContainerStyles,
  resolveTextStyles,
  textClassName,
} from "./styles";
import type { RenderOptions, StyleContext } from "./types";

const RESET_CSS = `*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
}

body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

img {
  display: block;
  max-width: 100%;
}`;

interface ChildRule {
  className: string;
  styles: CSSProperties;
}

interface StyleEntry {
  className: string;
  styles: CSSProperties;
  interactions: Interaction[];
  text?: ChildRule;
  image?: ChildRule;
}

function kebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

/** Serialises a style object into CSS declarations. */
export function styleToCss(style: CSSProperties): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    parts.push(`${kebabCase(key)}: ${String(value)};`);
  }
  return parts.join(" ");
}

/** One CSS rule, or an empty string when the style has no declarations. */
export function rule(selector: string, style: CSSProperties): string {
  const declarations = styleToCss(style);
  return declarations ? `${selector} { ${declarations} }` : "";
}

function childContext(props: BoxProps): StyleContext {
  return {
    parentLayout: props.layout.mode,
    parentDirection: props.layout.direction,
    renderMode: "publish",
  };
}

/* --------------------------------------------------------------- interactions */

/** CSS-safe keyframes name for an interaction animation. */
function animationName(
  interactionId: string,
  kind: "appear" | "scroll",
  breakpointId?: string,
): string {
  const safe = interactionId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  const suffix = breakpointId
    ? `-${breakpointId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-")}`
    : "";
  return `wfm-${safe}-${kind}${suffix}`;
}

/** Escapes an interaction id for use inside a double-quoted attribute selector. */
function cssAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Offset from the direction the element slides in from or towards. */
function slideTransform(direction: InteractionDirection, distance: number): string {
  switch (direction) {
    case "up":
      return `translate3d(0, ${distance}px, 0)`;
    case "down":
      return `translate3d(0, -${distance}px, 0)`;
    case "left":
      return `translate3d(${distance}px, 0, 0)`;
    case "right":
      return `translate3d(-${distance}px, 0, 0)`;
  }
}

function baseOpacity(styles: CSSProperties): number {
  return typeof styles.opacity === "number" ? styles.opacity : 1;
}

function baseTransform(styles: CSSProperties): string | undefined {
  return typeof styles.transform === "string" ? styles.transform : undefined;
}

function interactionTransition(interaction: Interaction): string {
  const timing = `${interaction.duration}ms ${interaction.easing} ${interaction.delay}ms`;
  return `opacity ${timing}, transform ${timing}`;
}

function appearAnimation(interaction: Interaction, breakpointId?: string): string {
  return `${animationName(interaction.id, "appear", breakpointId)} ${interaction.duration}ms ${interaction.easing} ${interaction.delay}ms both`;
}

function scrollAnimation(interaction: Interaction, breakpointId?: string): string {
  // `backwards` covers the delay without leaving the finished animation
  // filling opacity/transform forever, which would pin :hover/:active.
  return `${animationName(interaction.id, "scroll", breakpointId)} ${interaction.duration}ms ${interaction.easing} ${interaction.delay}ms backwards`;
}

/** Base styles plus the node's appear animation and hover/tap transition. */
function stylesWithInteractions(entry: StyleEntry, breakpointId?: string): CSSProperties {
  const styles: CSSProperties = { ...entry.styles };

  const appear = firstInteraction(entry.interactions, "appear");
  // Scroll has its own reveal animation; a node carrying both uses scroll and
  // must not have the appear animation overwritten (or compete) on reveal.
  const scroll = firstInteraction(entry.interactions, "scroll");
  if (appear && !scroll) styles.animation = appearAnimation(appear, breakpointId);

  // One transition covers both properties; hover wins when both are present.
  const transition =
    firstInteraction(entry.interactions, "hover") ?? firstInteraction(entry.interactions, "tap");
  if (transition) styles.transition = interactionTransition(transition);

  return styles;
}

/** Target state for a hover or tap rule. */
function interactionStateStyles(
  interaction: Interaction,
  base: CSSProperties,
  tap: boolean,
): CSSProperties {
  switch (interaction.effect) {
    case "fade": {
      const opacity = tap ? 0.5 : baseOpacity(base) < 1 ? baseOpacity(base) * 0.6 : 0.6;
      return { opacity: Number(opacity.toFixed(3)) };
    }
    case "slide":
      return { transform: slideTransform(interaction.direction, tap ? 2 : 4) };
    case "scale":
      return { transform: `scale(${tap ? 0.97 : 1.03})` };
  }
}

/** One @keyframes block, preserving a base transform and opacity. */
function appearKeyframes(
  interaction: Interaction,
  base: CSSProperties,
  breakpointId?: string,
): string {
  const from: CSSProperties = { opacity: 0 };
  const to: CSSProperties = { opacity: baseOpacity(base) };
  const transform = baseTransform(base);

  switch (interaction.effect) {
    case "fade":
      if (transform) {
        from.transform = transform;
        to.transform = transform;
      }
      break;
    case "slide": {
      const offset = slideTransform(interaction.direction, 16);
      from.transform = transform ? `${offset} ${transform}` : offset;
      to.transform = transform ?? "none";
      break;
    }
    case "scale":
      from.transform = transform ? `scale(0.95) ${transform}` : "scale(0.95)";
      to.transform = transform ?? "none";
      break;
  }

  return `@keyframes ${animationName(interaction.id, "appear", breakpointId)} {\n  from { ${styleToCss(from)} }\n  to { ${styleToCss(to)} }\n}`;
}

/** The state a scroll layer starts in before it enters the viewport. */
function scrollInitialStyles(interaction: Interaction, base: CSSProperties): CSSProperties {
  const transform = baseTransform(base);
  switch (interaction.effect) {
    case "fade":
      return transform ? { opacity: 0, transform } : { opacity: 0 };
    case "slide": {
      const offset = slideTransform(interaction.direction, 16);
      return { opacity: 0, transform: transform ? `${offset} ${transform}` : offset };
    }
    case "scale":
      return {
        opacity: 0,
        transform: transform ? `scale(0.95) ${transform}` : "scale(0.95)",
      };
  }
}

/** The resolved final state a scroll layer settles in at one breakpoint. */
function scrollFinalStyles(base: CSSProperties): CSSProperties {
  return { opacity: baseOpacity(base), transform: baseTransform(base) ?? "none" };
}

/** One scroll @keyframes block; mirrors the appear end-state rules. */
function scrollKeyframes(
  interaction: Interaction,
  base: CSSProperties,
  breakpointId?: string,
): string {
  return `@keyframes ${animationName(interaction.id, "scroll", breakpointId)} {\n  from { ${styleToCss(scrollInitialStyles(interaction, base))} }\n  to { ${styleToCss(scrollFinalStyles(base))} }\n}`;
}

/**
 * Hidden start state and reveal animation for a scroll layer. The hidden rule
 * is scoped to `.wfm-js`, so a visitor without JavaScript always sees the
 * resolved final styles from the node rule.
 */
function scrollRules(entry: StyleEntry, breakpointId?: string): string[] {
  const scroll = firstInteraction(entry.interactions, "scroll");
  if (!scroll) return [];
  const selector = `.wfm-js [data-wfm-scroll="${cssAttributeValue(scroll.id)}"]`;
  const revealed = `${selector}.wfm-revealed`;
  const finalStyles = scrollFinalStyles(entry.styles);
  return [
    // The hidden state stops applying the moment the runtime reveals the layer,
    // so the node's base styles and :hover/:active rules win again.
    rule(`${selector}:not(.wfm-revealed)`, scrollInitialStyles(scroll, entry.styles)),
    rule(revealed, { animation: scrollAnimation(scroll, breakpointId) }),
    // Reduced motion: reveal instantly when in view, with no animation fill.
    `@media (prefers-reduced-motion: reduce) {\n  ${rule(revealed, { animation: "none" })}\n}`,
    // Printing has no scrolling: show every scroll layer in its final state.
    `@media print {\n  ${rule(selector, { animation: "none", ...finalStyles })}\n}`,
  ];
}

/**
 * Collects the styles of every rendered element at one breakpoint. The tree
 * walk mirrors the renderer, including component variant expansion.
 */
function collectEntries(
  project: Project,
  page: Page,
  breakpointId: string,
  resolveAssetUrl: AssetUrlResolver,
): StyleEntry[] {
  const entries = new Map<string, StyleEntry>();

  const visit = (node: SceneNode, context: StyleContext, depth: number): void => {
    if (!node.visible) return;
    const className = nodeClassName(node.id);

    switch (node.type) {
      case "frame": {
        const props = resolveNodeProps(node, breakpointId, project.breakpoints);
        entries.set(className, {
          className,
          styles: resolveBoxStyles(props, context, resolveAssetUrl),
          interactions: node.interactions ?? [],
        });
        for (const child of node.children) visit(child, childContext(props), depth);
        break;
      }
      case "text": {
        const props = resolveNodeProps(node, breakpointId, project.breakpoints);
        entries.set(className, {
          className,
          styles: resolveTextContainerStyles(props, props.text, context, resolveAssetUrl),
          interactions: node.interactions ?? [],
          text: { className: textClassName(node.id), styles: resolveTextStyles(props.text) },
        });
        break;
      }
      case "image": {
        const props = resolveNodeProps(node, breakpointId, project.breakpoints);
        entries.set(className, {
          className,
          styles: resolveBoxStyles(props, context, resolveAssetUrl),
          interactions: node.interactions ?? [],
          image: { className: imageClassName(node.id), styles: resolveImageStyles(props.image) },
        });
        break;
      }
      case "componentInstance": {
        if (depth > 8) break;
        const resolved = resolveComponentInstance(project, node);
        if (!resolved || !resolved.root.visible) break;

        const mergedProps = resolveInstanceBox(project, node, breakpointId, resolved.root);
        if (!mergedProps) break;
        entries.set(className, {
          className,
          styles: resolveBoxStyles(mergedProps, context, resolveAssetUrl),
          // The variant root is not rendered as its own element; its effects
          // belong to the instance wrapper. Instance effects win on conflicts.
          interactions: [
            ...(node.interactions ?? []),
            ...(resolved.root.interactions ?? []),
          ],
        });
        for (const child of resolved.root.children) {
          visit(child, childContext(mergedProps), depth + 1);
        }
        break;
      }
      default:
        break;
    }
  };

  visit(page.root, { parentLayout: "root", renderMode: "publish" }, 0);
  return [...entries.values()];
}

function rulesForEntries(entries: StyleEntry[], breakpointId?: string): string {
  const rules: string[] = [];
  for (const entry of entries) {
    rules.push(rule(`.${entry.className}`, stylesWithInteractions(entry, breakpointId)));
    if (entry.text) rules.push(rule(`.${entry.text.className}`, entry.text.styles));
    if (entry.image) rules.push(rule(`.${entry.image.className}`, entry.image.styles));

    const hover = firstInteraction(entry.interactions, "hover");
    if (hover) {
      rules.push(
        rule(`.${entry.className}:hover`, interactionStateStyles(hover, entry.styles, false)),
      );
    }
    const tap = firstInteraction(entry.interactions, "tap");
    if (tap) {
      rules.push(
        rule(`.${entry.className}:active`, interactionStateStyles(tap, entry.styles, true)),
      );
    }
    rules.push(...scrollRules(entry, breakpointId));
  }
  return rules.filter(Boolean).join("\n");
}

/** Interaction keyframes are page-wide; emit each interaction once. */
function keyframesForEntries(entries: StyleEntry[], breakpointId?: string): string[] {
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const entry of entries) {
    const appear = firstInteraction(entry.interactions, "appear");
    if (appear && !seen.has(`appear:${appear.id}`)) {
      seen.add(`appear:${appear.id}`);
      blocks.push(appearKeyframes(appear, entry.styles, breakpointId));
    }
    const scroll = firstInteraction(entry.interactions, "scroll");
    if (scroll && !seen.has(`scroll:${scroll.id}`)) {
      seen.add(`scroll:${scroll.id}`);
      blocks.push(scrollKeyframes(scroll, entry.styles, breakpointId));
    }
  }
  return blocks;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

/**
 * Builds the publish stylesheet for a page.
 *
 * Breakpoint media blocks are DISJOINT, and each block contains fully resolved
 * styles for its breakpoint. That matters when a narrower breakpoint removes a
 * declaration present in a wider one (e.g. a gradient fill replaced by a solid
 * fill): if the wider rule also matched, its background-image would still paint
 * over the solid color. The primary block therefore starts at its width, the
 * middle blocks are bounded on both sides, and the narrowest block is
 * `max-width` only so it also covers viewports below its width.
 *
 * Appear and scroll keyframes bake the resolved opacity/transform into their
 * end state, so each breakpoint gets its own keyframes block and animation
 * name. Scroll layers are hidden only under the `.wfm-js` root class, which the
 * runtime script adds, so a no-JS visitor sees the final content.
 */
export function buildPageCss(project: Project, page: Page, options: RenderOptions): string {
  const resolveAssetUrl = createAssetUrlResolver(project, options);
  const chunks: string[] = [RESET_CSS];

  chunks.push(
    rule(".wfm-page", {
      position: "relative",
      ...resolveFillStyles(page.background, resolveAssetUrl),
    }),
  );

  const breakpoints = project.breakpoints;
  const primary = breakpoints[0];
  if (primary) {
    const entries = collectEntries(project, page, primary.id, resolveAssetUrl);
    const keyframes = keyframesForEntries(entries);
    if (keyframes.length > 0) chunks.push(keyframes.join("\n\n"));
    const body = rulesForEntries(entries);
    if (breakpoints.length > 1) {
      chunks.push(`@media (min-width: ${primary.width}px) {\n${indent(body)}\n}`);
    } else {
      chunks.push(body);
    }
  }

  for (let index = 1; index < breakpoints.length; index += 1) {
    const breakpoint = breakpoints[index]!;
    const previous = breakpoints[index - 1]!;
    const maxWidth = Math.max(0, previous.width - 1);
    const isNarrowest = index === breakpoints.length - 1;
    const query = isNarrowest
      ? `(max-width: ${maxWidth}px)`
      : `(max-width: ${maxWidth}px) and (min-width: ${breakpoint.width}px)`;
    const entries = collectEntries(project, page, breakpoint.id, resolveAssetUrl);
    const keyframes = keyframesForEntries(entries, breakpoint.id);
    if (keyframes.length > 0) chunks.push(keyframes.join("\n\n"));
    chunks.push(`@media ${query} {\n${indent(rulesForEntries(entries, breakpoint.id))}\n}`);
  }

  return chunks.filter(Boolean).join("\n\n");
}
