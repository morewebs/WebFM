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
import { resolveComponentInstance } from "./components";
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

/** First interaction for a trigger; Framer plays one effect per trigger. */
function firstInteraction(
  interactions: Interaction[],
  trigger: Interaction["trigger"],
): Interaction | undefined {
  return interactions.find((interaction) => interaction.trigger === trigger);
}

/** CSS-safe keyframes name for an interaction's appear animation. */
function appearAnimationName(interactionId: string): string {
  const safe = interactionId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `wfm-${safe}-appear`;
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

function appearAnimation(interaction: Interaction): string {
  return `${appearAnimationName(interaction.id)} ${interaction.duration}ms ${interaction.easing} ${interaction.delay}ms both`;
}

/** Base styles plus the node's appear animation and hover/tap transition. */
function stylesWithInteractions(entry: StyleEntry): CSSProperties {
  const styles: CSSProperties = { ...entry.styles };

  const appear = firstInteraction(entry.interactions, "appear");
  if (appear) styles.animation = appearAnimation(appear);

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
function appearKeyframes(interaction: Interaction, base: CSSProperties): string {
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

  return `@keyframes ${appearAnimationName(interaction.id)} {\n  from { ${styleToCss(from)} }\n  to { ${styleToCss(to)} }\n}`;
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
        const props = resolveNodeProps(node, breakpointId, project.breakpoints);
        const resolved = resolveComponentInstance(project, node);
        if (!resolved || !resolved.root.visible) break;

        const rootProps = resolveNodeProps(resolved.root, breakpointId, project.breakpoints);
        const mergedProps: BoxProps = {
          ...rootProps,
          position: props.position,
          size: props.size,
        };
        entries.set(className, {
          className,
          styles: resolveBoxStyles(mergedProps, context, resolveAssetUrl),
          interactions: node.interactions ?? [],
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

function rulesForEntries(entries: StyleEntry[]): string {
  const rules: string[] = [];
  for (const entry of entries) {
    rules.push(rule(`.${entry.className}`, stylesWithInteractions(entry)));
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
  }
  return rules.filter(Boolean).join("\n");
}

/** Appear keyframes are page-wide; emit each interaction once. */
function keyframesForEntries(entries: StyleEntry[]): string[] {
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const entry of entries) {
    const appear = firstInteraction(entry.interactions, "appear");
    if (!appear || seen.has(appear.id)) continue;
    seen.add(appear.id);
    blocks.push(appearKeyframes(appear, entry.styles));
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
 * The primary breakpoint is unscoped. Every smaller breakpoint becomes a
 * `@media (max-width: previousWidth - 1)` block containing fully resolved
 * styles, emitted widest to narrowest so the cascade matches the editor.
 * Interactions are not responsive: their animation and transition declarations
 * repeat in every rule set, while keyframes are emitted once per page.
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
    chunks.push(rulesForEntries(entries));
  }

  for (let index = 1; index < breakpoints.length; index += 1) {
    const breakpoint = breakpoints[index]!;
    const previous = breakpoints[index - 1]!;
    const maxWidth = Math.max(0, previous.width - 1);
    const entries = collectEntries(project, page, breakpoint.id, resolveAssetUrl);
    const body = indent(rulesForEntries(entries));
    chunks.push(`@media (max-width: ${maxWidth}px) {\n${body}\n}`);
  }

  return chunks.filter(Boolean).join("\n\n");
}
