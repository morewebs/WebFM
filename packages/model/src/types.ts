/**
 * WebFM document model.
 *
 * The model is plain JSON so a project can be stored, versioned, diffed and
 * published without a runtime dependency on the editor. Every visual property
 * that can change per breakpoint lives inside `Responsive<T>`.
 */

export type NodeId = string;
export type PageId = string;
export type BreakpointId = string;
export type ComponentId = string;
export type VariantId = string;
export type AssetId = string;
export type PropertyId = string;
export type ColorStyleId = string;
export type TextStyleId = string;

export type ISODateString = string;

export const SCHEMA_VERSION = 1 as const;

/* ------------------------------------------------------------------ project */

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** Monotonic server-side revision, used for optimistic concurrency. */
  version: number;
  /** Ordered widest to narrowest. The first breakpoint is the primary one. */
  breakpoints: Breakpoint[];
  pages: Page[];
  components: ComponentDefinition[];
  assets: Asset[];
  /**
   * Project-wide saved colors. Solid fills and text colors may reference one
   * through `styleId` / `colorStyleId`, but keep their own color and opacity so
   * rendering and publishing never need a project lookup.
   */
  colorStyles: ColorStyle[];
  /**
   * Project-wide saved typography. Text nodes may reference one through
   * `textStyleId`, while every typography value stays denormalized on the node
   * so rendering and publishing never need a project lookup.
   */
  textStyles: TextStyle[];
  publish?: PublishConfig;
}

export interface ColorStyle {
  id: ColorStyleId;
  name: string;
  /** Hex color, e.g. "#0099ff". */
  color: string;
  /** 0..1 */
  opacity: number;
}

/** The typography fields a text style owns. */
export interface TextStyleValues {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  /** Pixels, or "auto" for the font's natural line height. */
  lineHeight: number | "auto";
  letterSpacing: number;
  color: string;
  align: TextAlign;
  textTransform: TextTransform;
  textDecoration: TextDecoration;
  italic: boolean;
}

/** A named, project-wide typography style. */
export interface TextStyle {
  id: TextStyleId;
  name: string;
  values: TextStyleValues;
}

export interface Breakpoint {
  id: BreakpointId;
  name: string;
  /** Canvas width in CSS pixels. */
  width: number;
}

/**
 * A horizontal or vertical editor guide. Positions are page coordinates:
 * `axis: "x"` is a vertical line at `position`, `axis: "y"` a horizontal line.
 * Guides are editor metadata only; the renderer and publish ignore them.
 */
export interface Guide {
  id: string;
  axis: "x" | "y";
  position: number;
}

export interface Page {
  id: PageId;
  name: string;
  /** Route path, always starting with "/". */
  path: string;
  background: Fill | null;
  root: FrameNode;
  /** Optional so projects authored before guides existed keep loading. */
  guides?: Guide[];
}

export interface PublishConfig {
  adapterId: string;
  options: Record<string, unknown>;
}

/* ---------------------------------------------------------------- responsive */

export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export interface Responsive<T> {
  base: T;
  /** Sparse per-breakpoint overrides. The primary breakpoint writes to base. */
  overrides: Record<BreakpointId, DeepPartial<T>>;
}

/* --------------------------------------------------------------------- nodes */

export type SceneNode = FrameNode | TextNode | ImageNode | ComponentInstanceNode;
export type NodeType = SceneNode["type"];

export type InteractionTrigger = "appear" | "scroll" | "hover" | "tap";
export type InteractionEffect = "fade" | "slide" | "scale";
export type InteractionDirection = "up" | "down" | "left" | "right";
export type InteractionEasing = "ease" | "linear" | "ease-in" | "ease-out";

/** One Appear, Scroll, Hover or Tap effect attached to a node. */
export interface Interaction {
  id: string;
  trigger: InteractionTrigger;
  effect: InteractionEffect;
  /** Slide direction; ignored for fade and scale. */
  direction: InteractionDirection;
  /** Milliseconds. */
  duration: number;
  /** Milliseconds. */
  delay: number;
  easing: InteractionEasing;
}

export interface NodeBase<P> {
  id: NodeId;
  name: string;
  visible: boolean;
  locked: boolean;
  responsive: Responsive<P>;
  /**
   * Ordered effects. Optional so projects authored before interactions existed
   * keep loading unchanged.
   */
  interactions?: Interaction[];
}

export interface FrameNode extends NodeBase<BoxProps> {
  type: "frame";
  children: SceneNode[];
}

export interface TextNode extends NodeBase<BoxProps & TextProps> {
  type: "text";
}

export interface ImageNode extends NodeBase<BoxProps & ImageProps> {
  type: "image";
}

export interface ComponentInstanceNode extends NodeBase<BoxProps> {
  type: "componentInstance";
  componentId: ComponentId;
  variantId: VariantId | null;
  propertyValues: Record<PropertyId, ComponentPropertyValue>;
  /**
   * Sparse style overrides layered over the variant root's resolved style.
   * Optional so projects authored before instance overrides keep loading.
   * The instance's own `responsive` owns position and size only.
   */
  styleOverrides?: Responsive<DeepPartial<StyleProps>>;
}

/* --------------------------------------------------------------------- props */

export interface BoxProps {
  layout: LayoutProps;
  size: SizeProps;
  position: PositionProps;
  style: StyleProps;
}

export type LayoutMode = "none" | "stack" | "grid";
export type LayoutAxis = "horizontal" | "vertical";
export type LayoutAlignment = "start" | "center" | "end" | "stretch";
export type LayoutDistribution =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GridLayout {
  columns: number;
  rows: number;
  columnGap: number;
  rowGap: number;
}

export interface LayoutProps {
  mode: LayoutMode;
  direction: LayoutAxis;
  gap: number;
  padding: Padding;
  align: LayoutAlignment;
  justify: LayoutDistribution;
  wrap: boolean;
  grid: GridLayout;
}

export type SizeMode = "fixed" | "fill" | "hug" | "relative" | "viewport";

export interface SizeValue {
  mode: SizeMode;
  /** Pixels for fixed, percentage 0-100 for relative. */
  value?: number;
}

export interface SizeProps {
  width: SizeValue;
  height: SizeValue;
  minWidth?: number | null;
  maxWidth?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;
  aspectRatio?: number | null;
}

export type PositionMode = "relative" | "absolute" | "fixed" | "sticky";

export interface PositionProps {
  x: number;
  y: number;
  zIndex?: number;
  /**
   * How the node participates in its parent's layout. Optional so projects
   * authored before positioning modes existed keep their current behavior.
   */
  mode?: PositionMode;
}

export type ImageFit = "fill" | "fit" | "crop";
export type BorderStyle = "solid" | "dashed" | "dotted";
export type Overflow = "visible" | "hidden" | "clip" | "scroll" | "auto";
export type TextAlign = "left" | "center" | "right" | "justify";
export type VerticalAlign = "top" | "center" | "bottom";
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
export type TextDecoration = "none" | "underline" | "line-through";
export type WhiteSpace = "normal" | "nowrap" | "pre-wrap";

export interface GradientStop {
  color: string;
  /** 0-100 */
  position: number;
}

export type Fill =
  | {
      type: "solid";
      color: string;
      opacity: number;
      /** Linked color style; null/absent means unlinked. */
      styleId?: ColorStyleId | null;
    }
  | { type: "linear-gradient"; angle: number; stops: GradientStop[] }
  | { type: "radial-gradient"; stops: GradientStop[] }
  | {
      type: "image";
      assetId: AssetId | null;
      src: string;
      fit: ImageFit;
      positionX: number;
      positionY: number;
    };

export interface Border {
  width: number;
  color: string;
  style: BorderStyle;
}

export interface CornerRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
}

export interface StyleProps {
  fill: Fill | null;
  border: Border | null;
  radius: CornerRadius;
  shadows: Shadow[];
  opacity: number;
  overflow: Overflow;
  /** Per-axis overrides; null or absent falls back to `overflow`. */
  overflowX?: Overflow | null;
  overflowY?: Overflow | null;
  blendMode: string;
  /** Degrees. */
  rotate: number;
}

export interface TextProps {
  text: TextContent;
  /** Linked color style for the text color; null/absent means unlinked. */
  colorStyleId?: ColorStyleId | null;
  /** Linked text style for the typography; null/absent means unlinked. */
  textStyleId?: TextStyleId | null;
}

export interface TextContent {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  /** Pixels, or "auto" for the font's natural line height. */
  lineHeight: number | "auto";
  letterSpacing: number;
  color: string;
  align: TextAlign;
  verticalAlign: VerticalAlign;
  textTransform: TextTransform;
  textDecoration: TextDecoration;
  italic: boolean;
  whiteSpace: WhiteSpace;
  truncate: boolean;
}

export interface ImageProps {
  image: ImageContent;
}

export interface ImageContent {
  assetId: AssetId | null;
  /** External URL, used when assetId is null. */
  src: string;
  alt: string;
  fit: ImageFit;
  positionX: number;
  positionY: number;
}

/* ---------------------------------------------------------------- components */

export interface ComponentDefinition {
  id: ComponentId;
  name: string;
  variants: ComponentVariant[];
  properties: ComponentProperty[];
  bindings: PropertyBinding[];
  defaultVariantId: VariantId;
}

export interface ComponentVariant {
  id: VariantId;
  name: string;
  root: FrameNode;
}

export type ComponentProperty =
  | { id: PropertyId; name: string; type: "boolean"; defaultValue: boolean }
  | {
      id: PropertyId;
      name: string;
      type: "text";
      defaultValue: string;
      control: "text" | "textarea";
    }
  | {
      id: PropertyId;
      name: string;
      type: "number";
      defaultValue: number;
      min?: number;
      max?: number;
      step?: number;
    }
  | { id: PropertyId; name: string; type: "color"; defaultValue: string }
  | {
      id: PropertyId;
      name: string;
      type: "enum";
      defaultValue: string;
      options: string[];
    }
  | { id: PropertyId; name: string; type: "variant"; defaultValue: VariantId };

export type ComponentPropertyValue = boolean | string | number;

/** Connects a component property to a path inside one of the variant's nodes. */
export interface PropertyBinding {
  propertyId: PropertyId;
  nodeId: NodeId;
  /** Dot path inside the node's resolved props, e.g. "text.content". */
  path: string;
}

/* -------------------------------------------------------------------- assets */

export interface Asset {
  id: AssetId;
  name: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  /** Server-relative URL used by the editor and by published output. */
  url: string;
  createdAt: ISODateString;
}

/* ------------------------------------------------------------------ summaries */

/** Lightweight project record for the project browser. */
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  version: number;
  pageCount: number;
  thumbnailUrl?: string;
}

/* ------------------------------------------------------------------- targets */

/**
 * Addresses either a page or one variant of a component. The two shapes are
 * mutually exclusive so callers cannot accidentally mix page and component ids.
 */
export type SceneTarget =
  | { pageId: PageId; componentId?: never; variantId?: never }
  | { componentId: ComponentId; variantId?: VariantId; pageId?: never };

/** A node together with the page or component variant that contains it. */
export type NodeLocation = SceneTarget & { nodeId: NodeId };
