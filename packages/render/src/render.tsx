import type {
  BoxProps,
  ComponentInstanceNode,
  ImageContent,
  ImageNode,
  Project,
  SceneNode,
  TextNode,
} from "@webfm/model";
import { resolveNodeProps } from "@webfm/model";
import { type CSSProperties, Fragment, type ReactElement, type ReactNode } from "react";
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
import type { PageViewProps, RenderMode, RenderOptions, StyleContext } from "./types";

const IMAGE_PLACEHOLDER: CSSProperties = {
  width: "100%",
  height: "100%",
  backgroundColor: "#e5e7eb",
  border: "1px dashed #9ca3af",
};

/** Editor-only attributes; publish markup stays free of editor hooks. */
function nodeDataAttributes(node: SceneNode, mode: RenderMode): Record<string, string> {
  if (mode !== "editor") return {};
  return {
    "data-node-id": node.id,
    "data-node-type": node.type,
    "data-node-name": node.name,
    "data-node-locked": node.locked ? "true" : "false",
  };
}

function resolveImageSource(image: ImageContent, resolveAssetUrl: AssetUrlResolver): string | null {
  if (image.assetId) {
    const url = resolveAssetUrl(image.assetId);
    if (url) return url;
  }
  return image.src.trim() ? image.src : null;
}

function childContext(props: BoxProps): StyleContext {
  return {
    parentLayout: props.layout.mode,
    parentDirection: props.layout.direction,
  };
}

function renderFrame(
  node: Extract<SceneNode, { type: "frame" }>,
  props: BoxProps,
  project: Project,
  options: RenderOptions,
  context: StyleContext,
  resolveAssetUrl: AssetUrlResolver,
  depth: number,
): ReactElement {
  const editor = options.mode === "editor";
  return (
    <div
      className={nodeClassName(node.id)}
      style={editor ? resolveBoxStyles(props, context, resolveAssetUrl) : undefined}
      {...nodeDataAttributes(node, options.mode)}
    >
      {node.children.map((child) => (
        <Fragment key={child.id}>
          {renderNodeInternal(child, project, options, childContext(props), resolveAssetUrl, depth)}
        </Fragment>
      ))}
    </div>
  );
}

function renderText(
  node: TextNode,
  props: TextNode["responsive"]["base"],
  options: RenderOptions,
  context: StyleContext,
  resolveAssetUrl: AssetUrlResolver,
): ReactElement {
  const editor = options.mode === "editor";
  return (
    <div
      className={nodeClassName(node.id)}
      style={
        editor ? resolveTextContainerStyles(props, props.text, context, resolveAssetUrl) : undefined
      }
      {...nodeDataAttributes(node, options.mode)}
    >
      <div
        className={textClassName(node.id)}
        style={editor ? resolveTextStyles(props.text) : undefined}
      >
        {props.text.content}
      </div>
    </div>
  );
}

function renderImage(
  node: ImageNode,
  props: ImageNode["responsive"]["base"],
  options: RenderOptions,
  context: StyleContext,
  resolveAssetUrl: AssetUrlResolver,
): ReactElement {
  const editor = options.mode === "editor";
  const src = resolveImageSource(props.image, resolveAssetUrl);
  return (
    <div
      className={nodeClassName(node.id)}
      style={editor ? resolveBoxStyles(props, context, resolveAssetUrl) : undefined}
      {...nodeDataAttributes(node, options.mode)}
    >
      {src ? (
        <img
          className={imageClassName(node.id)}
          style={editor ? resolveImageStyles(props.image) : undefined}
          src={src}
          alt={props.image.alt}
        />
      ) : (
        <div
          className={imageClassName(node.id)}
          style={editor ? IMAGE_PLACEHOLDER : undefined}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function renderComponentInstance(
  node: ComponentInstanceNode,
  props: ComponentInstanceNode["responsive"]["base"],
  project: Project,
  options: RenderOptions,
  context: StyleContext,
  resolveAssetUrl: AssetUrlResolver,
  depth: number,
): ReactNode {
  const editor = options.mode === "editor";
  const resolved = depth <= 8 ? resolveComponentInstance(project, node) : null;

  if (!resolved || !resolved.root.visible) {
    if (!editor) return null;
    const placeholder: CSSProperties = {
      ...resolveBoxStyles(props, context, resolveAssetUrl),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "1px dashed #9ca3af",
      color: "#6b7280",
      fontSize: "12px",
      padding: "8px",
      overflow: "hidden",
    };
    return (
      <div
        className={nodeClassName(node.id)}
        style={placeholder}
        {...nodeDataAttributes(node, options.mode)}
      >
        {node.name}
      </div>
    );
  }

  const rootProps = resolveNodeProps(resolved.root, options.breakpointId, project.breakpoints);
  // The variant root supplies layout and appearance; the instance owns its box.
  const mergedProps: BoxProps = {
    ...rootProps,
    position: props.position,
    size: props.size,
  };

  return (
    <div
      className={nodeClassName(node.id)}
      style={editor ? resolveBoxStyles(mergedProps, context, resolveAssetUrl) : undefined}
      {...nodeDataAttributes(node, options.mode)}
    >
      {resolved.root.children.map((child) => (
        <Fragment key={child.id}>
          {renderNodeInternal(
            child,
            project,
            options,
            childContext(mergedProps),
            resolveAssetUrl,
            depth + 1,
          )}
        </Fragment>
      ))}
    </div>
  );
}

function renderNodeInternal(
  node: SceneNode,
  project: Project,
  options: RenderOptions,
  context: StyleContext,
  resolveAssetUrl: AssetUrlResolver,
  depth: number,
): ReactNode {
  if (!node.visible) return null;

  switch (node.type) {
    case "frame": {
      const props = resolveNodeProps(node, options.breakpointId, project.breakpoints);
      return renderFrame(node, props, project, options, context, resolveAssetUrl, depth);
    }
    case "text": {
      const props = resolveNodeProps(node, options.breakpointId, project.breakpoints);
      return renderText(node, props, options, context, resolveAssetUrl);
    }
    case "image": {
      const props = resolveNodeProps(node, options.breakpointId, project.breakpoints);
      return renderImage(node, props, options, context, resolveAssetUrl);
    }
    case "componentInstance": {
      const props = resolveNodeProps(node, options.breakpointId, project.breakpoints);
      return renderComponentInstance(
        node,
        props,
        project,
        options,
        context,
        resolveAssetUrl,
        depth,
      );
    }
    default:
      return null;
  }
}

/** Renders a single node subtree. Exposed for tests and editor tooling. */
export function renderNode(node: SceneNode, project: Project, options: RenderOptions): ReactNode {
  return renderNodeInternal(
    node,
    project,
    options,
    { parentLayout: "root" },
    createAssetUrlResolver(project, options),
    0,
  );
}

/**
 * The shared page renderer. In editor mode every element carries inline styles
 * and `data-node-*` attributes; in publish mode it carries only stable classes,
 * leaving all styling to `buildPageCss`.
 */
export function PageView({ project, page, options }: PageViewProps): ReactElement {
  const resolveAssetUrl = createAssetUrlResolver(project, options);
  const pageStyle: CSSProperties | undefined =
    options.mode === "editor"
      ? { position: "relative", ...resolveFillStyles(page.background, resolveAssetUrl) }
      : undefined;

  return (
    <div className="wfm-page" style={pageStyle}>
      {renderNodeInternal(
        page.root,
        project,
        options,
        { parentLayout: "root" },
        resolveAssetUrl,
        0,
      )}
    </div>
  );
}
