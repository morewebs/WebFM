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
  findNode,
  findParent,
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
  useRef,
  useState,
} from "react";
import { activeBreakpointOf, activeSceneOf, useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import { type EditorTool, useUIStore } from "../ui-store";
import { ComponentBar } from "./ComponentBar";
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
    tool === "frame" || tool === "stack" || tool === "text" || tool === "image" || tool === "oval"
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

function findNodeElement(stage: HTMLElement, nodeId: NodeId): HTMLElement | null {
  const elements = stage.querySelectorAll<HTMLElement>("[data-node-id]");
  for (const element of elements) {
    if (element.dataset.nodeId === nodeId) return element;
  }
  return null;
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
    if (!node || node.locked) continue;
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
          style: { radius: OVAL_RADIUS },
        },
      });
    case "image":
      return createImage({
        props: { position, size: fixedSize ?? DEFAULT_IMAGE_SIZE },
      });
    case "text":
      return createText({
        props: { position, ...(fixedSize ? { size: fixedSize } : {}) },
      });
    default:
      return createFrame({
        props: { position, size: fixedSize ?? DEFAULT_FRAME_SIZE },
      });
  }
}

function textEditorStyle(rect: CanvasRect, text: TextContent, zoom: number): CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    fontFamily: text.fontFamily,
    fontSize: text.fontSize * zoom,
    fontWeight: text.fontWeight,
    lineHeight: text.lineHeight === "auto" ? "normal" : text.lineHeight * zoom,
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

type Session = MoveSession | ResizeSession | PanSession | DrawSession;

interface EditingState {
  nodeId: NodeId;
  value: string;
  original: string;
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

  const tool = useUIStore((state) => state.tool);

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

  const [viewportWidth, setViewportWidth] = useState(0);
  const [rects, setRects] = useState<Map<NodeId, CanvasRect>>(() => new Map());
  const [drawRect, setDrawRect] = useState<CanvasRect | null>(null);
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
    const viewportRect = viewport.getBoundingClientRect();
    const next = new Map<NodeId, CanvasRect>();
    const elements = stage.querySelectorAll<HTMLElement>("[data-node-id]");
    for (const element of elements) {
      const nodeId = element.dataset.nodeId;
      if (!nodeId) continue;
      next.set(nodeId, measureNodeRect(stage, viewportRect, element));
    }
    rectsRef.current = next;
    setRects(next);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = (): void => {
      const width = viewport.clientWidth;
      setViewportWidth((current) => (current === width ? current : width));
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
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const state = useProjectStore.getState();
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
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [pageWidth]);

  /* -------------------------------------------------------------- keyboard */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return;

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

  /* --------------------------------------------------------------- editing */

  const editingNodeId = editing?.nodeId;

  useEffect(() => {
    if (!editingNodeId) return;
    const frame = requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editingNodeId]);

  const closeEditor = (commit: boolean): void => {
    if (editorClosedRef.current) return;
    editorClosedRef.current = true;
    const current = editing;
    if (current && commit && current.value !== current.original) {
      updateText(current.nodeId, { text: { content: current.value } });
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

  const updateHover = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = useProjectStore.getState();
    if (useUIStore.getState().tool !== "select") return;
    const scene = activeSceneOf(state.project, state.activePageId, state.editingComponent);
    if (!scene) return;
    const target = event.target as HTMLElement | null;
    const nodeElement = target?.closest<HTMLElement>("[data-node-id]");
    const nodeId = nodeElement?.dataset.nodeId;
    const node = nodeId ? findNode(scene.root, nodeId) : null;
    state.setHovered(node && node.id !== scene.root.id && !node.locked ? node.id : null);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(".wfm-text-editor")) return;
    if (event.button === 2) return;

    setBreakpointMenuOpen(false);
    setAddMenuOpen(false);

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
      if (!nodeId || !node || node.locked || node.id === currentScene.root.id) return;
      const element = findNodeElement(stage, nodeId);
      if (!element) return;

      const props = resolveNodeProps(node, state.activeBreakpointId, currentProject.breakpoints);
      const elementRect = element.getBoundingClientRect();
      const parent = findParent(currentScene.root, nodeId);
      const movable = parent
        ? resolveNodeProps(parent, state.activeBreakpointId, currentProject.breakpoints).layout
            .mode === "none"
        : false;

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

    const nodeElement = target.closest<HTMLElement>("[data-node-id]");
    if (!nodeElement) {
      state.clearSelection();
      state.setHovered(null);
      return;
    }

    const nodeId = nodeElement.dataset.nodeId;
    const node = nodeId ? findNode(currentScene.root, nodeId) : null;
    if (!nodeId || !node || node.locked) return;

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

    sessionRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      target: currentScene.target,
      breakpointId: state.activeBreakpointId,
      startClient: { x: event.clientX, y: event.clientY },
      startPositions,
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
      const delta = constrainDelta(clientDx / state.zoom, clientDy / state.zoom, event.shiftKey);
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
    const patch: DeepPartial<BoxProps> = {
      size: {
        width: { mode: "fixed", value: Math.max(1, Math.round(next.width)) },
        height: { mode: "fixed", value: Math.max(1, Math.round(next.height)) },
      },
    };
    if (session.movable) {
      patch.position = {
        x: Math.round(next.left),
        y: Math.round(next.top),
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
    state.insertNode(node, { parentId });
    useUIStore.getState().setTool("select");
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    setDrawRect(null);
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    if (session.kind === "draw") finishDraw(session, event);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    setDrawRect(null);
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerLeave = (): void => {
    if (!sessionRef.current) useProjectStore.getState().setHovered(null);
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const state = useProjectStore.getState();
    const currentProject = state.project;
    const currentScene = activeSceneOf(currentProject, state.activePageId, state.editingComponent);
    if (!currentProject || !currentScene) return;
    const target = event.target as HTMLElement | null;
    const nodeElement = target?.closest<HTMLElement>("[data-node-id]");
    const nodeId = nodeElement?.dataset.nodeId;
    if (!nodeElement || !nodeId) return;
    const node = findNode(currentScene.root, nodeId);
    if (!node || node.locked) return;
    if (node.type === "componentInstance") {
      event.preventDefault();
      state.enterComponent(node.componentId, node.variantId ?? undefined, node.id);
      return;
    }
    if (node.type !== "text") return;
    const props = resolveNodeProps(node, state.activeBreakpointId, currentProject.breakpoints);
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (stage && viewport) {
      const next = new Map(rectsRef.current);
      next.set(nodeId, measureNodeRect(stage, viewport.getBoundingClientRect(), nodeElement));
      rectsRef.current = next;
      setRects(next);
    }
    event.preventDefault();
    editorClosedRef.current = false;
    setEditing({
      nodeId,
      value: props.text.content,
      original: props.text.content,
    });
  };

  /* ----------------------------------------------------------------- render */

  if (!project || !scene || !breakpoint) return null;

  const stageOffset = centeredStageOffset(viewportWidth, pageWidth, zoom, pan);
  const singleSelectedId = selection.length === 1 ? selection[0] : undefined;
  const singleSelectedNode = singleSelectedId ? findNode(scene.root, singleSelectedId) : null;
  const showHandles =
    singleSelectedNode !== null &&
    singleSelectedNode.id !== scene.root.id &&
    !singleSelectedNode.locked;

  const hoveredNode = hoveredNodeId ? findNode(scene.root, hoveredNodeId) : null;
  const hoverRect =
    hoveredNode &&
    hoveredNode.id !== scene.root.id &&
    !hoveredNode.locked &&
    !selection.includes(hoveredNode.id)
      ? (rects.get(hoveredNode.id) ?? null)
      : null;

  const editedNode = editing ? findNode(scene.root, editing.nodeId) : null;
  const editedText =
    editedNode?.type === "text"
      ? resolveNodeProps(editedNode, activeBreakpointId, project.breakpoints).text
      : null;
  const editedRect = editing ? (rects.get(editing.nodeId) ?? null) : null;

  const cursorClass =
    tool === "hand" || spaceDown ? "is-hand" : isDrawTool(tool) ? "is-draw" : "is-select";

  return (
    <div
      ref={viewportRef}
      className={`wfm-canvas-viewport ${cursorClass}`}
      role="application"
      aria-label="Canvas"
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
            options={{ breakpointId: activeBreakpointId, mode: "editor" }}
          />
        ) : (
          <div className="wfm-canvas-component-page">
            {renderNode(scene.root, project, {
              breakpointId: activeBreakpointId,
              mode: "editor",
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

        {selection.map((nodeId) => {
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
              {withHandles
                ? RESIZE_HANDLES.map((entry) => (
                    <div
                      key={entry.handle}
                      className="wfm-selection__handle"
                      data-handle={entry.handle}
                      style={{ left: `${entry.x * 100}%`, top: `${entry.y * 100}%` }}
                    />
                  ))
                : null}
            </div>
          );
        })}

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
      </div>

      {editing && editedRect && editedText ? (
        <textarea
          ref={textareaRef}
          className="wfm-text-editor"
          style={textEditorStyle(editedRect, editedText, zoom)}
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
              editorClosedRef.current = true;
              setEditing(null);
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      ) : null}
    </div>
  );
}
