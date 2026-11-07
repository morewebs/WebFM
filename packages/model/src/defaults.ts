import { createId } from "./ids";
import type {
  BoxProps,
  Breakpoint,
  BreakpointId,
  ComponentDefinition,
  ComponentInstanceNode,
  CornerRadius,
  DeepPartial,
  Fill,
  FrameNode,
  ImageNode,
  ImageProps,
  LayoutProps,
  Page,
  Project,
  Responsive,
  SceneNode,
  SizeProps,
  StyleProps,
  TextContent,
  TextNode,
  TextProps,
  TextStyleValues,
} from "./types";
import { SCHEMA_VERSION } from "./types";

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: "bp_desktop", name: "Desktop", width: 1200 },
  { id: "bp_tablet", name: "Tablet", width: 810 },
  { id: "bp_phone", name: "Phone", width: 390 },
];

export const PRIMARY_BREAKPOINT_ID: BreakpointId = DEFAULT_BREAKPOINTS[0]!.id;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeValue(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (Array.isArray(patch)) return patch.map((entry) => clone(entry));
  if (isPlainObject(patch) && isPlainObject(base)) {
    // Discriminated values are replaced as a whole when their variant changes.
    // "type" identifies a Fill variant; "mode" identifies a SizeValue variant
    // (only {mode, value} keys). LayoutProps also has a mode, but it carries
    // many other fields, so changing layout.mode must merge instead of
    // dropping the direction, padding, gap and grid fields.
    if ("type" in patch && "type" in base && patch.type !== base.type) {
      return clone(patch);
    }
    if ("mode" in patch && "mode" in base && patch.mode !== base.mode) {
      const keys = [...Object.keys(base), ...Object.keys(patch)];
      const isSizeValue = keys.every((key) => key === "mode" || key === "value");
      if (isSizeValue) return clone(patch);
    }
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = mergeValue(out[key], value);
    }
    return out;
  }
  return clone(patch);
}

/**
 * Deep-merges partial props over a complete base. Arrays are replaced, not
 * concatenated, so a shadow list override means the new list.
 */
export function mergeDeep<T>(base: T, ...partials: Array<DeepPartial<T> | undefined>): T {
  let out: unknown = clone(base);
  for (const partial of partials) {
    if (partial === undefined) continue;
    out = mergeValue(out, partial);
  }
  return out as T;
}

export function findBreakpoint(
  breakpoints: Breakpoint[],
  breakpointId: BreakpointId,
): Breakpoint | undefined {
  return breakpoints.find((breakpoint) => breakpoint.id === breakpointId);
}

/** Breakpoints from the primary one down to the active one, widest first. */
export function breakpointChain(
  breakpoints: Breakpoint[],
  breakpointId: BreakpointId,
): Breakpoint[] {
  const index = breakpoints.findIndex((breakpoint) => breakpoint.id === breakpointId);
  if (index === -1) return breakpoints.slice(0, 1);
  return breakpoints.slice(0, index + 1);
}

/**
 * Resolves a responsive value for a breakpoint using the Framer cascade:
 * base styles apply everywhere, then each smaller breakpoint overrides its
 * ancestors down to the active one.
 */
export function resolveResponsive<T>(
  responsive: Responsive<T>,
  breakpointId: BreakpointId,
  breakpoints: Breakpoint[],
): T {
  const chain = breakpointChain(breakpoints, breakpointId);
  const overrides = chain
    .slice(1)
    .map((breakpoint) => responsive.overrides[breakpoint.id])
    .filter((override): override is DeepPartial<T> => override !== undefined);
  return mergeDeep(responsive.base, ...overrides);
}

export function resolveNodeProps<P>(
  node: { responsive: Responsive<P> },
  breakpointId: BreakpointId,
  breakpoints: Breakpoint[],
): P {
  return resolveResponsive(node.responsive, breakpointId, breakpoints);
}

/* ---------------------------------------------------------------- factories */

export function createResponsive<T>(base: T): Responsive<T> {
  return { base, overrides: {} };
}

export function defaultLayout(): LayoutProps {
  return {
    mode: "none",
    direction: "vertical",
    gap: 10,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    align: "start",
    justify: "start",
    wrap: false,
    grid: { columns: 2, rows: 2, columnGap: 10, rowGap: 10 },
  };
}

export function defaultSize(width?: SizeProps["width"], height?: SizeProps["height"]): SizeProps {
  return {
    width: width ?? { mode: "fixed", value: 400 },
    height: height ?? { mode: "fixed", value: 400 },
    aspectRatio: null,
  };
}

export function defaultRadius(): CornerRadius {
  return { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
}

export function defaultFill(): Fill | null {
  return { type: "solid", color: "#ffffff", opacity: 1 };
}

export function defaultStyle(): StyleProps {
  return {
    fill: defaultFill(),
    border: null,
    radius: defaultRadius(),
    shadows: [],
    opacity: 1,
    overflow: "clip",
    blendMode: "normal",
    rotate: 0,
  };
}

export function defaultBoxProps(overrides: DeepPartial<BoxProps> = {}): BoxProps {
  return mergeDeep<BoxProps>(
    {
      layout: defaultLayout(),
      size: defaultSize(),
      position: { x: 0, y: 0 },
      style: defaultStyle(),
    },
    overrides,
  );
}

export function defaultTextProps(): TextProps {
  return {
    text: {
      content: "Text",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: 400,
      lineHeight: "auto",
      letterSpacing: 0,
      color: "#000000",
      align: "left",
      verticalAlign: "top",
      textTransform: "none",
      textDecoration: "none",
      italic: false,
      whiteSpace: "normal",
      truncate: false,
    },
  };
}

/** The subset of a text node's typography that a text style owns. */
export function textStyleValuesFromText(text: TextContent): TextStyleValues {
  return {
    fontFamily: text.fontFamily,
    fontSize: text.fontSize,
    fontWeight: text.fontWeight,
    lineHeight: text.lineHeight,
    letterSpacing: text.letterSpacing,
    color: text.color,
    align: text.align,
    textTransform: text.textTransform,
    textDecoration: text.textDecoration,
    italic: text.italic,
  };
}

export function defaultImageProps(): ImageProps {
  return {
    image: {
      assetId: null,
      src: "",
      alt: "",
      fit: "fill",
      positionX: 50,
      positionY: 50,
    },
  };
}

export interface CreateFrameOptions {
  id?: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  props?: DeepPartial<BoxProps>;
  children?: SceneNode[];
}

export function createFrame(options: CreateFrameOptions = {}): FrameNode {
  return {
    id: options.id ?? createId("node"),
    type: "frame",
    name: options.name ?? "Frame",
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    responsive: createResponsive(defaultBoxProps(options.props)),
    children: options.children ?? [],
  };
}

export interface CreateTextOptions {
  id?: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  content?: string;
  props?: DeepPartial<BoxProps & TextProps>;
}

export function createText(options: CreateTextOptions = {}): TextNode {
  const props = mergeDeep<BoxProps & TextProps>(
    {
      ...defaultBoxProps({
        size: { width: { mode: "hug" }, height: { mode: "hug" } },
        style: { fill: null },
      }),
      ...defaultTextProps(),
    },
    options.props ?? {},
  );
  if (options.content !== undefined) props.text.content = options.content;
  return {
    id: options.id ?? createId("node"),
    type: "text",
    name: options.name ?? (props.text.content.slice(0, 24) || "Text"),
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    responsive: createResponsive(props),
  };
}

export interface CreateImageOptions {
  id?: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  props?: DeepPartial<BoxProps & ImageProps>;
}

export function createImage(options: CreateImageOptions = {}): ImageNode {
  return {
    id: options.id ?? createId("node"),
    type: "image",
    name: options.name ?? "Image",
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    responsive: createResponsive(
      mergeDeep<BoxProps & ImageProps>(
        {
          ...defaultBoxProps({
            size: {
              width: { mode: "fixed", value: 400 },
              height: { mode: "fixed", value: 300 },
            },
          }),
          ...defaultImageProps(),
        },
        options.props ?? {},
      ),
    ),
  };
}

export interface CreateComponentInstanceOptions {
  id?: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  componentId: string;
  variantId?: string | null;
  propertyValues?: ComponentInstanceNode["propertyValues"];
  props?: DeepPartial<BoxProps>;
}

export function createComponentInstance(
  options: CreateComponentInstanceOptions,
): ComponentInstanceNode {
  return {
    id: options.id ?? createId("node"),
    type: "componentInstance",
    name: options.name ?? "Component",
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    responsive: createResponsive(
      mergeDeep<BoxProps>(
        defaultBoxProps({ size: { width: { mode: "hug" }, height: { mode: "hug" } } }),
        options.props ?? {},
      ),
    ),
    componentId: options.componentId,
    variantId: options.variantId ?? null,
    propertyValues: options.propertyValues ?? {},
  };
}

export function createComponentDefinition(options: {
  id?: string;
  name: string;
  root: FrameNode;
  variantName?: string;
}): ComponentDefinition {
  const variantId = createId("variant");
  return {
    id: options.id ?? createId("component"),
    name: options.name,
    variants: [{ id: variantId, name: options.variantName ?? "Default", root: options.root }],
    properties: [],
    bindings: [],
    defaultVariantId: variantId,
  };
}

export interface CreatePageOptions {
  id?: string;
  name?: string;
  path?: string;
  root?: FrameNode;
  background?: Fill | null;
  breakpoints?: Breakpoint[];
}

export function createPage(options: CreatePageOptions = {}): Page {
  const name = options.name ?? "Home";
  const root =
    options.root ??
    createFrame({
      name: "Desktop",
      props: {
        // Verified against the live editor: a new page root is a Desktop frame,
        // 1200 x 1000 Fixed, white, with overflow Clip.
        size: { width: { mode: "fixed", value: 1200 }, height: { mode: "fixed", value: 1000 } },
      },
    });
  for (const breakpoint of (options.breakpoints ?? []).slice(1)) {
    root.responsive.overrides[breakpoint.id] = {
      size: { width: { mode: "fixed", value: breakpoint.width } },
    };
  }
  return {
    id: options.id ?? createId("page"),
    name,
    path: options.path ?? "/",
    background: options.background === undefined ? defaultFill() : options.background,
    root,
    guides: [],
  };
}

export interface CreateProjectOptions {
  id?: string;
  name?: string;
  now?: string;
  pageName?: string;
  pagePath?: string;
  breakpoints?: Breakpoint[];
}

export function createProject(options: CreateProjectOptions = {}): Project {
  const now = options.now ?? new Date().toISOString();
  const breakpoints = clone(options.breakpoints ?? DEFAULT_BREAKPOINTS);
  const page = createPage({
    name: options.pageName,
    path: options.pagePath,
    breakpoints,
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? createId("proj"),
    name: options.name ?? "Untitled",
    createdAt: now,
    updatedAt: now,
    version: 1,
    breakpoints,
    pages: [page],
    components: [],
    assets: [],
    colorStyles: [],
    textStyles: [],
  };
}

/**
 * Fills in fields added after the first documents were written. The file store
 * returns parsed JSON, so a project saved before color or text styles existed
 * will not have `colorStyles` / `textStyles`.
 */
export function normalizeProject(project: Project): Project {
  if (Array.isArray(project.colorStyles) && Array.isArray(project.textStyles)) {
    return project;
  }
  return {
    ...project,
    colorStyles: Array.isArray(project.colorStyles) ? project.colorStyles : [],
    textStyles: Array.isArray(project.textStyles) ? project.textStyles : [],
  };
}
