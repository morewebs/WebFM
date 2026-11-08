import type {
  BoxProps,
  Fill,
  ImageContent,
  ImageFit,
  LayoutAlignment,
  LayoutAxis,
  LayoutDistribution,
  Padding,
  PositionProps,
  SizeValue,
  TextContent,
  VerticalAlign,
} from "@webfm/model";
import type { CSSProperties } from "react";
import type { StyleContext } from "./types";

/** Resolves an asset id to a URL usable in the current environment. */
export type AssetUrlResolver = (assetId: string) => string | null;

const ALIGN_ITEMS: Record<LayoutAlignment, CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
};

const JUSTIFY_CONTENT: Record<LayoutDistribution, CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly",
};

const TEXT_ALIGN_ITEMS: Record<VerticalAlign, CSSProperties["alignItems"]> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

const BACKGROUND_SIZE: Record<ImageFit, string> = {
  fill: "100% 100%",
  fit: "contain",
  crop: "cover",
};

const OBJECT_FIT: Record<ImageFit, CSSProperties["objectFit"]> = {
  fill: "fill",
  fit: "contain",
  crop: "cover",
};

/**
 * A stable, CSS-safe class for a node. Ids are usually URL-safe already, but
 * published markup must not depend on that.
 */
export function nodeClassName(nodeId: string): string {
  const safe = nodeId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `wfm-${safe}`;
}

export function textClassName(nodeId: string): string {
  return `${nodeClassName(nodeId)}-text`;
}

export function imageClassName(nodeId: string): string {
  return `${nodeClassName(nodeId)}-img`;
}

/* -------------------------------------------------------------------- color */

function formatAlpha(value: number): string {
  return String(Number(Math.min(1, Math.max(0, value)).toFixed(3)));
}

/**
 * Applies an opacity to a color, keeping a valid CSS color. Hex and rgb(a)
 * colors are converted to rgba; anything else is returned unchanged so an
 * unrecognised color never becomes invalid CSS.
 */
export function withAlpha(color: string, opacity: number): string {
  const alpha = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
  if (alpha >= 1) return color;

  const trimmed = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split("")
        .map((digit) => digit + digit)
        .join("");
    }
    const red = Number.parseInt(digits.slice(0, 2), 16);
    const green = Number.parseInt(digits.slice(2, 4), 16);
    const blue = Number.parseInt(digits.slice(4, 6), 16);
    const sourceAlpha = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return `rgba(${red}, ${green}, ${blue}, ${formatAlpha(alpha * sourceAlpha)})`;
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(trimmed);
  if (rgb) {
    const parts = rgb[1]!
      .split(/[,/]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      const red = Number.parseInt(parts[0]!, 10);
      const green = Number.parseInt(parts[1]!, 10);
      const blue = Number.parseInt(parts[2]!, 10);
      const sourceAlpha = parts.length >= 4 ? Number.parseFloat(parts[3]!) : 1;
      if (![red, green, blue].some(Number.isNaN) && !Number.isNaN(sourceAlpha)) {
        return `rgba(${red}, ${green}, ${blue}, ${formatAlpha(alpha * sourceAlpha)})`;
      }
    }
  }

  return color;
}

function gradientStops(stops: Array<{ color: string; position: number }>): string {
  return stops.map((stop) => `${stop.color} ${stop.position}%`).join(", ");
}

function cssUrl(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "");
}

/* --------------------------------------------------------------------- fill */

/** Background properties for a fill (solid, gradient or image). */
export function resolveFillStyles(
  fill: Fill | null,
  resolveAssetUrl?: AssetUrlResolver,
): CSSProperties {
  if (!fill) return {};

  switch (fill.type) {
    case "solid":
      return { backgroundColor: withAlpha(fill.color, fill.opacity) };
    case "linear-gradient":
      return {
        backgroundImage: `linear-gradient(${fill.angle}deg, ${gradientStops(fill.stops)})`,
      };
    case "radial-gradient":
      return {
        backgroundImage: `radial-gradient(circle, ${gradientStops(fill.stops)})`,
      };
    case "image": {
      const resolved = fill.assetId && resolveAssetUrl ? resolveAssetUrl(fill.assetId) : null;
      const src = resolved ?? fill.src;
      if (!src) return {};
      return {
        backgroundImage: `url("${cssUrl(src)}")`,
        backgroundSize: BACKGROUND_SIZE[fill.fit],
        backgroundPosition: `${fill.positionX}% ${fill.positionY}%`,
        backgroundRepeat: "no-repeat",
      };
    }
    default:
      return {};
  }
}

/* --------------------------------------------------------------------- size */

function sizeToCss(size: SizeValue, axis: "width" | "height"): string {
  switch (size.mode) {
    case "fixed":
      return `${size.value ?? 0}px`;
    case "fill":
      return "100%";
    case "hug":
      return "fit-content";
    case "relative":
      return `${size.value ?? 0}%`;
    case "viewport":
      return `${size.value ?? 100}${axis === "height" ? "vh" : "vw"}`;
    default:
      return "auto";
  }
}

function paddingToCss(padding: Padding | undefined): string {
  const value = padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return `${value.top}px ${value.right}px ${value.bottom}px ${value.left}px`;
}

/** Flex growth for a fill child of a stack, along the stack's main axis. */
function flexChildStyles(props: BoxProps, context: StyleContext): CSSProperties {
  if (context.parentLayout !== "stack") return {};

  const style: CSSProperties = {};
  const direction: LayoutAxis = context.parentDirection ?? "horizontal";
  const widthFill = props.size.width.mode === "fill";
  const heightFill = props.size.height.mode === "fill";

  if (direction === "vertical") {
    if (heightFill) {
      style.flexGrow = 1;
      style.flexBasis = 0;
    }
    if (widthFill) style.alignSelf = "stretch";
  } else {
    if (widthFill) {
      style.flexGrow = 1;
      style.flexBasis = 0;
    }
    if (heightFill) style.alignSelf = "stretch";
  }

  return style;
}

function positionStyles(position: PositionProps, context: StyleContext): CSSProperties {
  const style: CSSProperties = {};

  // A page or variant root always establishes the containing block.
  if (context.parentLayout === "root") {
    style.position = "relative";
    if (position.zIndex !== undefined) style.zIndex = position.zIndex;
    return style;
  }

  const mode = position.mode ?? (context.parentLayout === "none" ? "absolute" : "relative");

  switch (mode) {
    case "absolute":
      style.position = "absolute";
      style.left = `${position.x}px`;
      style.top = `${position.y}px`;
      break;
    case "relative":
      style.position = "relative";
      // Explicit relative positioning offsets by x/y. The implicit default for
      // stack/grid children keeps the old behavior without an offset.
      if (position.mode === "relative") {
        style.left = `${position.x}px`;
        style.top = `${position.y}px`;
      }
      break;
    case "fixed":
      // The editor canvas uses page coordinates, so fixed behaves like absolute
      // there; only published output keeps the element attached to the viewport.
      style.position = context.renderMode === "publish" ? "fixed" : "absolute";
      style.left = `${position.x}px`;
      style.top = `${position.y}px`;
      break;
    case "sticky":
      style.position = "sticky";
      style.top = `${position.y}px`;
      style.left = `${position.x}px`;
      break;
  }

  if (position.zIndex !== undefined) style.zIndex = position.zIndex;
  return style;
}

/* ---------------------------------------------------------------------- box */

/** Resolves box, layout and fill props into CSS. Shared by editor and publish. */
export function resolveBoxStyles(
  props: BoxProps,
  context: StyleContext,
  resolveAssetUrl?: AssetUrlResolver,
): CSSProperties {
  const style: CSSProperties = {};

  Object.assign(style, positionStyles(props.position, context));

  const layout = props.layout;
  if (layout.mode === "stack") {
    style.display = "flex";
    style.flexDirection = layout.direction === "horizontal" ? "row" : "column";
    style.gap = `${layout.gap}px`;
    style.padding = paddingToCss(layout.padding);
    style.alignItems = ALIGN_ITEMS[layout.align];
    style.justifyContent = JUSTIFY_CONTENT[layout.justify];
    if (layout.wrap) style.flexWrap = "wrap";
  } else if (layout.mode === "grid") {
    const grid = layout.grid ?? { columns: 1, rows: 1, columnGap: 0, rowGap: 0 };
    style.display = "grid";
    style.gridTemplateColumns = `repeat(${grid.columns}, minmax(0, 1fr))`;
    style.columnGap = `${grid.columnGap}px`;
    style.rowGap = `${grid.rowGap}px`;
    style.padding = paddingToCss(layout.padding);
  }

  const size = props.size;
  style.width = sizeToCss(size.width, "width");
  style.height = sizeToCss(size.height, "height");
  Object.assign(style, flexChildStyles(props, context));

  if (size.minWidth !== undefined && size.minWidth !== null) style.minWidth = `${size.minWidth}px`;
  if (size.maxWidth !== undefined && size.maxWidth !== null) style.maxWidth = `${size.maxWidth}px`;
  if (size.minHeight !== undefined && size.minHeight !== null) style.minHeight = `${size.minHeight}px`;
  if (size.maxHeight !== undefined && size.maxHeight !== null) style.maxHeight = `${size.maxHeight}px`;
  if (size.aspectRatio !== null && size.aspectRatio !== undefined) {
    style.aspectRatio = String(size.aspectRatio);
  }

  Object.assign(style, resolveFillStyles(props.style.fill, resolveAssetUrl));

  const border = props.style.border;
  if (border) style.border = `${border.width}px ${border.style} ${border.color}`;

  const radius = props.style.radius;
  if (
    radius.topLeft !== 0 ||
    radius.topRight !== 0 ||
    radius.bottomRight !== 0 ||
    radius.bottomLeft !== 0
  ) {
    style.borderTopLeftRadius = `${radius.topLeft}px`;
    style.borderTopRightRadius = `${radius.topRight}px`;
    style.borderBottomRightRadius = `${radius.bottomRight}px`;
    style.borderBottomLeftRadius = `${radius.bottomLeft}px`;
  }

  if (props.style.shadows.length > 0) {
    style.boxShadow = props.style.shadows
      .map(
        (shadow) =>
          `${shadow.inset ? "inset " : ""}${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`,
      )
      .join(", ");
  }

  if (props.style.opacity !== 1) style.opacity = props.style.opacity;
  const { overflowX, overflowY } = props.style;
  if (overflowX !== null && overflowX !== undefined) {
    // Per-axis overrides replace the shorthand; the unset axis inherits the
    // single overflow value.
    style.overflowX = overflowX;
    style.overflowY = overflowY ?? props.style.overflow;
  } else if (overflowY !== null && overflowY !== undefined) {
    style.overflowX = props.style.overflow;
    style.overflowY = overflowY;
  } else if (props.style.overflow !== "visible") {
    style.overflow = props.style.overflow;
  }
  if (props.style.blendMode && props.style.blendMode !== "normal") {
    style.mixBlendMode = props.style.blendMode as CSSProperties["mixBlendMode"];
  }
  if (props.style.rotate !== 0) style.transform = `rotate(${props.style.rotate}deg)`;

  return style;
}

/* --------------------------------------------------------------------- text */

function fontFamilyToCss(family: string): string {
  const value = family.trim();
  if (!value) return "inherit";
  if (/^["'].*["']$/.test(value)) return value;
  if (/^[a-zA-Z-]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** Typography for the inner text element. */
export function resolveTextStyles(text: TextContent): CSSProperties {
  const style: CSSProperties = {
    fontFamily: fontFamilyToCss(text.fontFamily),
    fontSize: `${text.fontSize}px`,
    fontWeight: text.fontWeight,
    // Framer's canvas resolves Auto to 1.2 x the font size (19.2px at 16px).
    lineHeight:
      text.lineHeight === "auto"
        ? `${Math.round(text.fontSize * 1.2 * 100) / 100}px`
        : `${text.lineHeight}px`,
    letterSpacing: `${text.letterSpacing}px`,
    color: text.color,
    textAlign: text.align,
    textTransform: text.textTransform,
    textDecoration: text.textDecoration,
    fontStyle: text.italic ? "italic" : "normal",
    whiteSpace: text.whiteSpace,
  };

  if (text.truncate) {
    style.overflow = "hidden";
    style.textOverflow = "ellipsis";
    style.whiteSpace = "nowrap";
  }

  return style;
}

/** The text node's outer box plus flex alignment for vertical alignment. */
export function resolveTextContainerStyles(
  props: BoxProps,
  text: TextContent,
  context: StyleContext,
  resolveAssetUrl?: AssetUrlResolver,
): CSSProperties {
  return {
    ...resolveBoxStyles(props, context, resolveAssetUrl),
    display: "flex",
    alignItems: TEXT_ALIGN_ITEMS[text.verticalAlign],
  };
}

/* -------------------------------------------------------------------- image */

/** Inner image element styles. The outer element carries the box styles. */
export function resolveImageStyles(image: ImageContent): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "block",
    objectFit: OBJECT_FIT[image.fit],
    objectPosition: `${image.positionX}% ${image.positionY}%`,
  };
}
