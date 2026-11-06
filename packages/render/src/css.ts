import type { BoxProps, Page, Project, SceneNode } from "@webfm/model";
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
  };
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
        });
        for (const child of node.children) visit(child, childContext(props), depth);
        break;
      }
      case "text": {
        const props = resolveNodeProps(node, breakpointId, project.breakpoints);
        entries.set(className, {
          className,
          styles: resolveTextContainerStyles(props, props.text, context, resolveAssetUrl),
          text: { className: textClassName(node.id), styles: resolveTextStyles(props.text) },
        });
        break;
      }
      case "image": {
        const props = resolveNodeProps(node, breakpointId, project.breakpoints);
        entries.set(className, {
          className,
          styles: resolveBoxStyles(props, context, resolveAssetUrl),
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
        const mergedProps: BoxProps = { ...rootProps, position: props.position };
        entries.set(className, {
          className,
          styles: resolveBoxStyles(mergedProps, context, resolveAssetUrl),
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

  visit(page.root, { parentLayout: "root" }, 0);
  return [...entries.values()];
}

function rulesForEntries(entries: StyleEntry[]): string {
  const rules: string[] = [];
  for (const entry of entries) {
    rules.push(rule(`.${entry.className}`, entry.styles));
    if (entry.text) rules.push(rule(`.${entry.text.className}`, entry.text.styles));
    if (entry.image) rules.push(rule(`.${entry.image.className}`, entry.image.styles));
  }
  return rules.filter(Boolean).join("\n");
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
    chunks.push(rulesForEntries(collectEntries(project, page, primary.id, resolveAssetUrl)));
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
