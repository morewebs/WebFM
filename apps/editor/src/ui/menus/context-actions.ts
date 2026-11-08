/**
 * Actions and clipboard for the editor context menus.
 *
 * Framer's context menus edit the document through the same project store as
 * the panels, so every mutation here goes through `applyRecipe` (one undo entry)
 * and the active scene target. The internal clipboard stays in this module: the
 * editor does not touch the system clipboard except for plain text and node ids.
 */

import {
  type BoxProps,
  collectNodes,
  type DeepPartial,
  type Fill,
  findNode,
  findParent,
  getTargetRoot,
  insertNode,
  isSelfOrDescendant,
  moveNode as moveNodeOperation,
  type NodeId,
  type Overflow,
  type Project,
  renameNode,
  resolveNodeProps,
  type SceneNode,
  setNodeLocked,
  setNodeVisible,
  updateBoxProps,
  updateInstanceStyle as updateInstanceStyleOperation,
} from "@webfm/model";
import { resolveInstanceBox } from "@webfm/render";
import { type ActiveScene, activeSceneOf, useProjectStore } from "../../state/project-store";
import { useUIStore } from "../ui-store";

/* --------------------------------------------------------------- clipboard */

interface InternalClipboard {
  style?: DeepPartial<BoxProps>;
  fill?: Fill | null;
  text?: string;
}

let clipboard: InternalClipboard = {};

export function clearClipboard(): void {
  clipboard = {};
}

export function clipboardHasNodes(): boolean {
  return useProjectStore.getState().hasClipboardNodes();
}

export function clipboardHasStyle(): boolean {
  return clipboard.style !== undefined;
}

export function clipboardHasFill(): boolean {
  return "fill" in clipboard;
}

/** Highest selected nodes, so copying a parent and child does not duplicate twice. */
export function topLevelNodeIds(root: SceneNode, selection: readonly NodeId[]): NodeId[] {
  const unique = [...new Set(selection)].filter(
    (id) => id !== root.id && findNode(root, id) !== null,
  );
  return unique.filter(
    (id) => !unique.some((other) => other !== id && isSelfOrDescendant(root, other, id)),
  );
}

/* ------------------------------------------------------------------ context */

interface EditorContext {
  scene: ActiveScene;
  project: Project;
  breakpointId: string;
  selection: NodeId[];
}

function currentContext(): EditorContext | null {
  const state = useProjectStore.getState();
  const scene = activeSceneOf(state.project, state.activePageId, state.editingComponent);
  if (!state.project || !scene) return null;
  return {
    scene,
    project: state.project,
    breakpointId: state.activeBreakpointId,
    selection: state.selection,
  };
}

function targetNode(context: EditorContext, nodeId?: NodeId): SceneNode | null {
  const id = nodeId ?? context.selection[0];
  return id ? findNode(context.scene.root, id) : null;
}

/** The menu node plus the rest of the selection when it belongs to the selection. */
function actionTargetIds(context: EditorContext, nodeId: NodeId): NodeId[] {
  const topLevel = topLevelNodeIds(context.scene.root, context.selection);
  if (!topLevel.includes(nodeId)) return [nodeId];
  return topLevel;
}

function writeClipboardText(value: string): void {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  void navigator.clipboard.writeText(value).catch(() => undefined);
}

/* ------------------------------------------------------------------ copy */

export function copySelection(): void {
  // One clipboard for the whole editor: Cmd+C and the context menu share it.
  useProjectStore.getState().copySelection();
}

/** The appearance a node actually renders, including instance overrides. */
function effectiveBox(node: SceneNode, context: { project: Project; breakpointId: string }): BoxProps {
  if (node.type === "componentInstance") {
    return (
      resolveInstanceBox(context.project, node, context.breakpointId) ??
      resolveNodeProps(node, context.breakpointId, context.project.breakpoints)
    );
  }
  return resolveNodeProps(node, context.breakpointId, context.project.breakpoints);
}

export function copyStyle(nodeId?: NodeId): void {
  const context = currentContext();
  const node = context ? targetNode(context, nodeId) : null;
  if (!context || !node) return;
  const base = effectiveBox(node, context);
  clipboard.style = structuredClone({
    style: base.style,
    layout: base.layout,
  }) as DeepPartial<BoxProps>;
}

export function copyFill(nodeId?: NodeId): void {
  const context = currentContext();
  const node = context ? targetNode(context, nodeId) : null;
  if (!context || !node) return;
  clipboard.fill = structuredClone(effectiveBox(node, context).style.fill);
}

export function copyText(nodeId?: NodeId): void {
  const context = currentContext();
  const node = context ? targetNode(context, nodeId) : null;
  if (!context || !node || node.type !== "text") return;
  const props = resolveNodeProps(node, context.breakpointId, context.project.breakpoints);
  clipboard.text = props.text.content;
  writeClipboardText(props.text.content);
}

export function copyNodeId(nodeId?: NodeId): void {
  const context = currentContext();
  const node = context ? targetNode(context, nodeId) : null;
  if (!node) return;
  writeClipboardText(node.id);
}

/* ----------------------------------------------------------------- paste */

export function pasteSelection(): void {
  // The store picks the container and assigns fresh ids per paste.
  useProjectStore.getState().pasteClipboard();
}

/** Paste in place currently behaves like paste; the position offset is not modelled. */
export function pasteInPlace(): void {
  pasteSelection();
}

export function pasteStyle(): void {
  const context = currentContext();
  const patch = clipboard.style;
  if (!context || !patch) return;
  const ids = topLevelNodeIds(context.scene.root, context.selection);
  if (ids.length === 0) return;
  useProjectStore.getState().applyRecipe("Paste style", (draft) => {
    for (const nodeId of ids) {
      const node = findNode(context.scene.root, nodeId);
      if (node?.type === "componentInstance") {
        if (patch.style !== undefined) {
          updateInstanceStyleOperation(draft, {
            ...context.scene.target,
            nodeId,
            breakpointId: context.breakpointId,
            patch: patch.style,
          });
        }
        continue;
      }
      updateBoxProps(draft, {
        ...context.scene.target,
        nodeId,
        breakpointId: context.breakpointId,
        patch,
      });
    }
  });
}

export function pasteFill(): void {
  const context = currentContext();
  if (!context || !("fill" in clipboard)) return;
  const ids = topLevelNodeIds(context.scene.root, context.selection);
  if (ids.length === 0) return;
  const fill = clipboard.fill;
  useProjectStore.getState().applyRecipe("Paste fill", (draft) => {
    for (const nodeId of ids) {
      const node = findNode(context.scene.root, nodeId);
      if (node?.type === "componentInstance") {
        updateInstanceStyleOperation(draft, {
          ...context.scene.target,
          nodeId,
          breakpointId: context.breakpointId,
          patch: { fill: fill ?? null },
        });
        continue;
      }
      updateBoxProps(draft, {
        ...context.scene.target,
        nodeId,
        breakpointId: context.breakpointId,
        patch: { style: { fill: fill ?? null } },
      });
    }
  });
}

/* --------------------------------------------------------------- selection */

export type SelectRelatedKind =
  | "top-parent"
  | "parent"
  | "all"
  | "siblings"
  | "children"
  | "text-layers";

export interface SelectRelatedAvailability {
  parent: boolean;
  siblings: boolean;
  children: boolean;
  textLayers: boolean;
}

/** Which Select submenu entries have something to select for this node. */
export function selectAvailability(node: SceneNode, root: SceneNode): SelectRelatedAvailability {
  const parent = findParent(root, node.id);
  const textLayers = collectNodes(root).some(
    (candidate) => candidate.type === "text" && candidate.id !== root.id,
  );
  return {
    parent: parent !== null || node.id !== root.id,
    siblings: parent !== null,
    children: node.type === "frame" && node.children.length > 0,
    textLayers,
  };
}

export function selectRelated(nodeId: NodeId, kind: SelectRelatedKind): void {
  const context = currentContext();
  if (!context) return;
  const root = context.scene.root;
  const node = findNode(root, nodeId);
  if (!node) return;
  const store = useProjectStore.getState();

  if (kind === "top-parent") {
    store.selectMany([root.id]);
    return;
  }
  if (kind === "all") {
    store.selectMany(
      collectNodes(root)
        .filter((candidate) => candidate.id !== root.id)
        .map((candidate) => candidate.id),
    );
    return;
  }
  if (kind === "text-layers") {
    store.selectMany(
      collectNodes(root)
        .filter((candidate) => candidate.type === "text" && candidate.id !== root.id)
        .map((candidate) => candidate.id),
    );
    return;
  }
  if (kind === "children") {
    store.selectMany(node.type === "frame" ? node.children.map((child) => child.id) : []);
    return;
  }

  const parent = findParent(root, nodeId);
  if (!parent) return;
  if (kind === "parent") {
    store.selectMany([parent.id]);
    return;
  }
  store.selectMany(parent.children.map((child) => child.id));
}

/* ------------------------------------------------------------------ align */

export function alignSelection(mode: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wfm:align", { detail: mode }));
}

/* ------------------------------------------------------------- layer order */

export type MoveKind = "front" | "forward" | "backward" | "back";

export function moveSelectedNode(nodeId: NodeId, kind: MoveKind): void {
  const context = currentContext();
  if (!context) return;
  const parent = findParent(context.scene.root, nodeId);
  if (!parent) return;
  const index = parent.children.findIndex((child) => child.id === nodeId);
  if (index === -1) return;
  // `moveNode` interprets the index after removing the node.
  const targetIndex =
    kind === "front"
      ? parent.children.length
      : kind === "forward"
        ? index + 1
        : kind === "backward"
          ? index - 1
          : 0;
  useProjectStore.getState().applyRecipe("Move layer", (draft) => {
    moveNodeOperation(draft, {
      ...context.scene.target,
      nodeId,
      parentId: parent.id,
      index: targetIndex,
    });
  });
}

/* ---------------------------------------------------------- rename and state */

export function requestRename(nodeId: NodeId): void {
  if (typeof window === "undefined") return;
  // The rename field lives in the Layers panel; bring it back before asking it
  // to open, otherwise the event has no mounted listener.
  useUIStore.getState().setLeftTab("layers");
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("wfm:rename-node", { detail: nodeId }));
  }, 30);
}

/** The automatic name for a node: text content, or the node's kind. */
export function automaticName(
  context: Pick<EditorContext, "project" | "breakpointId" | "scene">,
  node: SceneNode,
): string {
  if (node.type === "text") {
    const props = resolveNodeProps(node, context.breakpointId, context.project.breakpoints);
    const content = props.text.content.slice(0, 24).trim();
    return content.length > 0 ? content : "Text";
  }
  if (node.type === "image") return "Image";
  if (node.type === "componentInstance") {
    const component = context.project.components.find(
      (candidate) => candidate.id === node.componentId,
    );
    return component?.name ?? "Component";
  }
  const props = resolveNodeProps(node, context.breakpointId, context.project.breakpoints);
  if (props.layout.mode === "stack") return "Stack";
  if (props.layout.mode === "grid") return "Grid";
  return "Frame";
}

export function autoRenameNode(nodeId: NodeId): void {
  const context = currentContext();
  if (!context) return;
  const node = findNode(context.scene.root, nodeId);
  if (!node || node.id === context.scene.root.id) return;
  const name = automaticName(context, node);
  if (name === node.name) return;
  useProjectStore.getState().applyRecipe("Auto rename layer", (draft) => {
    renameNode(draft, { ...context.scene.target, nodeId }, name);
  });
}

export function toggleNodeLock(nodeId: NodeId): void {
  useProjectStore.getState().toggleLock(nodeId);
}

export function toggleNodeVisibility(nodeId: NodeId): void {
  useProjectStore.getState().toggleVisibility(nodeId);
}

export function setNodeOverflow(nodeId: NodeId, overflow: Overflow): void {
  useProjectStore.getState().updateBox(nodeId, { style: { overflow } });
}

/* ------------------------------------------------------------- breakpoints */

/** The base name, or "Tablet 2", "Tablet 3", … when it is already used. */
export function uniqueBreakpointName(existingNames: readonly string[], base: string): string {
  const taken = new Set(existingNames);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

export function addBreakpointPreset(base: string, width: number): void {
  const state = useProjectStore.getState();
  if (!state.project) return;
  const name = uniqueBreakpointName(
    state.project.breakpoints.map((breakpoint) => breakpoint.name),
    base,
  );
  state.addBreakpoint(name, width);
}

export function requestCustomBreakpoint(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wfm:add-breakpoint"));
}

/* -------------------------------------------------------------- components */

export function createComponentAt(nodeId: NodeId): void {
  const state = useProjectStore.getState();
  state.select(nodeId);
  state.createComponentFromSelection();
}

export function editMainComponent(nodeId: NodeId): void {
  const context = currentContext();
  const node = context && findNode(context.scene.root, nodeId);
  if (node?.type !== "componentInstance") return;
  useProjectStore.getState().enterComponent(node.componentId, node.variantId ?? undefined, node.id);
}

/* ------------------------------------------------------------- canvas view */

export function zoomTo100(): void {
  useProjectStore.getState().setZoom(1);
}

export function zoomToFit(): void {
  // The canvas computes the fit from its measured viewport and page size.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("wfm:zoom-to-fit"));
  }
}

/** Recursively sorts every frame's children by name; the root keeps its place. */
export function sortSceneAlphabetically(root: SceneNode): void {
  if (root.type !== "frame") return;
  for (const child of root.children) sortSceneAlphabetically(child);
  root.children.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );
}

export function sortLayersAlphabetically(): void {
  const context = currentContext();
  if (!context) return;
  useProjectStore.getState().applyRecipe("Sort layers alphabetically", (draft) => {
    const root = getTargetRoot(draft, context.scene.target) as unknown as SceneNode;
    sortSceneAlphabetically(root);
  });
}

/* ------------------------------------------------------------- wrapping */

/**
 * Grouping/wrapping actions read the live canvas so the new Frame or Stack
 * matches the layers' on-screen bounds. App and the menus call these functions
 * directly; there are no window events to install.
 */

interface SceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function findCanvasNodeElement(stage: HTMLElement, nodeId: NodeId): HTMLElement | null {
  const elements = stage.querySelectorAll<HTMLElement>("[data-node-id]");
  for (const element of elements) {
    if (element.dataset.nodeId === nodeId) return element;
  }
  return null;
}

/** Measures an element in scene coordinates (unscaled stage space). */
function sceneRectOf(
  element: HTMLElement,
  stageRect: DOMRect,
  zoom: number,
): SceneRect {
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left - stageRect.left) / zoom,
    y: (rect.top - stageRect.top) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom,
  };
}

function borderOffsets(element: HTMLElement): { left: number; top: number } {
  const style = window.getComputedStyle(element);
  return {
    left: Number.parseFloat(style.borderLeftWidth) || 0,
    top: Number.parseFloat(style.borderTopWidth) || 0,
  };
}

/**
 * Wraps the current top-level selection in a Frame (`kind: "frame"`) or a
 * vertical Stack. Measures the selected node elements and their shared parent,
 * then hands the union bounds and per-node positions to the store.
 */
export function wrapSelection(kind: "frame" | "stack"): void {
  if (typeof document === "undefined") return;
  const state = useProjectStore.getState();
  const scene = activeSceneOf(state.project, state.activePageId, state.editingComponent);
  if (!state.project || !scene) return;
  const zoom = state.zoom;
  if (!Number.isFinite(zoom) || zoom <= 0) return;

  const nodeIds = topLevelNodeIds(scene.root, state.selection);
  if (nodeIds.length === 0) return;

  const firstId = nodeIds[0];
  const firstNode = firstId ? findNode(scene.root, firstId) : null;
  const parent = firstNode ? findParent(scene.root, firstNode.id) : null;
  if (!parent) return;

  // The model rejects a cross-parent wrap; the DOM is only meaningful when all
  // selected layers share the same parent element.
  for (const nodeId of nodeIds) {
    const node = findNode(scene.root, nodeId);
    const candidate = node ? findParent(scene.root, nodeId) : null;
    if (!candidate || candidate.id !== parent.id) return;
  }

  const stage = document.querySelector<HTMLElement>(".wfm-canvas-stage");
  if (!stage) return;
  const parentElement = findCanvasNodeElement(stage, parent.id);
  if (!parentElement) return;

  const stageRect = stage.getBoundingClientRect();
  const parentRect = sceneRectOf(parentElement, stageRect, zoom);
  const border = borderOffsets(parentElement);

  const measured: Array<{ id: NodeId; rect: SceneRect }> = [];
  for (const nodeId of nodeIds) {
    const element = findCanvasNodeElement(stage, nodeId);
    if (!element) return;
    const rect = sceneRectOf(element, stageRect, zoom);
    measured.push({
      id: nodeId,
      rect: {
        x: rect.x - parentRect.x - border.left,
        y: rect.y - parentRect.y - border.top,
        width: rect.width,
        height: rect.height,
      },
    });
  }

  const first = measured[0];
  if (!first) return;
  let minX = first.rect.x;
  let minY = first.rect.y;
  let maxX = first.rect.x + first.rect.width;
  let maxY = first.rect.y + first.rect.height;
  for (const item of measured.slice(1)) {
    minX = Math.min(minX, item.rect.x);
    minY = Math.min(minY, item.rect.y);
    maxX = Math.max(maxX, item.rect.x + item.rect.width);
    maxY = Math.max(maxY, item.rect.y + item.rect.height);
  }

  const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  const positions: Record<NodeId, { x: number; y: number }> = {};
  for (const item of measured) {
    positions[item.id] = { x: item.rect.x - minX, y: item.rect.y - minY };
  }

  state.wrapSelection(kind, bounds, positions);
}

/**
 * Removes a frame wrapper. `nodeId` defaults to the selected frame, or the
 * selected layer's parent frame. Children are measured relative to the frame's
 * parent so their on-screen position survives the unwrap.
 */
export function unwrapSelection(nodeId?: NodeId): void {
  if (typeof document === "undefined") return;
  const state = useProjectStore.getState();
  const scene = activeSceneOf(state.project, state.activePageId, state.editingComponent);
  if (!state.project || !scene) return;
  const zoom = state.zoom;
  if (!Number.isFinite(zoom) || zoom <= 0) return;

  const topLevel = topLevelNodeIds(scene.root, state.selection);
  let frameId = nodeId ?? topLevel[0];
  if (frameId === undefined) return;

  const node = findNode(scene.root, frameId);
  if (!node || node.id === scene.root.id) return;
  if (node.type !== "frame") {
    frameId = findParent(scene.root, node.id)?.id;
    if (frameId === undefined || frameId === scene.root.id) return;
  }

  const frame = findNode(scene.root, frameId);
  const parent = findParent(scene.root, frameId);
  if (!frame || frame.type !== "frame" || !parent) return;

  const stage = document.querySelector<HTMLElement>(".wfm-canvas-stage");
  if (!stage) return;
  const parentElement = findCanvasNodeElement(stage, parent.id);
  if (!parentElement) {
    // Without a measurable parent the model still rebases from the frame origin.
    useProjectStore.getState().unwrapSelection(frameId);
    return;
  }

  const stageRect = stage.getBoundingClientRect();
  const parentRect = sceneRectOf(parentElement, stageRect, zoom);
  const border = borderOffsets(parentElement);
  const childPositions: Record<NodeId, { x: number; y: number }> = {};
  for (const child of frame.children) {
    const element = findCanvasNodeElement(stage, child.id);
    if (!element) continue;
    const rect = sceneRectOf(element, stageRect, zoom);
    childPositions[child.id] = {
      x: rect.x - parentRect.x - border.left,
      y: rect.y - parentRect.y - border.top,
    };
  }

  useProjectStore.getState().unwrapSelection(frameId, childPositions);
}

/* ------------------------------------------------------------- menu entries */

export interface MenuEntryItem {
  kind: "item";
  label: string;
  shortcut?: string;
  disabled?: boolean;
  /** Tooltip shown for unavailable actions, e.g. "Agent is not in this build". */
  note?: string;
  checked?: boolean;
  children?: MenuEntry[];
  run?: () => void;
}

export interface MenuSeparator {
  kind: "separator";
}

export type MenuEntry = MenuEntryItem | MenuSeparator;

export function menuItem(
  label: string,
  options: Omit<MenuEntryItem, "kind" | "label"> = {},
): MenuEntryItem {
  return { kind: "item", label, ...options };
}

export const menuSeparator: MenuSeparator = { kind: "separator" };

/** Removes leading, trailing and doubled separators from a menu list. */
export function stripSeparators(entries: readonly MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "separator") {
      if (out.length > 0 && out[out.length - 1]?.kind !== "separator") out.push(entry);
      continue;
    }
    out.push(entry);
  }
  while (out.length > 0 && out[out.length - 1]?.kind === "separator") out.pop();
  return out;
}

function labelMatches(entry: MenuEntryItem, query: string): boolean {
  return entry.label.toLowerCase().includes(query);
}

/**
 * Filters both top-level labels and submenu labels. A parent stays visible when
 * one of its children matches; when the parent itself matches its submenu is
 * kept intact.
 */
export function filterMenuEntries(entries: readonly MenuEntry[], rawQuery: string): MenuEntry[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return stripSeparators(entries);

  const out: MenuEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "separator") {
      out.push(entry);
      continue;
    }
    if (labelMatches(entry, query)) {
      out.push(entry);
      continue;
    }
    if (entry.children && entry.children.length > 0) {
      const matchingChildren = stripSeparators(
        entry.children.filter(
          (child): child is MenuEntryItem => child.kind === "item" && labelMatches(child, query),
        ),
      );
      if (matchingChildren.length > 0) {
        out.push({ ...entry, children: matchingChildren });
      }
    }
  }
  return stripSeparators(out);
}
