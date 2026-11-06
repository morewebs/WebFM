/**
 * Alignment actions for the canvas.
 *
 * `computeAlignment` is a pure geometry helper; `useAlignSelection` is the
 * editor-facing hook that measures the live canvas and forwards one batched
 * position update to the project store. Alignment only applies to siblings
 * whose parent uses free layout ("none"); stacks and grids own child placement.
 */

import {
  type FrameNode,
  findNode,
  findParent,
  type NodeId,
  type Project,
  resolveNodeProps,
  type SceneNode,
} from "@webfm/model";
import { useCallback, useMemo } from "react";
import {
  type ActiveScene,
  activeSceneOf,
  type EditingComponent,
  useProjectStore,
} from "../../state/project-store";

export type AlignMode =
  | "left"
  | "center-h"
  | "right"
  | "distribute-h"
  | "top"
  | "center-v"
  | "bottom"
  | "distribute-v";

export interface AlignmentItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignmentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignmentUpdate {
  id: string;
  x: number;
  y: number;
}

function distribute(items: AlignmentItem[], axis: "h" | "v"): AlignmentUpdate[] {
  // Distribution needs two outer items plus at least one item in between.
  if (items.length < 3) return [];

  const position = (item: AlignmentItem): number => (axis === "h" ? item.x : item.y);
  const extent = (item: AlignmentItem): number => (axis === "h" ? item.width : item.height);

  const sorted = [...items].sort((a, b) => position(a) - position(b) || a.id.localeCompare(b.id));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];

  const inner = sorted.slice(1, -1);
  const startEdge = position(first) + extent(first);
  const endEdge = position(last);
  const innerExtent = inner.reduce((total, item) => total + extent(item), 0);
  const gap = (endEdge - startEdge - innerExtent) / (inner.length + 1);

  const nextPositions = new Map<string, number>();
  let cursor = startEdge;
  for (const item of inner) {
    cursor += gap;
    nextPositions.set(item.id, cursor);
    cursor += extent(item);
  }

  return sorted.map((item) => {
    const next = nextPositions.get(item.id);
    if (next === undefined) return { id: item.id, x: item.x, y: item.y };
    return axis === "h" ? { id: item.id, x: next, y: item.y } : { id: item.id, x: item.x, y: next };
  });
}

/**
 * Computes new top-left positions for the given items.
 *
 * Align modes place every item against `bounds` on one axis and leave the other
 * axis untouched. Distribute modes keep the outermost items and spread the
 * items between them so that the gaps between edges are equal.
 */
export function computeAlignment(
  items: AlignmentItem[],
  bounds: AlignmentBounds,
  mode: AlignMode,
): AlignmentUpdate[] {
  if (items.length === 0) return [];

  switch (mode) {
    case "left":
      return items.map((item) => ({ id: item.id, x: bounds.x, y: item.y }));
    case "center-h":
      return items.map((item) => ({
        id: item.id,
        x: bounds.x + (bounds.width - item.width) / 2,
        y: item.y,
      }));
    case "right":
      return items.map((item) => ({
        id: item.id,
        x: bounds.x + bounds.width - item.width,
        y: item.y,
      }));
    case "top":
      return items.map((item) => ({ id: item.id, x: item.x, y: bounds.y }));
    case "center-v":
      return items.map((item) => ({
        id: item.id,
        x: item.x,
        y: bounds.y + (bounds.height - item.height) / 2,
      }));
    case "bottom":
      return items.map((item) => ({
        id: item.id,
        x: item.x,
        y: bounds.y + bounds.height - item.height,
      }));
    case "distribute-h":
      return distribute(items, "h");
    case "distribute-v":
      return distribute(items, "v");
    default:
      return [];
  }
}

interface AlignContext {
  scene: ActiveScene;
  nodes: SceneNode[];
  parent: FrameNode;
}

/**
 * Resolves a valid alignment selection: one or more nodes, none of them the
 * scene root, all sharing a parent that does not lay its children out itself.
 */
function selectionAlignContext(
  project: Project | null,
  activePageId: string,
  editingComponent: EditingComponent | null,
  activeBreakpointId: string,
  selection: NodeId[],
): AlignContext | null {
  if (!project || selection.length === 0) return null;
  const scene = activeSceneOf(project, activePageId, editingComponent);
  if (!scene) return null;
  if (selection.includes(scene.root.id)) return null;

  const nodes: SceneNode[] = [];
  for (const nodeId of selection) {
    const node = findNode(scene.root, nodeId);
    if (!node) return null;
    nodes.push(node);
  }
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) return null;

  const parents = nodes.map((node) => findParent(scene.root, node.id));
  const parent = parents[0];
  if (!parent || parents.some((candidate) => candidate?.id !== parent.id)) return null;

  const layout = resolveNodeProps(parent, activeBreakpointId, project.breakpoints).layout;
  if (layout.mode !== "none") return null;

  return { scene, nodes, parent };
}

function findNodeElement(stage: HTMLElement, nodeId: NodeId): HTMLElement | null {
  const elements = stage.querySelectorAll<HTMLElement>("[data-node-id]");
  for (const element of elements) {
    if (element.dataset.nodeId === nodeId) return element;
  }
  return null;
}

function unionBounds(items: AlignmentItem[]): AlignmentBounds {
  const first = items[0];
  if (!first) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;
  for (const item of items.slice(1)) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface AlignSelection {
  align(mode: AlignMode): void;
  canAlign(mode: AlignMode): boolean;
}

/**
 * Alignment actions backed by the live canvas. `align` measures the selected
 * nodes and their parent, converts to scene coordinates, and writes one
 * history entry through `setNodePositions`.
 */
export function useAlignSelection(): AlignSelection {
  const project = useProjectStore((state) => state.project);
  const activePageId = useProjectStore((state) => state.activePageId);
  const editingComponent = useProjectStore((state) => state.editingComponent);
  const activeBreakpointId = useProjectStore((state) => state.activeBreakpointId);
  const selection = useProjectStore((state) => state.selection);
  const zoom = useProjectStore((state) => state.zoom);

  const context = useMemo(
    () =>
      selectionAlignContext(project, activePageId, editingComponent, activeBreakpointId, selection),
    [project, activePageId, editingComponent, activeBreakpointId, selection],
  );

  const canAlign = useCallback(
    (mode: AlignMode): boolean => {
      if (!context) return false;
      const count = context.nodes.length;
      if (count === 0) return false;
      if ((mode === "distribute-h" || mode === "distribute-v") && count < 3) return false;
      return true;
    },
    [context],
  );

  const align = useCallback(
    (mode: AlignMode): void => {
      if (!project || !context) return;
      if ((mode === "distribute-h" || mode === "distribute-v") && context.nodes.length < 3) return;
      if (!Number.isFinite(zoom) || zoom <= 0) return;

      const stage = document.querySelector<HTMLElement>(".wfm-canvas-stage");
      if (!stage) return;
      const parentElement = findNodeElement(stage, context.parent.id);
      if (!parentElement) return;

      const stageRect = stage.getBoundingClientRect();
      const toScene = (rect: DOMRect): { x: number; y: number; width: number; height: number } => ({
        x: (rect.left - stageRect.left) / zoom,
        y: (rect.top - stageRect.top) / zoom,
        width: rect.width / zoom,
        height: rect.height / zoom,
      });

      const parentRect = toScene(parentElement.getBoundingClientRect());
      // Absolute children position from the parent's padding box, inside its border.
      const parentStyle = window.getComputedStyle(parentElement);
      const borderLeft = Number.parseFloat(parentStyle.borderLeftWidth) || 0;
      const borderTop = Number.parseFloat(parentStyle.borderTopWidth) || 0;
      const borderRight = Number.parseFloat(parentStyle.borderRightWidth) || 0;
      const borderBottom = Number.parseFloat(parentStyle.borderBottomWidth) || 0;

      const items: AlignmentItem[] = [];
      for (const node of context.nodes) {
        const element = findNodeElement(stage, node.id);
        if (!element) return;
        const rect = toScene(element.getBoundingClientRect());
        items.push({
          id: node.id,
          x: rect.x - parentRect.x - borderLeft,
          y: rect.y - parentRect.y - borderTop,
          width: rect.width,
          height: rect.height,
        });
      }

      const padding = resolveNodeProps(context.parent, activeBreakpointId, project.breakpoints)
        .layout.padding;
      const bounds: AlignmentBounds =
        items.length === 1
          ? {
              x: padding.left,
              y: padding.top,
              width: Math.max(
                0,
                parentRect.width - borderLeft - borderRight - padding.left - padding.right,
              ),
              height: Math.max(
                0,
                parentRect.height - borderTop - borderBottom - padding.top - padding.bottom,
              ),
            }
          : unionBounds(items);

      const updates = computeAlignment(items, bounds, mode).map((update) => ({
        nodeId: update.id,
        x: update.x,
        y: update.y,
      }));
      if (updates.length === 0) return;

      useProjectStore.getState().setNodePositions(updates, `Align ${mode}`);
    },
    [project, context, activeBreakpointId, zoom],
  );

  return { align, canAlign };
}
