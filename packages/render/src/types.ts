import type { Asset, BreakpointId, LayoutAxis, Page, Project, SceneNode } from "@webfm/model";
import type { CSSProperties, ReactElement } from "react";

export type RenderMode = "editor" | "publish";

export interface RenderOptions {
  breakpointId: BreakpointId;
  mode: RenderMode;
  /** Maps an asset record to a URL usable in the current environment. */
  assetUrl?: (asset: Asset) => string;
}

export interface PageViewProps {
  project: Project;
  page: Page;
  options: RenderOptions;
}

export interface StyleContext {
  /** Layout mode of the parent, or "root" for a page root. */
  parentLayout: "none" | "stack" | "grid" | "root";
  /** Main-axis direction of the parent when it is a stack. */
  parentDirection?: LayoutAxis;
}

export interface StyleResolver {
  box(props: import("@webfm/model").BoxProps, context: StyleContext): CSSProperties;
  text(text: import("@webfm/model").TextContent): CSSProperties;
  image(image: import("@webfm/model").ImageContent): CSSProperties;
}

export interface RenderTreeProps {
  project: Project;
  node: SceneNode;
  options: RenderOptions;
}
