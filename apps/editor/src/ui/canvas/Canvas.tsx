/**
 * The editable canvas.
 *
 * The page is rendered by the shared renderer (`@webfm/render`) in editor mode
 * at the active breakpoint width. Everything visual around it — the breakpoint
 * bar, selection chrome, resize handles, the in-place text editor — is an
 * overlay measured from the rendered DOM. There is never a second node tree.
 */

import {
  type Asset,
  type BoxProps,
  type Breakpoint,
  createFrame,
  createImage,
  createText,
  type DeepPartial,
  type Fill,
  findNode,
  findParent,
  type Guide,
  isSelfOrDescendant,
  type NodeId,
  resolveNodeProps,
  type SceneNode,
  type SceneTarget,
  type TextContent,
  updateBoxProps,
} from "@webfm/model";
import { PageView, renderNode } from "@webfm/render";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { activeBreakpointOf, activeSceneOf, useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import { type EditorTool, useUIStore } from "../ui-store";
import { ComponentBar } from "./ComponentBar";
import {
  addRectTargets,
  computeSnap,
  computeSnapForEdges,
  type SnapEdge,
  type SnapLine,
  type SnapRect,
  type SnapTarget,
} from "./snapping";
import "./Canvas.css";

/* --------------------------------------------------------------- geometry */

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** Page top, in viewport pixels, below the canvas top at pan 0. */
export const STAGE_TOP = 160;
export const BREAKPOINT_BAR_HEIGHT = 30;
export const BREAKPOINT_BAR_GAP = 10;
export const NUDGE_STEP = 1;
export const NUDGE_STEP_LARGE = 10;
export const DRAW_THRESHOLD = 3;
export const DRAG_THRESHOLD = 2;
export const RULER_SIZE = 20;
export const RULER_MAJOR_STEP = 100;
export const RULER_MINOR_STEP = 10;
export const SNAP_THRESHOLD_SCREEN = 4;
export const GUIDE_GRAB_SIZE = 7;

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const RESIZE_HANDLES: ReadonlyArray<{ handle: ResizeHandle; x: number; y: number }> = [
  { handle: "nw", x: 0, y: 0 },
  { handle: "n", x: 0.5, y: 0 },
  { handle: "ne", x: 1, y: 0 },
  { handle: "e", x: 1, y: 0.5 },
  { handle: "se", x: 1, y: 1 },
  { handle: "s", x: 0.5, y: 1 },
  { handle: "sw", x: 0, y: 1 },
  { handle: "w", x: 0, y: 0.5 },
];

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Stage position for a page centered in the canvas area. */
export function centeredStageOffset(
  viewportWidth: number,
  pageWidth: number,
  zoom: number,
  pan: CanvasPoint,
): CanvasPoint {
  return {
    x: (viewportWidth - pageWidth * zoom) / 2 + pan.x,
    y: STAGE_TOP + pan.y,
  };
}

/** Converts a viewport point into unscaled page coordinates. */
export function viewportPointToPage(
  point: CanvasPoint,
  stageOffset: CanvasPoint,
  zoom: number,
): CanvasPoint {
  return { x: (point.x - stageOffset.x) / zoom, y: (point.y - stageOffset.y) / zoom };
}

/**
 * Pan needed to zoom around a pointer while keeping the page point under the
 * pointer fixed.
 */
export function zoomPanAtPointer(
  pointer: CanvasPoint,
  viewportWidth: number,
  pageWidth: number,
  zoom: number,
  nextZoom: number,
  pan: CanvasPoint,
): CanvasPoint {
  const before = centeredStageOffset(viewportWidth, pageWidth, zoom, pan);
  const pagePoint = viewportPointToPage(pointer, before, zoom);
  const stageX = pointer.x - pagePoint.x * nextZoom;
  const stageY = pointer.y - pagePoint.y * nextZoom;
  return {
    x: stageX - (viewportWidth - pageWidth * nextZoom) / 2,
    y: stageY - STAGE_TOP,
  };
}

/** Shift-drag constrains movement to the dominant axis. */
export function constrainDelta(dx: number, dy: number, shift: boolean): CanvasPoint {
  if (!shift) return { x: dx, y: dy };
  return Math.abs(dx) >= Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: dy };
}

/**
 * Resizes a rect from one of the eight handles. Coordinates are in the node's
 * parent space; `keepAspect` preserves the starting width/height ratio.
 */
export function resizeRect(
  start: CanvasRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepAspect: boolean,
): CanvasRect {
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");

  let left = start.left + (west ? dx : 0);
  let right = start.left + start.width + (east ? dx : 0);
  let top = start.top + (north ? dy : 0);
  let bottom = start.top + start.height + (south ? dy : 0);
  let width = right - left;
  let height = bottom - top;

  if (keepAspect && start.width > 0 && start.height > 0) {
    const aspect = start.width / start.height;
    if ((west || east) && (north || south)) {
      const scaleX = width / start.width;
      const scaleY = height / start.height;
      const scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
      width = start.width * scale;
      height = start.height * scale;
      if (west) left = right - width;
      else right = left + width;
      if (north) top = bottom - height;
      else bottom = top + height;
    } else if (west || east) {
      height = width / aspect;
      top = start.top + (start.height - height) / 2;
      bottom = top + height;
    } else {
      width = height * aspect;
      left = start.left + (start.width - width) / 2;
      right = left + width;
    }
  }

  if (width < 1) {
    width = 1;
    if (west) left = right - 1;
    else right = left + 1;
  }
  if (height < 1) {
    height = 1;
    if (north) top = bottom - 1;
    else bottom = top + 1;
  }

  return { left, top, width, height };
}

/**
 * The size patch a resize gesture ends with. An edge handle fixes only the
 * axis it moves; the other axis keeps its sizing mode (a Fit height stays Fit).
 * Corner handles fix both axes.
 */
export function resizeSizePatch(
  handle: ResizeHandle,
  width: number,
  height: number,
): DeepPartial<BoxProps>["size"] {
  const patch: NonNullable<DeepPartial<BoxProps>["size"]> = {};
  if (handle.includes("e") || handle.includes("w")) {
    patch.width = { mode: "fixed", value: Math.max(1, Math.round(width)) };
  }
  if (handle.includes("n") || handle.includes("s")) {
    patch.height = { mode: "fixed", value: Math.max(1, Math.round(height)) };
  }
  return patch;
}

/** Pixel delta for an arrow key, or null when the key is not an arrow. */
export function nudgeDelta(key: string, step: number): CanvasPoint | null {
  switch (key) {
    case "ArrowLeft":
      return { x: -step, y: 0 };
    case "ArrowRight":
      return { x: step, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -step };
    case "ArrowDown":
      return { x: 0, y: step };
    default:
      return null;
  }
}

export function isDrawTool(tool: EditorTool): boolean {
  return (
    tool === "frame" ||
    tool === "stack" ||
    tool === "text" ||
    tool === "image" ||
    tool === "oval" ||
    tool === "rectangle" ||
    tool === "rounded"
  );
}

function isResizeHandle(value: string | undefined): value is ResizeHandle {
  return RESIZE_HANDLES.some((entry) => entry.handle === value);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Character offset in a layer's plain text nearest a viewport point. Framer
 * places the caret where a text layer is double-clicked instead of selecting
 * everything, so the editor starts from this offset.
 */
function caretOffsetAtPoint(element: HTMLElement, x: number, y: number): number | undefined {
  const doc = element.ownerDocument as Document & {
    caretRangeFromPoint?: (pointX: number, pointY: number) => Range | null;
  };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (!range || !element.contains(range.startContainer)) return undefined;
  const preceding = doc.createRange();
  preceding.selectNodeContents(element);
  preceding.setEnd(range.startContainer, range.startOffset);
  return preceding.toString().length;
}

/** Framer locks a layer together with everything nested inside it. */
function isNodeLocked(root: SceneNode, nodeId: NodeId): boolean {
  let node = findNode(root, nodeId);
  while (node) {
    if (node.locked) return true;
    node = findParent(root, node.id);
  }
  return false;
}

/**
 * The nearest hit element whose node exists in the active scene. A component
 * instance renders its master's internal nodes with their master ids, so a
 * click inside an instance resolves upward to the instance itself.
 */
function closestSceneNode(
  root: SceneNode,
  element: HTMLElement | null,
): { element: HTMLElement; node: SceneNode } | null {
  let current = element;
  while (current) {
    const id = current.dataset.nodeId;
    if (id) {
      const node = findNode(root, id);
      if (node) return { element: current, node };
    }
    current = current.parentElement?.closest<HTMLElement>("[data-node-id]") ?? null;
  }
  return null;
}

/** The DOM rect of a node in viewport coordinates. */
function measureNodeRect(
  _stage: HTMLElement,
  viewportRect: DOMRect,
  element: HTMLElement,
): CanvasRect {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - viewportRect.left,
    top: rect.top - viewportRect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Measures every rendered node into viewport-relative rects. Used both by the
 * layout effect (for overlays) and synchronously at pointer-down, where a
 * stale cached measurement would make snapping drift.
 */
function measureStageRects(
  stage: HTMLElement,
  viewport: HTMLDivElement,
): Map<NodeId, CanvasRect> {
  const viewportRect = viewport.getBoundingClientRect();
  const next = new Map<NodeId, CanvasRect>();
  for (const element of stage.querySelectorAll<HTMLElement>("[data-node-id]")) {
    const nodeId = element.dataset.nodeId;
    if (!nodeId) continue;
    next.set(nodeId, measureNodeRect(stage, viewportRect, element));
  }
  return next;
}

function findNodeElement(stage: HTMLElement, nodeId: NodeId): HTMLElement | null {
  const elements = stage.querySelectorAll<HTMLElement>("[data-node-id]");
  for (const element of elements) {
    if (element.dataset.nodeId === nodeId) return element;
  }
  return null;
}

/* ------------------------------------------------------------------ rulers */

export interface RulerMark {
  /** Viewport position in pixels. */
  position: number;
  /** Page coordinate rounded to a whole pixel. */
  value: number;
  major: boolean;
}

/** Tick marks every 10 page px, labelled every 100, positioned at the zoom. */
export function rulerMarks(offset: number, extent: number, zoom: number): RulerMark[] {
  if (!Number.isFinite(offset) || !Number.isFinite(extent) || !Number.isFinite(zoom) || zoom <= 0) {
    return [];
  }
  const first = Math.floor(-offset / zoom / RULER_MINOR_STEP) * RULER_MINOR_STEP;
  const last = (extent - offset) / zoom;
  const marks: RulerMark[] = [];
  for (let page = first; page <= last && marks.length < 5000; page += RULER_MINOR_STEP) {
    marks.push({
      position: offset + page * zoom,
      value: Math.round(page),
      major: page % RULER_MAJOR_STEP === 0,
    });
  }
  return marks;
}

/* ---------------------------------------------------------------- snapping */

/** Converts a measured viewport rect into page coordinates. */
function toPageRect(rect: CanvasRect, stageOffset: CanvasPoint, zoom: number): SnapRect {
  return {
    x: (rect.left - stageOffset.x) / zoom,
    y: (rect.top - stageOffset.y) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
  };
}

function measuredPageRect(
  rects: Map<NodeId, CanvasRect>,
  nodeId: NodeId,
  stageOffset: CanvasPoint,
  zoom: number,
): SnapRect | null {
  const rect = rects.get(nodeId);
  return rect ? toPageRect(rect, stageOffset, zoom) : null;
}

interface SnapContext {
  root: SceneNode;
  selection: NodeId[];
  rects: Map<NodeId, CanvasRect>;
  page: { guides?: Guide[] } | null;
  stageOffset: CanvasPoint;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
  guidesVisible: boolean;
}

/**
 * Targets for a moving/resizing node: parent, siblings, the page/root and the
 * visible page guides. Everything is converted to page coordinates so the
 * snapping math sees one coordinate space.
 */
function gatherSnapTargets(
  context: SnapContext,
  movingId: NodeId,
): SnapTarget[] {
  const { root, selection, rects, stageOffset, zoom } = context;
  const targets: SnapTarget[] = [];
  const excluded = new Set(selection);

  const parent = findParent(root, movingId);
  const parentRect = parent ? measuredPageRect(rects, parent.id, stageOffset, zoom) : null;
  if (parent) {
    if (parentRect) addRectTargets(targets, parentRect, "parent");
    if (parent.type === "frame") {
      for (const sibling of parent.children) {
        if (sibling.id === movingId || excluded.has(sibling.id) || !sibling.visible) continue;
        const rect = measuredPageRect(rects, sibling.id, stageOffset, zoom);
        if (rect) addRectTargets(targets, rect, "sibling");
      }
    }
  }

  // Page/root edges and centers. The root itself never snaps (it cannot move),
  // but its bounds are a useful target for its children.
  if (movingId !== root.id) {
    const rootRect =
      measuredPageRect(rects, root.id, stageOffset, zoom) ?? {
        x: 0,
        y: 0,
        width: context.pageWidth,
        height: context.pageHeight,
      };
    addRectTargets(targets, rootRect, "page");
  }

  if (context.guidesVisible) {
    for (const guide of context.page?.guides ?? []) {
      if (!Number.isFinite(guide.position)) continue;
      targets.push({ axis: guide.axis, position: guide.position, source: "guide" });
    }
  }

  return targets;
}


/** Top-left of a frame's padding box in page coordinates. */
function pageOriginOf(element: HTMLElement, stage: HTMLElement, zoom: number): CanvasPoint {
  const stageRect = stage.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  return {
    x: (rect.left - stageRect.left) / zoom + borderLeft,
    y: (rect.top - stageRect.top) / zoom + borderTop,
  };
}

/**
 * Selected nodes that can be moved: root and locked nodes are excluded, as are
 * nodes whose parent lays out children itself (a stack/grid owns position).
 */
function movableNodeIds(
  root: SceneNode,
  selection: NodeId[],
  breakpointId: string,
  breakpoints: Breakpoint[],
): NodeId[] {
  const nodes: SceneNode[] = [];
  for (const nodeId of selection) {
    if (nodeId === root.id) continue;
    const node = findNode(root, nodeId);
    if (!node || isNodeLocked(root, node.id)) continue;
    nodes.push(node);
  }
  const topLevel = nodes.filter(
    (node) =>
      !nodes.some((other) => other.id !== node.id && isSelfOrDescendant(root, other.id, node.id)),
  );
  return topLevel
    .filter((node) => {
      const parent = findParent(root, node.id);
      if (!parent) return false;
      return resolveNodeProps(parent, breakpointId, breakpoints).layout.mode === "none";
    })
    .map((node) => node.id);
}

/** Frames receive inserts; anything else inserts into the active scene root. */
function creationParent(root: SceneNode, selection: NodeId[]): NodeId {
  const first = selection[0];
  if (first) {
    const node = findNode(root, first);
    if (node?.type === "frame") return node.id;
  }
  return root.id;
}

const DEFAULT_FRAME_SIZE: DeepPartial<BoxProps>["size"] = {
  width: { mode: "fixed", value: 400 },
  height: { mode: "fixed", value: 400 },
};

const DEFAULT_IMAGE_SIZE: DeepPartial<BoxProps>["size"] = {
  width: { mode: "fixed", value: 400 },
  height: { mode: "fixed", value: 300 },
};

const OVAL_RADIUS = { topLeft: 9999, topRight: 9999, bottomRight: 9999, bottomLeft: 9999 };
const RECTANGLE_RADIUS = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
const ROUNDED_RADIUS = { topLeft: 20, topRight: 20, bottomRight: 20, bottomLeft: 20 };

/** Shape tools share a visible neutral fill so an empty shape reads on canvas. */
const SHAPE_FILL: Fill = { type: "solid", color: "#e5e5e5", opacity: 1 };

interface CreateGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

function createNodeForTool(
  tool: EditorTool,
  geometry: CreateGeometry,
  dragged: boolean,
): SceneNode {
  const position = { x: geometry.x, y: geometry.y };
  const fixedSize: DeepPartial<BoxProps>["size"] = dragged
    ? {
        width: { mode: "fixed", value: Math.max(1, geometry.width) },
        height: { mode: "fixed", value: Math.max(1, geometry.height) },
      }
    : undefined;

  switch (tool) {
    case "stack":
      return createFrame({
        name: "Stack",
        props: {
          position,
          size: fixedSize ?? DEFAULT_FRAME_SIZE,
          layout: { mode: "stack" },
        },
      });
    case "oval":
      return createFrame({
        name: "Oval",
        props: {
          position,
          size: fixedSize ?? DEFAULT_FRAME_SIZE,
          style: { radius: OVAL_RADIUS, fill: SHAPE_FILL },
        },
      });
    case "rectangle":
      return createFrame({
        name: "Rectangle",
        props: {
          position,
          size: fixedSize ?? DEFAULT_FRAME_SIZE,
          style: { radius: RECTANGLE_RADIUS, fill: SHAPE_FILL, overflow: "visible" },
        },
      });
    case "rounded":
      return createFrame({
        name: "Rounded",
        props: {
          position,
          size: fixedSize ?? DEFAULT_FRAME_SIZE,
          style: { radius: ROUNDED_RADIUS, fill: SHAPE_FILL, overflow: "visible" },
        },
      });
    case "image":
      return createImage({
        props: { position, size: fixedSize ?? DEFAULT_IMAGE_SIZE },
      });
    case "text":
      // Framer's Text tool starts an empty layer with a caret; it never drops
      // placeholder text into the document.
      return createText({
        content: "",
        props: { position, ...(fixedSize ? { size: fixedSize } : {}) },
      });
    default:
      return createFrame({
        props: { position, size: fixedSize ?? DEFAULT_FRAME_SIZE },
      });
  }
}

function textEditorStyle(
  rect: CanvasRect,
  text: TextContent,
  zoom: number,
  hugWidth: boolean,
): CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    // Framer's editor grows with the text it contains. A Fit Content layer
    // therefore gets an auto-sized textarea; a fixed-width layer keeps its
    // width and wraps.
    ...(hugWidth
      ? { width: "auto", minWidth: 0 }
      : { width: Math.max(1, rect.width) }),
    height: "auto",
    minHeight: Math.max(1, rect.height),
    fontFamily: text.fontFamily,
    fontSize: text.fontSize * zoom,
    fontWeight: text.fontWeight,
    lineHeight:
      text.lineHeight === "auto"
        ? `${Math.round(text.fontSize * 1.2 * 100) / 100 * zoom}px`
        : text.lineHeight * zoom,
    letterSpacing: `${text.letterSpacing * zoom}px`,
    color: text.color,
    textAlign: text.align,
    textTransform: text.textTransform,
    fontStyle: text.italic ? "italic" : "normal",
    textDecoration: text.textDecoration,
    whiteSpace: "pre-wrap",
  };
}

/* ---------------------------------------------------------------- sessions */

let dragSequence = 0;

function createDragKey(kind: string): string {
  dragSequence += 1;
  return `${kind}:${Date.now()}:${dragSequence}`;
}

interface MoveSession {
  kind: "move";
  pointerId: number;
  target: SceneTarget;
  breakpointId: string;
  startClient: CanvasPoint;
  startPositions: Map<NodeId, CanvasPoint>;
  /** Page-space rect and targets for the node under the pointer. */
  snapRect: SnapRect | null;
  snapTargets: SnapTarget[];
  dragKey: string;
  moved: boolean;
}

interface ResizeSession {
  kind: "resize";
  pointerId: number;
  target: SceneTarget;
  breakpointId: string;
  nodeId: NodeId;
  handle: ResizeHandle;
  startClient: CanvasPoint;
  startRect: CanvasRect;
  snapRect: SnapRect | null;
  snapTargets: SnapTarget[];
  movable: boolean;
  dragKey: string;
  moved: boolean;
}

interface PanSession {
  kind: "pan";
  pointerId: number;
  startClient: CanvasPoint;
  startPan: CanvasPoint;
}

interface DrawSession {
  kind: "draw";
  pointerId: number;
  tool: EditorTool;
  startClient: CanvasPoint;
  startPage: CanvasPoint;
  currentClient: CanvasPoint;
}

/** Dragging a new guide out of a ruler, or an existing guide on the page. */
interface GuideSession {
  kind: "guide";
  pointerId: number;
  axis: Guide["axis"];
  mode: "create" | "update";
  guideId?: string;
}

interface MarqueeSession {
  kind: "marquee";
  pointerId: number;
  startClient: CanvasPoint;
  additive: boolean;
}

type Session =
  | MoveSession
  | ResizeSession
  | PanSession
  | DrawSession
  | GuideSession
  | MarqueeSession;

interface GuidePreview {
  axis: Guide["axis"];
  position: number;
  /** True while the pointer is outside the page; releasing removes/cancels. */
  outside: boolean;
}

interface EditingState {
  nodeId: NodeId;
  value: string;
  original: string;
  /** Caret offset when entering from a double-click; undefined selects all. */
  caret?: number;
}

/* ---------------------------------------------------------------- component */

export function Canvas() {
  const project = useProjectStore((state) => state.project);
  const activePageId = useProjectStore((state) => state.activePageId);
  const activeBreakpointId = useProjectStore((state) => state.activeBreakpointId);
  const editingComponent = useProjectStore((state) => state.editingComponent);
  const selection = useProjectStore((state) => state.selection);
  const hoveredNodeId = useProjectStore((state) => state.hoveredNodeId);
  const zoom = useProjectStore((state) => state.zoom);
  const pan = useProjectStore((state) => state.pan);
  const setActiveBreakpoint = useProjectStore((state) => state.setActiveBreakpoint);
  const addBreakpoint = useProjectStore((state) => state.addBreakpoint);
  const removeBreakpoint = useProjectStore((state) => state.removeBreakpoint);
  const updateText = useProjectStore((state) => state.updateText);
  const addGuide = useProjectStore((state) => state.addGuide);
  const updateGuide = useProjectStore((state) => state.updateGuide);
  const removeGuide = useProjectStore((state) => state.removeGuide);

  const tool = useUIStore((state) => state.tool);
  const rulersVisible = useUIStore((state) => state.rulersVisible);
  const guidesVisible = useUIStore((state) => state.guidesVisible);

  const scene = activeSceneOf(project, activePageId, editingComponent);
  const page = scene?.kind === "page" ? scene.page : null;
  const breakpoint = activeBreakpointOf(project, activeBreakpointId);
  const pageWidth = breakpoint?.width ?? 1200;

  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const rectsRef = useRef<Map<NodeId, CanvasRect>>(new Map());
  const spaceRef = useRef(false);
  const editorClosedRef = useRef(false);
  const editorFocusedRef = useRef(false);

  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [rects, setRects] = useState<Map<NodeId, CanvasRect>>(() => new Map());
  const [drawRect, setDrawRect] = useState<CanvasRect | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<CanvasRect | null>(null);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [guidePreview, setGuidePreview] = useState<GuidePreview | null>(null);
  const [breakpointMenuOpen, setBreakpointMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [newBreakpointName, setNewBreakpointName] = useState("Custom");
  const [newBreakpointWidth, setNewBreakpointWidth] = useState("1000");
  const [addBreakpointError, setAddBreakpointError] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);

  /* ------------------------------------------------------------- measuring */

  const measureRects = useCallback(() => {
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!stage || !viewport) return;
    const next = measureStageRects(stage, viewport);
    rectsRef.current = next;
    setRects(next);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = (): void => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      setViewportWidth((current) => (current === width ? current : width));
      setViewportHeight((current) => (current === height ? current : height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the document, selection, viewport or transform changes.
  useEffect(() => {
    const frame = requestAnimationFrame(measureRects);
    return () => cancelAnimationFrame(frame);
  }, [
    measureRects,
    project,
    activePageId,
    activeBreakpointId,
    editingComponent,
    selection,
    zoom,
    pan.x,
    pan.y,
    viewportWidth,
  ]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let frame = 0;
    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureRects);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(stage, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(stage);
    const viewport = viewportRef.current;
    if (viewport) resize.observe(viewport);
    window.addEventListener("scroll", schedule, true);
    return () => {
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", schedule, true);
      cancelAnimationFrame(frame);
    };
  }, [measureRects]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (addMenuRef.current?.contains(target)) return;
      if (addButtonRef.current?.contains(target)) return;
      setAddMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setAddMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [addMenuOpen]);

  // The context menu's "Custom…" item asks the canvas to open its breakpoint
  // popover, which is the existing custom-breakpoint UI.
  useEffect(() => {
    const handleAddBreakpoint = (): void => {
      setBreakpointMenuOpen(false);
      setNewBreakpointName("Custom");
      setNewBreakpointWidth("1000");
      setAddBreakpointError(null);
      setAddMenuOpen(true);
    };
    window.addEventListener("wfm:add-breakpoint", handleAddBreakpoint);
    return () => window.removeEventListener("wfm:add-breakpoint", handleAddBreakpoint);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) measureRects();
    });
    return () => {
      cancelled = true;
    };
  }, [measureRects]);

  /* ---------------------------------------------------------------- zoom */

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent): void => {
      const state = useProjectStore.getState();
      if (event.ctrlKey || event.metaKey) {
        // Cmd/Ctrl + wheel and trackpad pinch zoom around the pointer.
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const nextZoom = clampZoom(state.zoom * Math.exp(-event.deltaY * 0.0025));
        if (Math.abs(nextZoom - state.zoom) < 0.0001) return;
        const nextPan = zoomPanAtPointer(
          pointer,
          viewport.clientWidth,
          pageWidth,
          state.zoom,
          nextZoom,
          state.pan,
        );
        state.setZoom(nextZoom);
        state.setPan(nextPan);
        return;
      }
      // A plain wheel scroll pans the canvas, as in Framer.
      if (event.deltaX === 0 && event.deltaY === 0) return;
      event.preventDefault();
      state.setPan({ x: state.pan.x - event.deltaX, y: state.pan.y - event.deltaY });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [pageWidth]);

  /* -------------------------------------------------------------- keyboard */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;

      const zoomModifier = event.metaKey || event.ctrlKey;
      if (
        zoomModifier &&
        !event.shiftKey &&
        !event.altKey &&
        (event.key === "=" || event.key === "+" || event.key === "-" || event.key === "_")
      ) {
        event.preventDefault();
        const state = useProjectStore.getState();
        const stageElement = stageRef.current;
        const viewport = viewportRef.current;
        if (!stageElement || !viewport) return;
        const factor = event.key === "-" || event.key === "_" ? 1 / 1.25 : 1.25;
        const nextZoom = clampZoom(state.zoom * factor);
        if (Math.abs(nextZoom - state.zoom) < 0.0001) return;
        const currentPageWidth = stageElement.getBoundingClientRect().width / state.zoom;
        const nextPan = zoomPanAtPointer(
          { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 },
          viewport.clientWidth,
          currentPageWidth,
          state.zoom,
          nextZoom,
          state.pan,
        );
        state.setZoom(nextZoom);
        state.setPan(nextPan);
        return;
      }

      const commandModifier = event.metaKey || event.ctrlKey;
      if (commandModifier && !event.shiftKey && !event.altKey) {
        const state = useProjectStore.getState();
        if (event.key.toLowerCase() === "c") {
          if (state.selection.length === 0) return;
          event.preventDefault();
          state.copySelection();
          return;
        }
        if (event.key.toLowerCase() === "v") {
          event.preventDefault();
          state.pasteClipboard();
          return;
        }
        if (event.key.toLowerCase() === "a") {
          event.preventDefault();
          state.selectAll();
          return;
        }
        const targetId = state.selection[0];
        if (event.key.toLowerCase() === "l" && targetId) {
          // Framer advertises Ctrl/Cmd+L for Lock in its context menu.
          event.preventDefault();
          state.toggleLock(targetId);
          return;
        }
        if (event.key === ";" && targetId) {
          event.preventDefault();
          state.toggleVisibility(targetId);
          return;
        }
      }

      if (
        event.key === "Enter" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.target === document.body
      ) {
        const state = useProjectStore.getState();
        const currentProject = state.project;
        const currentScene = activeSceneOf(
          currentProject,
          state.activePageId,
          state.editingComponent,
        );
        const selectedId = state.selection.length === 1 ? state.selection[0] : undefined;
        const node =
          currentScene && selectedId ? findNode(currentScene.root, selectedId) : null;
        if (currentScene && node?.type === "text" && !isNodeLocked(currentScene.root, node.id)) {
          event.preventDefault();
          beginTextEditing(node.id);
        }
        return;
      }

      if (event.code === "Space" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        spaceRef.current = true;
        setSpaceDown(true);
        event.preventDefault();
        return;
      }

      if (!event.key.startsWith("Arrow") || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const state = useProjectStore.getState();
      const currentProject = state.project;
      const currentScene = activeSceneOf(
        currentProject,
        state.activePageId,
        state.editingComponent,
      );
      if (!currentProject || !currentScene || state.selection.length === 0) return;

      const delta = nudgeDelta(event.key, event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP);
      if (!delta) return;

      const nodeIds = movableNodeIds(
        currentScene.root,
        state.selection,
        state.activeBreakpointId,
        currentProject.breakpoints,
      );
      if (nodeIds.length === 0) return;

      event.preventDefault();

      const moves = nodeIds.map((nodeId) => {
        const node = findNode(currentScene.root, nodeId);
        const position = node
          ? resolveNodeProps(node, state.activeBreakpointId, currentProject.breakpoints).position
          : { x: 0, y: 0 };
        return {
          nodeId,
          x: Math.round(position.x + delta.x),
          y: Math.round(position.y + delta.y),
        };
      });

      state.applyRecipe(
        "Nudge",
        (draft) => {
          for (const move of moves) {
            updateBoxProps(draft, {
              ...currentScene.target,
              nodeId: move.nodeId,
              breakpointId: state.activeBreakpointId,
              patch: { position: { x: move.x, y: move.y } },
            });
          }
        },
        `nudge:${state.activeBreakpointId}:${nodeIds.join(",")}`,
      );
    };

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code !== "Space") return;
      spaceRef.current = false;
      setSpaceDown(false);
    };

    const handleWindowBlur = (): void => {
      spaceRef.current = false;
      setSpaceDown(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (tool !== "select") useProjectStore.getState().setHovered(null);
  }, [tool]);

  // The Style panel shows resolved sizes for Fit/Fill layers, so it needs the
  // rendered box. Measure the element directly: this also works in a background
  // tab where the rects cache has not been refreshed by an animation frame.
  useEffect(() => {
    const selectedId = selection.length === 1 ? selection[0] : null;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    const element =
      selectedId && stage ? findNodeElement(stage, selectedId) : null;
    const rect =
      element && stage && viewport
        ? measureNodeRect(stage, viewport.getBoundingClientRect(), element)
        : selectedId
          ? rects.get(selectedId)
          : undefined;
    useUIStore.getState().setSelectedSize(
      rect ? { width: rect.width / zoom, height: rect.height / zoom } : null,
    );
  }, [selection, project, zoom]);

  /* --------------------------------------------------------------- editing */

  const editingNodeId = editing?.nodeId;
  const editedRectForFocus = editing ? rects.get(editing.nodeId) : undefined;

  // The node is committed to the DOM before this runs; measure it without
  // waiting for an animation frame (which can be throttled in a background tab).
  // This lets a freshly inserted text layer show its editor immediately.
  useLayoutEffect(() => {
    if (!editing) return;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!stage || !viewport) return;
    const element = findNodeElement(stage, editing.nodeId);
    if (!element) return;
    const next = new Map(rectsRef.current);
    next.set(editing.nodeId, measureNodeRect(stage, viewport.getBoundingClientRect(), element));
    rectsRef.current = next;
    setRects(next);
  }, [editing?.nodeId, project]);

  useEffect(() => {
    if (!editingNodeId) {
      editorFocusedRef.current = false;
      return;
    }
    if (!editedRectForFocus || editorFocusedRef.current) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    if (editing?.caret !== undefined) {
      const caret = Math.min(editing.caret, textarea.value.length);
      textarea.setSelectionRange(caret, caret);
    } else {
      textarea.select();
    }
    editorFocusedRef.current = true;
  }, [editingNodeId, editedRectForFocus]);

  const closeEditor = (commit: boolean): void => {
    if (editorClosedRef.current) return;
    editorClosedRef.current = true;
    const current = editing;
    if (current && commit) {
      if (current.value.trim() === "") {
        // Framer never keeps an empty text layer: leaving the editor with no
        // content removes it, whether it was just created or emptied.
        useProjectStore.getState().removeNodeById(current.nodeId);
      } else if (current.value !== current.original) {
        updateText(current.nodeId, { text: { content: current.value } });
      }
    }
    setEditing(null);
  };

  /* ----------------------------------------------------------- breakpoints */

  const toggleAddBreakpointMenu = (): void => {
    if (addMenuOpen) {
      setAddMenuOpen(false);
      return;
    }
    setBreakpointMenuOpen(false);
    setNewBreakpointName("Custom");
    setNewBreakpointWidth("1000");
    setAddBreakpointError(null);
    setAddMenuOpen(true);
  };

  const submitAddBreakpoint = (): void => {
    const name = newBreakpointName.trim();
    if (name.length === 0) {
      setAddBreakpointError("Enter a breakpoint name.");
      return;
    }
    const width = Number(newBreakpointWidth.trim());
    if (!Number.isInteger(width) || width < 1 || width > 10000) {
      setAddBreakpointError("Width must be a whole number from 1 to 10000.");
      return;
    }
    const breakpointId = addBreakpoint(name, width);
    if (breakpointId === null) {
      setAddBreakpointError(useProjectStore.getState().error ?? "Could not add the breakpoint.");
      return;
    }
    setAddBreakpointError(null);
    setAddMenuOpen(false);
  };

  /* --------------------------------------------------------------- pointer */

  // The page height in page pixels, used by rulers, guides and snap lines.
  const rootHeightValue = scene
    ? resolveNodeProps(scene.root, activeBreakpointId, project?.breakpoints ?? []).size.height
    : null;
  const fallbackPageHeight =
    rootHeightValue?.mode === "fixed" && typeof rootHeightValue.value === "number"
      ? rootHeightValue.value
      : 1000;
  const measuredRoot = scene ? rects.get(scene.root.id) : undefined;
  const pageHeight =
    measuredRoot && measuredRoot.height > 0 ? measuredRoot.height / zoom : fallbackPageHeight;
  // Guides belong to the active page, even while a component is being edited.
  const guidePage = project?.pages.find((candidate) => candidate.id === activePageId) ?? null;

  /** Page-space rect and snap targets for a node at pointer-down time. */
  const snapContextFor = (
    state: ReturnType<typeof useProjectStore.getState>,
    currentScene: NonNullable<ReturnType<typeof activeSceneOf>>,
    nodeId: NodeId,
    stage: HTMLElement,
    viewport: HTMLDivElement,
  ): { snapRect: SnapRect | null; snapTargets: SnapTarget[] } | null => {
    const stageOffset = centeredStageOffset(
      viewport.clientWidth,
      pageWidth,
      state.zoom,
      state.pan,
    );
    // Measure now rather than trusting the last rAF: a resize or a layout
    // change since then would make every snap target off by the difference.
    const rects = measureStageRects(stage, viewport);
    const snapRect = measuredPageRect(rects, nodeId, stageOffset, state.zoom);
    if (!snapRect) return null;
    const node = findNode(currentScene.root, nodeId);
    if (!node) return null;
    const snapTargets = gatherSnapTargets(
      {
        root: currentScene.root,
        selection: state.selection,
        rects,
        page: currentScene.kind === "page" ? guidePage : null,
        stageOffset,
        zoom: state.zoom,
        pageWidth,
        pageHeight,
        guidesVisible,
      },
      nodeId,
    );
    return { snapRect, snapTargets };
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = useProjectStore.getState();
    event.preventDefault();
    sessionRef.current = {
      kind: "pan",
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPan: { x: state.pan.x, y: state.pan.y },
    };
    viewportRef.current?.setPointerCapture(event.pointerId);
  };

  /* --------------------------------------------------------------- guides */

  const isGuideOutside = (axis: Guide["axis"], position: number): boolean => {
    const limit = axis === "x" ? pageWidth : pageHeight;
    return position < 0 || position > limit;
  };

  const pagePointFromEvent = (event: ReactPointerEvent<HTMLDivElement>): CanvasPoint | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const state = useProjectStore.getState();
    const stageOffset = centeredStageOffset(
      viewport.clientWidth,
      pageWidth,
      state.zoom,
      state.pan,
    );
    const rect = viewport.getBoundingClientRect();
    return viewportPointToPage(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      stageOffset,
      state.zoom,
    );
  };

  const guidePositionFromEvent = (
    axis: Guide["axis"],
    event: ReactPointerEvent<HTMLDivElement>,
  ): number | null => {
    const point = pagePointFromEvent(event);
    return point ? (axis === "x" ? point.x : point.y) : null;
  };

  const startGuideCreate = (
    axis: Guide["axis"],
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    const position = guidePositionFromEvent(axis, event);
    if (!viewport || position === null) return;
    sessionRef.current = { kind: "guide", pointerId: event.pointerId, axis, mode: "create" };
    setGuidePreview({ axis, position, outside: isGuideOutside(axis, position) });
    viewport.setPointerCapture(event.pointerId);
  };

  const startGuideMove = (
    guide: Guide,
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) return;
    sessionRef.current = {
      kind: "guide",
      pointerId: event.pointerId,
      axis: guide.axis,
      mode: "update",
      guideId: guide.id,
    };
    setGuidePreview({
      axis: guide.axis,
      position: guide.position,
      outside: isGuideOutside(guide.axis, guide.position),
    });
    viewport.setPointerCapture(event.pointerId);
  };

  const finishGuide = (
    session: GuideSession,
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    const position = guidePositionFromEvent(session.axis, event);
    setGuidePreview(null);
    if (position === null) return;

    if (isGuideOutside(session.axis, position)) {
      // Releasing outside the page removes a guide; a new one is cancelled.
      if (session.mode === "update" && session.guideId) removeGuide(session.guideId);
      return;
    }

    const rounded = Math.round(position);
    if (session.mode === "update" && session.guideId) {
      updateGuide(session.guideId, rounded);
    } else {
      addGuide(session.axis, rounded);
    }
  };

  /** Applies a pointer position to the live guide preview. */
  const updateGuideDrag = (
    session: GuideSession,
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    const position = guidePositionFromEvent(session.axis, event);
    if (position === null) return;
    setGuidePreview({
      axis: session.axis,
      position,
      outside: isGuideOutside(session.axis, position),
    });
  };

  const updateHover = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = useProjectStore.getState();
    if (useUIStore.getState().tool !== "select") return;
    const scene = activeSceneOf(state.project, state.activePageId, state.editingComponent);
    if (!scene) return;
    const target = event.target as HTMLElement | null;
    const node = closestSceneNode(scene.root, target)?.node ?? null;
    state.setHovered(
      node && node.id !== scene.root.id && !isNodeLocked(scene.root, node.id) ? node.id : null,
    );
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const target = event.target as HTMLElement | null;
    // Chrome around the page (the breakpoint bar, resize handles, an open menu)
    // is not canvas background.
    if (target?.closest(".wfm-breakpoint-bar, .wfm-selection__handle, .wfm-menu")) return;
    setBreakpointMenuOpen(false);
    setAddMenuOpen(false);

    const state = useProjectStore.getState();
    const currentScene = activeSceneOf(state.project, state.activePageId, state.editingComponent);
    if (!currentScene) return;

    const node = closestSceneNode(currentScene.root, target)?.node ?? null;

    if (node) {
      // Right-clicking a node that is already part of a selection keeps that
      // selection; only a new node is selected (or added with modifiers).
      if (!state.selection.includes(node.id)) {
        state.select(node.id, event.shiftKey || event.metaKey || event.ctrlKey);
      }
      useUIStore.getState().openContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
      return;
    }

    // Outside the page root: the empty-canvas menu.
    state.clearSelection();
    useUIStore.getState().openContextMenu({ x: event.clientX, y: event.clientY });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(".wfm-text-editor")) return;
    if (event.button === 2) return;

    setBreakpointMenuOpen(false);
    setAddMenuOpen(false);
    setSnapLines([]);
    setGuidePreview(null);

    const state = useProjectStore.getState();
    state.setHovered(null);
    const currentProject = state.project;
    const currentScene = activeSceneOf(currentProject, state.activePageId, state.editingComponent);
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!currentProject || !currentScene || !stage || !viewport) return;
    const currentTool = useUIStore.getState().tool;

    if (event.button === 1 || spaceRef.current || currentTool === "hand") {
      startPan(event);
      return;
    }

    const handle = target.dataset.handle;
    if (isResizeHandle(handle) && currentTool === "select" && state.selection.length === 1) {
      const nodeId = state.selection[0];
      const node = nodeId ? findNode(currentScene.root, nodeId) : null;
      if (!nodeId || !node || isNodeLocked(currentScene.root, node.id) || node.id === currentScene.root.id)
        return;
      const element = findNodeElement(stage, nodeId);
      if (!element) return;

      const props = resolveNodeProps(node, state.activeBreakpointId, currentProject.breakpoints);
      const elementRect = element.getBoundingClientRect();
      const parent = findParent(currentScene.root, nodeId);
      const movable = parent
        ? resolveNodeProps(parent, state.activeBreakpointId, currentProject.breakpoints).layout
            .mode === "none"
        : false;
      const snap = snapContextFor(
        useProjectStore.getState(),
        currentScene,
        nodeId,
        stage,
        viewport,
      );

      sessionRef.current = {
        kind: "resize",
        pointerId: event.pointerId,
        target: currentScene.target,
        breakpointId: state.activeBreakpointId,
        nodeId,
        handle,
        startClient: { x: event.clientX, y: event.clientY },
        startRect: {
          left: props.position.x,
          top: props.position.y,
          width: elementRect.width / state.zoom,
          height: elementRect.height / state.zoom,
        },
        snapRect: snap?.snapRect ?? null,
        snapTargets: snap?.snapTargets ?? [],
        movable,
        dragKey: createDragKey("resize"),
        moved: false,
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }

    if (isDrawTool(currentTool)) {
      const stageRect = stage.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      sessionRef.current = {
        kind: "draw",
        pointerId: event.pointerId,
        tool: currentTool,
        startClient: { x: event.clientX, y: event.clientY },
        startPage: {
          x: (event.clientX - stageRect.left) / state.zoom,
          y: (event.clientY - stageRect.top) / state.zoom,
        },
        currentClient: { x: event.clientX, y: event.clientY },
      };
      setDrawRect({
        left: event.clientX - viewportRect.left,
        top: event.clientY - viewportRect.top,
        width: 0,
        height: 0,
      });
      viewport.setPointerCapture(event.pointerId);
      return;
    }

    const hit = closestSceneNode(currentScene.root, target);
    const nodeElement = hit?.element ?? null;
    if (!nodeElement) {
      state.setHovered(null);
      if (event.button === 0) {
        // Dragging on empty canvas draws a marquee; a plain click clears the
        // selection when the pointer goes up without moving.
        const viewportRect = viewport.getBoundingClientRect();
        sessionRef.current = {
          kind: "marquee",
          pointerId: event.pointerId,
          startClient: { x: event.clientX, y: event.clientY },
          additive: event.shiftKey || event.metaKey || event.ctrlKey,
        };
        setMarqueeRect({
          left: event.clientX - viewportRect.left,
          top: event.clientY - viewportRect.top,
          width: 0,
          height: 0,
        });
        viewport.setPointerCapture(event.pointerId);
        return;
      }
      state.clearSelection();
      return;
    }

    const node = hit?.node ?? null;
    const nodeId = node?.id;
    if (!nodeId || !node || isNodeLocked(currentScene.root, nodeId)) return;

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const alreadySelected = state.selection.includes(nodeId);
    state.select(nodeId, additive);
    if (additive && alreadySelected) return;

    const moveIds = additive ? [...state.selection, nodeId] : [nodeId];
    const movable = movableNodeIds(
      currentScene.root,
      moveIds,
      state.activeBreakpointId,
      currentProject.breakpoints,
    );
    if (movable.length === 0 || !movable.includes(nodeId)) return;

    const startPositions = new Map<NodeId, CanvasPoint>();
    for (const id of movable) {
      const movableNode = findNode(currentScene.root, id);
      if (!movableNode) continue;
      const props = resolveNodeProps(
        movableNode,
        state.activeBreakpointId,
        currentProject.breakpoints,
      );
      startPositions.set(id, { x: props.position.x, y: props.position.y });
    }

    const snap = snapContextFor(useProjectStore.getState(), currentScene, nodeId, stage, viewport);

    sessionRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      target: currentScene.target,
      breakpointId: state.activeBreakpointId,
      startClient: { x: event.clientX, y: event.clientY },
      startPositions,
      snapRect: snap?.snapRect ?? null,
      snapTargets: snap?.snapTargets ?? [],
      dragKey: createDragKey("move"),
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const session = sessionRef.current;
    if (!session) {
      updateHover(event);
      return;
    }
    if (session.pointerId !== event.pointerId) return;

    const state = useProjectStore.getState();

    if (session.kind === "pan") {
      state.setPan({
        x: session.startPan.x + (event.clientX - session.startClient.x),
        y: session.startPan.y + (event.clientY - session.startClient.y),
      });
      return;
    }

    if (session.kind === "guide") {
      updateGuideDrag(session, event);
      return;
    }

    if (session.kind === "marquee") {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const viewportRect = viewport.getBoundingClientRect();
      const startX = session.startClient.x - viewportRect.left;
      const startY = session.startClient.y - viewportRect.top;
      const endX = event.clientX - viewportRect.left;
      const endY = event.clientY - viewportRect.top;
      setMarqueeRect({
        left: Math.min(startX, endX),
        top: Math.min(startY, endY),
        width: Math.abs(endX - startX),
        height: Math.abs(endY - startY),
      });
      return;
    }

    if (session.kind === "draw") {
      session.currentClient = { x: event.clientX, y: event.clientY };
      const viewport = viewportRef.current;
      if (!viewport) return;
      const viewportRect = viewport.getBoundingClientRect();
      const startX = session.startClient.x - viewportRect.left;
      const startY = session.startClient.y - viewportRect.top;
      const endX = event.clientX - viewportRect.left;
      const endY = event.clientY - viewportRect.top;
      setDrawRect({
        left: Math.min(startX, endX),
        top: Math.min(startY, endY),
        width: Math.abs(endX - startX),
        height: Math.abs(endY - startY),
      });
      return;
    }

    const clientDx = event.clientX - session.startClient.x;
    const clientDy = event.clientY - session.startClient.y;
    const distance = Math.hypot(clientDx, clientDy);

    if (session.kind === "move") {
      if (!session.moved && distance < DRAG_THRESHOLD) return;
      session.moved = true;
      let delta = constrainDelta(clientDx / state.zoom, clientDy / state.zoom, event.shiftKey);
      let lines: SnapLine[] = [];
      // Alt disables snapping, matching Framer's "hold Alt to bypass".
      if (!event.altKey && session.snapRect) {
        const candidate: SnapRect = {
          x: session.snapRect.x + delta.x,
          y: session.snapRect.y + delta.y,
          width: session.snapRect.width,
          height: session.snapRect.height,
        };
        const snapOptions: { x?: boolean; y?: boolean } = {};
        if (event.shiftKey) {
          if (delta.y === 0 && clientDy !== 0) snapOptions.y = false;
          if (delta.x === 0 && clientDx !== 0) snapOptions.x = false;
        }
        const snap = computeSnap(
          candidate,
          session.snapTargets,
          SNAP_THRESHOLD_SCREEN / state.zoom,
          snapOptions,
        );
        delta = { x: delta.x + snap.dx, y: delta.y + snap.dy };
        lines = snap.lines;
      }
      setSnapLines(lines);
      state.applyRecipe(
        "Move",
        (draft) => {
          for (const [nodeId, start] of session.startPositions) {
            updateBoxProps(draft, {
              ...session.target,
              nodeId,
              breakpointId: session.breakpointId,
              patch: {
                position: {
                  x: Math.round(start.x + delta.x),
                  y: Math.round(start.y + delta.y),
                },
              },
            });
          }
        },
        session.dragKey,
      );
      return;
    }

    if (!session.moved && distance < DRAG_THRESHOLD) return;
    session.moved = true;
    const next = resizeRect(
      session.startRect,
      session.handle,
      clientDx / state.zoom,
      clientDy / state.zoom,
      event.shiftKey,
    );
    let adjusted = next;
    let lines: SnapLine[] = [];
    // Shift keeps the aspect ratio, so snapping is skipped for that gesture.
    if (!event.altKey && !event.shiftKey && session.snapRect) {
      const movedLeft = next.left - session.startRect.left;
      const movedTop = next.top - session.startRect.top;
      const candidate: SnapRect = {
        x: session.snapRect.x + movedLeft,
        y: session.snapRect.y + movedTop,
        width: next.width,
        height: next.height,
      };
      const xEdges: SnapEdge[] = session.handle.includes("e")
        ? ["end"]
        : session.handle.includes("w") && session.movable
          ? ["start"]
          : [];
      const yEdges: SnapEdge[] = session.handle.includes("s")
        ? ["end"]
        : session.handle.includes("n") && session.movable
          ? ["start"]
          : [];
      const snap = computeSnapForEdges(
        candidate,
        session.snapTargets,
        SNAP_THRESHOLD_SCREEN / state.zoom,
        { x: xEdges, y: yEdges },
      );
      adjusted = { ...next };
      if (session.handle.includes("e")) adjusted.width += snap.dx;
      else if (session.handle.includes("w")) {
        adjusted.left += snap.dx;
        adjusted.width -= snap.dx;
      }
      if (session.handle.includes("s")) adjusted.height += snap.dy;
      else if (session.handle.includes("n")) {
        adjusted.top += snap.dy;
        adjusted.height -= snap.dy;
      }
      adjusted.width = Math.max(1, adjusted.width);
      adjusted.height = Math.max(1, adjusted.height);
      lines = snap.lines;
    }
    setSnapLines(lines);
    const patch: DeepPartial<BoxProps> = {
      size: resizeSizePatch(session.handle, adjusted.width, adjusted.height),
    };
    if (session.movable) {
      patch.position = {
        x: Math.round(adjusted.left),
        y: Math.round(adjusted.top),
      };
    }
    state.applyRecipe(
      "Resize",
      (draft) => {
        updateBoxProps(draft, {
          ...session.target,
          nodeId: session.nodeId,
          breakpointId: session.breakpointId,
          patch,
        });
      },
      session.dragKey,
    );
  };

  const finishDraw = (session: DrawSession, event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = useProjectStore.getState();
    const currentProject = state.project;
    const currentScene = activeSceneOf(currentProject, state.activePageId, state.editingComponent);
    const stage = stageRef.current;
    if (!currentProject || !currentScene || !stage) return;

    const stageRect = stage.getBoundingClientRect();
    const endPage = {
      x: (event.clientX - stageRect.left) / state.zoom,
      y: (event.clientY - stageRect.top) / state.zoom,
    };
    const dragged =
      Math.hypot(event.clientX - session.startClient.x, event.clientY - session.startClient.y) >=
      DRAW_THRESHOLD;

    const parentId = creationParent(currentScene.root, state.selection);
    const parentElement = findNodeElement(stage, parentId);
    const origin = parentElement ? pageOriginOf(parentElement, stage, state.zoom) : { x: 0, y: 0 };

    let x = session.startPage.x - origin.x;
    let y = session.startPage.y - origin.y;
    let width = 0;
    let height = 0;

    if (dragged) {
      const endX = endPage.x - origin.x;
      const endY = endPage.y - origin.y;
      width = Math.max(1, Math.abs(endX - x));
      height = Math.max(1, Math.abs(endY - y));
      x = Math.min(x, endX);
      y = Math.min(y, endY);
    }

    const node = createNodeForTool(
      session.tool,
      { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) },
      dragged,
    );
    const insertedId = state.insertNode(node, { parentId });
    useUIStore.getState().setTool("select");
    // Framer drops a freshly created text layer straight into editing: an
    // empty box with a caret at the start, ready for the first keystroke.
    if (session.tool === "text" && insertedId) beginTextEditing(insertedId, 0);
  };

  const finishMarquee = (session: MarqueeSession, event: ReactPointerEvent<HTMLDivElement>): void => {
    setMarqueeRect(null);
    const state = useProjectStore.getState();
    const currentProject = state.project;
    const currentScene = activeSceneOf(currentProject, state.activePageId, state.editingComponent);
    const stage = stageRef.current;
    const dragged =
      Math.hypot(event.clientX - session.startClient.x, event.clientY - session.startClient.y) >=
      DRAW_THRESHOLD;
    if (!dragged) {
      state.clearSelection();
      return;
    }
    if (!currentProject || !currentScene || !stage) return;
    if (currentScene.root.type !== "frame") return;
    const bounds = {
      left: Math.min(session.startClient.x, event.clientX),
      top: Math.min(session.startClient.y, event.clientY),
      right: Math.max(session.startClient.x, event.clientX),
      bottom: Math.max(session.startClient.y, event.clientY),
    };
    const hits: NodeId[] = [];
    // Marquee selects the direct children of the scene, like Framer's
    // top-level selection: dragging over a nested layer selects its frame.
    for (const child of currentScene.root.children) {
      if (!child.visible || child.locked) continue;
      const element = findNodeElement(stage, child.id);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (
        rect.left <= bounds.right &&
        rect.right >= bounds.left &&
        rect.top <= bounds.bottom &&
        rect.bottom >= bounds.top
      ) {
        hits.push(child.id);
      }
    }
    const merged = session.additive
      ? [...state.selection, ...hits.filter((id) => !state.selection.includes(id))]
      : hits;
    state.selectMany(merged);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    setDrawRect(null);
    setSnapLines([]);
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    if (session.kind === "draw") finishDraw(session, event);
    else if (session.kind === "guide") finishGuide(session, event);
    else if (session.kind === "marquee") finishMarquee(session, event);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    setDrawRect(null);
    setMarqueeRect(null);
    setSnapLines([]);
    setGuidePreview(null);
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerLeave = (): void => {
    if (!sessionRef.current) useProjectStore.getState().setHovered(null);
  };

  /** Opens the inline text editor for a text layer, measuring it first. */
  const beginTextEditing = (nodeId: NodeId, caret?: number): void => {
    const state = useProjectStore.getState();
    const currentProject = state.project;
    const currentScene = activeSceneOf(currentProject, state.activePageId, state.editingComponent);
    if (!currentProject || !currentScene) return;
    const node = findNode(currentScene.root, nodeId);
    if (node?.type !== "text" || isNodeLocked(currentScene.root, nodeId)) return;
    const props = resolveNodeProps(node, state.activeBreakpointId, currentProject.breakpoints);
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    const element = stage ? findNodeElement(stage, nodeId) : null;
    if (stage && viewport && element) {
      const next = new Map(rectsRef.current);
      next.set(nodeId, measureNodeRect(stage, viewport.getBoundingClientRect(), element));
      rectsRef.current = next;
      setRects(next);
    }
    editorClosedRef.current = false;
    editorFocusedRef.current = false;
    setEditing({
      nodeId,
      value: props.text.content,
      original: props.text.content,
      ...(caret !== undefined ? { caret } : {}),
    });
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const state = useProjectStore.getState();
    const currentProject = state.project;
    const currentScene = activeSceneOf(currentProject, state.activePageId, state.editingComponent);
    if (!currentProject || !currentScene) return;
    const target = event.target as HTMLElement | null;
    const hit = closestSceneNode(currentScene.root, target);
    if (!hit) return;
    const nodeElement = hit.element;
    const node = hit.node;
    const nodeId = node.id;
    if (isNodeLocked(currentScene.root, nodeId)) return;
    if (node.type === "componentInstance") {
      event.preventDefault();
      state.enterComponent(node.componentId, node.variantId ?? undefined, node.id);
      return;
    }
    if (node.type !== "text") return;
    event.preventDefault();
    beginTextEditing(nodeId, caretOffsetAtPoint(nodeElement, event.clientX, event.clientY));
  };

  /* ----------------------------------------------------------------- render */

  if (!project || !scene || !breakpoint) return null;

  const stageOffset = centeredStageOffset(viewportWidth, pageWidth, zoom, pan);
  const topMarks = rulersVisible ? rulerMarks(stageOffset.x, viewportWidth, zoom) : [];
  const leftMarks = rulersVisible ? rulerMarks(stageOffset.y, viewportHeight, zoom) : [];
  const pageGuides =
    guidesVisible && scene.kind === "page" ? (guidePage?.guides ?? []) : [];
  const guideWidth = GUIDE_GRAB_SIZE;
  const guideStyle = (axis: Guide["axis"], position: number): CSSProperties =>
    axis === "x"
      ? {
          left: stageOffset.x + position * zoom - guideWidth / 2,
          top: stageOffset.y,
          width: guideWidth,
          height: pageHeight * zoom,
        }
      : {
          left: stageOffset.x,
          top: stageOffset.y + position * zoom - guideWidth / 2,
          width: pageWidth * zoom,
          height: guideWidth,
        };
  const singleSelectedId = selection.length === 1 ? selection[0] : undefined;
  const singleSelectedNode = singleSelectedId ? findNode(scene.root, singleSelectedId) : null;
  const showHandles =
    singleSelectedNode !== null &&
    singleSelectedNode.id !== scene.root.id &&
    !isNodeLocked(scene.root, singleSelectedNode.id);

  const hoveredNode = hoveredNodeId ? findNode(scene.root, hoveredNodeId) : null;
  const selectionBounds = (() => {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const nodeId of selection) {
      const rect = rects.get(nodeId);
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.left + rect.width);
      bottom = Math.max(bottom, rect.top + rect.height);
    }
    return Number.isFinite(left)
      ? { left, top, width: right - left, height: bottom - top }
      : null;
  })();

  const hoverRect =
    hoveredNode &&
    hoveredNode.id !== scene.root.id &&
    hoveredNode.id !== editing?.nodeId &&
    !isNodeLocked(scene.root, hoveredNode.id) &&
    !selection.includes(hoveredNode.id)
      ? (rects.get(hoveredNode.id) ?? null)
      : null;

  const editedNode = editing ? findNode(scene.root, editing.nodeId) : null;
  const editedProps =
    editedNode?.type === "text"
      ? resolveNodeProps(editedNode, activeBreakpointId, project.breakpoints)
      : null;
  const editedText = editedProps?.text ?? null;
  const editedSize = editedProps?.size ?? null;
  const editedRect = editing ? (rects.get(editing.nodeId) ?? null) : null;

  const cursorClass =
    tool === "hand" || spaceDown ? "is-hand" : isDrawTool(tool) ? "is-draw" : "is-select";

  return (
    <div
      ref={viewportRef}
      className={`wfm-canvas-viewport ${cursorClass}`}
      role="application"
      aria-label="Canvas"
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={stageRef}
        className="wfm-canvas-stage"
        style={{
          left: stageOffset.x,
          top: stageOffset.y,
          width: pageWidth,
          transform: `scale(${zoom})`,
        }}
      >
        <div
          className={`wfm-breakpoint-bar${selection.includes(scene.root.id) ? " is-selected" : ""}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="wfm-breakpoint-bar__main"
            title="Switch breakpoint"
            onClick={() => {
              setAddMenuOpen(false);
              setBreakpointMenuOpen((open) => !open);
            }}
          >
            <span className="wfm-breakpoint-bar__glyph">
              <Icon name="play" size={9} />
            </span>
            <span className="wfm-breakpoint-bar__name">{breakpoint.name}</span>
            <span className="wfm-breakpoint-bar__width">{breakpoint.width}</span>
          </button>
          <button
            ref={addButtonRef}
            type="button"
            className="wfm-breakpoint-bar__add"
            title="Add breakpoint"
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            onClick={toggleAddBreakpointMenu}
          >
            <Icon name="plus" size={12} />
          </button>
        </div>

        {addMenuOpen ? (
          <div
            ref={addMenuRef}
            className="wfm-menu wfm-breakpoint-add-menu"
            style={{
              transform: `scale(${1 / zoom})`,
              maxWidth: viewportWidth > 0 ? Math.max(180, viewportWidth - 24) : undefined,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="wfm-breakpoint-add-menu__row">
              <span className="wfm-breakpoint-add-menu__label">Name</span>
              <input
                className="wfm-field wfm-breakpoint-add-menu__input"
                value={newBreakpointName}
                aria-label="Breakpoint name"
                onChange={(event) => {
                  setNewBreakpointName(event.target.value);
                  setAddBreakpointError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitAddBreakpoint();
                  }
                }}
              />
            </div>
            <div className="wfm-breakpoint-add-menu__row">
              <span className="wfm-breakpoint-add-menu__label">Width</span>
              <input
                className="wfm-field wfm-field--number wfm-breakpoint-add-menu__number"
                type="number"
                min={1}
                max={10000}
                step={1}
                value={newBreakpointWidth}
                aria-label="Breakpoint width"
                onChange={(event) => {
                  setNewBreakpointWidth(event.target.value);
                  setAddBreakpointError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitAddBreakpoint();
                  }
                }}
              />
            </div>
            {addBreakpointError ? (
              <p className="wfm-breakpoint-add-menu__error" role="alert">
                {addBreakpointError}
              </p>
            ) : null}
            <button
              type="button"
              className="wfm-breakpoint-add-menu__submit"
              onClick={submitAddBreakpoint}
            >
              Add
            </button>
          </div>
        ) : null}

        {breakpointMenuOpen ? (
          <div
            className="wfm-menu wfm-breakpoint-menu"
            style={{ transform: `scale(${1 / zoom})` }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {project.breakpoints.map((entry, index) => (
              <div
                key={entry.id}
                className={`wfm-menu__item wfm-breakpoint-menu__row ${
                  entry.id === activeBreakpointId ? "is-active" : ""
                }`}
              >
                <button
                  type="button"
                  className="wfm-breakpoint-menu__select"
                  onClick={() => {
                    setActiveBreakpoint(entry.id);
                    setBreakpointMenuOpen(false);
                  }}
                >
                  <span className="wfm-breakpoint-menu__name">{entry.name}</span>
                  <span className="wfm-menu__shortcut">{entry.width}</span>
                  {entry.id === activeBreakpointId ? <Icon name="check" size={12} /> : null}
                </button>
                {index > 0 ? (
                  <button
                    type="button"
                    className="wfm-breakpoint-menu__delete"
                    title="Remove breakpoint"
                    aria-label={`Remove breakpoint ${entry.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeBreakpoint(entry.id);
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {scene.kind === "page" && page ? (
          <PageView
            project={project}
            page={page}
            options={{
              breakpointId: activeBreakpointId,
              mode: "editor",
              editingNodeId: editing?.nodeId,
            }}
          />
        ) : (
          <div className="wfm-canvas-component-page">
            {renderNode(scene.root, project, {
              breakpointId: activeBreakpointId,
              mode: "editor",
              editingNodeId: editing?.nodeId,
              assetUrl: (asset: Asset) => asset.url,
            })}
          </div>
        )}
      </div>

      {scene.kind === "component" && scene.component && scene.variant ? (
        <ComponentBar component={scene.component} variant={scene.variant} />
      ) : null}

      <div className="wfm-canvas-overlay" aria-hidden="true">
        {hoverRect ? (
          <div
            className="wfm-canvas-hover"
            style={{
              left: hoverRect.left,
              top: hoverRect.top,
              width: hoverRect.width,
              height: hoverRect.height,
            }}
          />
        ) : null}

        {selection.length > 1 && selectionBounds ? (
          // A multi-selection gets one bounding box around every selected
          // layer, as in Framer, instead of a box per layer.
          <div
            className="wfm-selection"
            style={{
              left: selectionBounds.left,
              top: selectionBounds.top,
              width: selectionBounds.width,
              height: selectionBounds.height,
            }}
          />
        ) : (
          selection.map((nodeId) => {
            // While a text layer is open in the inline editor its own blue box
            // is the selection chrome; Framer hides the resize handles then.
            if (editing?.nodeId === nodeId) return null;
            const rect = rects.get(nodeId);
            if (!rect || rect.width <= 0 || rect.height <= 0) return null;
            const withHandles = showHandles && nodeId === singleSelectedId;
            return (
              <div
                key={nodeId}
                className="wfm-selection"
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                }}
              >
                {withHandles ? (
                  // Framer 3.0 exposes one round handle, centred on the
                  // bottom-right corner; edge resizing was replaced by this dot.
                  <div
                    className="wfm-selection__handle"
                    data-handle="se"
                    style={{ left: "100%", top: "100%" }}
                  />
                ) : null}
              </div>
            );
          })
        )}

        {pageGuides.map((guide) => (
          <div
            key={guide.id}
            className={`wfm-guide wfm-guide--${guide.axis}`}
            style={guideStyle(guide.axis, guide.position)}
            title="Drag to move, drag off the page to remove"
            onPointerDown={(event) => startGuideMove(guide, event)}
          />
        ))}

        {guidePreview ? (
          <div
            className={`wfm-guide wfm-guide--${guidePreview.axis}${
              guidePreview.outside ? " is-outside" : " is-preview"
            }`}
            style={guideStyle(guidePreview.axis, guidePreview.position)}
          />
        ) : null}

        {snapLines.map((line) => (
          <div
            key={`${line.axis}:${line.position}`}
            className={`wfm-snap-line wfm-snap-line--${line.axis}`}
            style={
              line.axis === "x"
                ? {
                    left: stageOffset.x + line.position * zoom,
                    top: stageOffset.y,
                    height: pageHeight * zoom,
                  }
                : {
                    top: stageOffset.y + line.position * zoom,
                    left: stageOffset.x,
                    width: pageWidth * zoom,
                  }
            }
          />
        ))}

        {drawRect ? (
          <div
            className="wfm-canvas-draw"
            style={{
              left: drawRect.left,
              top: drawRect.top,
              width: drawRect.width,
              height: drawRect.height,
            }}
          />
        ) : null}

        {marqueeRect ? (
          <div
            className="wfm-canvas-marquee"
            style={{
              left: marqueeRect.left,
              top: marqueeRect.top,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        ) : null}
      </div>

      {rulersVisible ? (
        <>
          <div
            className="wfm-ruler wfm-ruler--top"
            title="Drag to add a vertical guide"
            onPointerDown={(event) => startGuideCreate("x", event)}
          >
            {topMarks.map((mark) => (
              <div
                key={`${mark.value}:${mark.position}`}
                className={`wfm-ruler__tick${mark.major ? " is-major" : ""}`}
                style={{ left: mark.position }}
              >
                {mark.major ? <span className="wfm-ruler__label">{mark.value}</span> : null}
              </div>
            ))}
          </div>
          <div
            className="wfm-ruler wfm-ruler--left"
            title="Drag to add a horizontal guide"
            onPointerDown={(event) => startGuideCreate("y", event)}
          >
            {leftMarks.map((mark) => (
              <div
                key={`${mark.value}:${mark.position}`}
                className={`wfm-ruler__tick${mark.major ? " is-major" : ""}`}
                style={{ top: mark.position }}
              >
                {mark.major ? <span className="wfm-ruler__label">{mark.value}</span> : null}
              </div>
            ))}
          </div>
          <div className="wfm-ruler-corner" />
        </>
      ) : null}

      {editing && editedRect && editedText ? (
        <textarea
          ref={textareaRef}
          className="wfm-text-editor"
          style={textEditorStyle(
            editedRect,
            editedText,
            zoom,
            editedSize?.width.mode === "hug",
          )}
          value={editing.value}
          aria-label="Edit text"
          spellCheck={false}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            setEditing((current) => (current ? { ...current, value: event.target.value } : current))
          }
          onBlur={() => closeEditor(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeEditor(true);
            }
          }}
        />
      ) : null}
    </div>
  );
}
