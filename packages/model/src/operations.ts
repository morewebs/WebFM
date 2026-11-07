/**
 * Document operations.
 *
 * Every operation mutates an Immer draft, so the editor can wrap any of them in
 * `produce`/`produceWithPatches` and history comes for free. Operations throw a
 * descriptive error when they are handed a page, component, variant, node,
 * parent or breakpoint that does not exist.
 *
 * Node operations accept a `SceneTarget`, which addresses either a page or one
 * component variant. Page-based calls keep the old `{ pageId, nodeId }` shape.
 */

import { castDraft, current, type Draft, isDraft } from "immer";
import {
  createComponentDefinition,
  createFrame,
  createPage,
  createResponsive,
  mergeDeep,
} from "./defaults";
import { createId } from "./ids";
import { findComponentInstances } from "./tree";
import type {
  BoxProps,
  BreakpointId,
  ComponentDefinition,
  ComponentId,
  ComponentInstanceNode,
  ComponentProperty,
  ComponentPropertyValue,
  ComponentVariant,
  DeepPartial,
  Fill,
  FrameNode,
  ImageProps,
  Interaction,
  InteractionDirection,
  InteractionEasing,
  InteractionEffect,
  InteractionTrigger,
  NodeId,
  NodeLocation,
  Page,
  PageId,
  Project,
  PropertyBinding,
  PropertyId,
  PublishConfig,
  Responsive,
  SceneNode,
  SceneTarget,
  TextProps,
  VariantId,
} from "./types";

/** `Omit` over a discriminated union, keeping each member's own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Input for `addComponentProperty`: a property without (or with) an id. */
export type ComponentPropertyInput = DistributiveOmit<ComponentProperty, "id"> & {
  id?: PropertyId;
};

/* ------------------------------------------------------------------ targets */

type PageTarget = Extract<SceneTarget, { pageId: PageId }>;

function isPageTarget(target: SceneTarget): target is PageTarget {
  return "pageId" in target && target.pageId !== undefined;
}

function getComponentOrThrow(
  project: Draft<Project>,
  componentId: ComponentId,
): Draft<ComponentDefinition> {
  const component = project.components.find((candidate) => candidate.id === componentId);
  if (!component) throw new Error(`Component "${componentId}" was not found.`);
  return component;
}

/** Resolves a variant, falling back to the default variant then the first one. */
function resolveVariantOrThrow(
  project: Draft<Project>,
  componentId: ComponentId,
  variantId?: VariantId,
): { component: Draft<ComponentDefinition>; variant: Draft<ComponentVariant> } {
  const component = getComponentOrThrow(project, componentId);
  if (component.variants.length === 0) {
    throw new Error(`Component "${componentId}" has no variants.`);
  }

  const variant =
    variantId !== undefined
      ? component.variants.find((candidate) => candidate.id === variantId)
      : (component.variants.find((candidate) => candidate.id === component.defaultVariantId) ??
        component.variants[0]);

  if (!variant) {
    throw new Error(`Variant "${variantId}" was not found in component "${componentId}".`);
  }
  return { component, variant };
}

/**
 * The root frame addressed by a target: the page root, or the selected component
 * variant root (the default variant when `variantId` is omitted).
 */
export function getTargetRoot(project: Draft<Project>, target: SceneTarget): Draft<FrameNode> {
  if (isPageTarget(target)) {
    return getPageOrThrow(project, target.pageId).root;
  }
  return resolveVariantOrThrow(project, target.componentId, target.variantId).variant.root;
}

function describeTarget(project: Draft<Project>, target: SceneTarget): string {
  if (isPageTarget(target)) return `page "${target.pageId}"`;
  const { variant } = resolveVariantOrThrow(project, target.componentId, target.variantId);
  return `component "${target.componentId}" variant "${variant.id}"`;
}

function describeRootNode(target: SceneTarget): string {
  return isPageTarget(target) ? "page root" : "component variant root";
}

/** Finds a node inside the target, naming the page/component/variant on failure. */
export function getTargetNodeOrThrow(
  project: Draft<Project>,
  target: SceneTarget,
  nodeId: NodeId,
): Draft<SceneNode> {
  const root = getTargetRoot(project, target);
  const node = findNodeDraft(root, nodeId);
  if (!node) {
    throw new Error(`Node "${nodeId}" was not found in ${describeTarget(project, target)}.`);
  }
  return node;
}

/* -------------------------------------------------------------- draft tree */

function getPageOrThrow(project: Draft<Project>, pageId: PageId): Draft<Page> {
  const page = project.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`Page "${pageId}" was not found.`);
  return page;
}

function findNodeDraft(root: Draft<SceneNode>, nodeId: NodeId): Draft<SceneNode> | null {
  if (root.id === nodeId) return root;
  if (root.type === "frame") {
    for (const child of root.children) {
      const found = findNodeDraft(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function findParentDraft(root: Draft<SceneNode>, nodeId: NodeId): Draft<FrameNode> | null {
  if (root.type === "frame") {
    for (const child of root.children) {
      if (child.id === nodeId) return root;
      const found = findParentDraft(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function subtreeContains(node: Draft<SceneNode>, nodeId: NodeId): boolean {
  if (node.id === nodeId) return true;
  if (node.type === "frame") {
    return node.children.some((child) => subtreeContains(child, nodeId));
  }
  return false;
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined) return length;
  if (!Number.isFinite(index)) {
    throw new Error(`Invalid child index: ${String(index)}.`);
  }
  return Math.max(0, Math.min(Math.trunc(index), length));
}

/** Deep-copies JSON data, unwrapping Immer drafts at every level. */
function toPlain<T>(value: T): T {
  if (isDraft(value)) return toPlain(current(value as Draft<T>)) as T;
  if (Array.isArray(value)) return value.map((entry) => toPlain(entry)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toPlain(entry);
    }
    return out as T;
  }
  return value;
}

/** Copies a node without attaching it to a draft, so the caller's object is not frozen. */
function detachNode(node: SceneNode): SceneNode {
  return toPlain(node);
}

function assignFreshIds(node: SceneNode): void {
  node.id = createId("node");
  if (node.type === "frame") {
    for (const child of node.children) assignFreshIds(child);
  }
}

function cloneWithFreshIds<T extends SceneNode>(node: T): T {
  const copy = structuredClone(node);
  assignFreshIds(copy);
  return copy;
}

/* --------------------------------------------------------------- responsive */

interface ResponsiveDraft<P extends object> {
  base: P;
  overrides: Record<BreakpointId, DeepPartial<P>>;
}

/** Unwraps an Immer proxy so `mergeDeep` can structured-clone the value. */
function unwrapDraft<T>(value: T): T {
  if (!isDraft(value)) return value;
  return current(value as Draft<T>) as T;
}

/**
 * Writes responsive props. The primary breakpoint owns `base`; every smaller
 * breakpoint deep-merges into its own override so unrelated fields survive.
 */
function writeResponsive<P extends object>(
  project: Draft<Project>,
  node: { responsive: ResponsiveDraft<P> },
  breakpointId: BreakpointId,
  patch: DeepPartial<P>,
): void {
  const primary = project.breakpoints[0];
  if (!primary) {
    throw new Error("Project has no breakpoints; cannot write responsive props.");
  }
  if (!project.breakpoints.some((breakpoint) => breakpoint.id === breakpointId)) {
    throw new Error(`Breakpoint "${breakpointId}" was not found.`);
  }

  if (breakpointId === primary.id) {
    node.responsive.base = mergeDeep(unwrapDraft(node.responsive.base), patch);
    return;
  }

  // The override may be sparse; mergeDeep handles a partial base and keeps the
  // fields the existing override does not mention.
  const existing = (unwrapDraft(node.responsive.overrides[breakpointId]) ?? {}) as P;
  node.responsive.overrides[breakpointId] = mergeDeep<P>(existing, patch) as DeepPartial<P>;
}

/* --------------------------------------------------------------- breakpoints */

function walkDraftNode(node: Draft<SceneNode>, visitor: (node: Draft<SceneNode>) => void): void {
  visitor(node);
  if (node.type === "frame") {
    for (const child of node.children) walkDraftNode(child, visitor);
  }
}

/**
 * Adds a breakpoint and makes every page root match its canvas width. The list
 * stays ordered widest to narrowest; equal widths keep insertion order.
 * Component variant roots are left untouched because their size is authored.
 */
export function addBreakpoint(
  draft: Draft<Project>,
  options: { name: string; width: number; id?: BreakpointId },
): BreakpointId {
  const name = options.name.trim();
  if (name.length === 0) throw new Error("Breakpoint name cannot be empty.");

  const width = options.width;
  if (!Number.isFinite(width) || !Number.isInteger(width) || width < 1 || width > 10000) {
    throw new Error(
      `Breakpoint width must be a whole number from 1 to 10000, received ${String(width)}.`,
    );
  }
  const primary = draft.breakpoints[0];
  if (primary && width >= primary.width) {
    throw new Error(
      `Breakpoint width must be narrower than the primary breakpoint (${primary.width}px).`,
    );
  }

  if (draft.breakpoints.some((breakpoint) => breakpoint.name === name)) {
    throw new Error(`A breakpoint named "${name}" already exists.`);
  }

  const id = options.id ?? createId("bp");
  if (draft.breakpoints.some((breakpoint) => breakpoint.id === id)) {
    throw new Error(`Breakpoint id "${id}" is already used.`);
  }

  const index = draft.breakpoints.findIndex((breakpoint) => breakpoint.width < width);
  if (index === -1) {
    draft.breakpoints.push({ id, name, width });
  } else {
    draft.breakpoints.splice(index, 0, { id, name, width });
  }

  for (const page of draft.pages) {
    const root = page.root;
    const existing = root.responsive.overrides[id];
    root.responsive.overrides[id] = {
      ...(existing ?? {}),
      size: {
        ...(existing?.size ?? {}),
        width: { mode: "fixed", value: width },
      },
    };
  }

  return id;
}

/**
 * Removes a breakpoint and every override stored under it. The primary and the
 * last breakpoint cannot be removed, since the project needs a fallback.
 */
export function removeBreakpoint(draft: Draft<Project>, breakpointId: BreakpointId): void {
  const index = draft.breakpoints.findIndex((breakpoint) => breakpoint.id === breakpointId);
  if (index === -1) throw new Error(`Breakpoint "${breakpointId}" was not found.`);
  if (draft.breakpoints.length <= 1) throw new Error("Cannot remove the last breakpoint.");
  if (index === 0) throw new Error("Cannot remove the primary breakpoint.");

  draft.breakpoints.splice(index, 1);

  const removeOverride = (node: Draft<SceneNode>): void => {
    delete node.responsive.overrides[breakpointId];
  };
  for (const page of draft.pages) walkDraftNode(page.root, removeOverride);
  for (const component of draft.components) {
    for (const variant of component.variants) walkDraftNode(variant.root, removeOverride);
  }
}

/* --------------------------------------------------------------------- nodes */

export function insertNode(
  draft: Draft<Project>,
  options: SceneTarget & { parentId: NodeId; node: SceneNode; index?: number },
): void {
  const root = getTargetRoot(draft, options);
  const parent = findNodeDraft(root, options.parentId);
  if (!parent) {
    throw new Error(
      `Parent node "${options.parentId}" was not found in ${describeTarget(draft, options)}.`,
    );
  }
  if (parent.type !== "frame") {
    throw new Error(
      `Cannot insert into node "${options.parentId}" of type "${parent.type}"; the parent must be a frame.`,
    );
  }

  const at = clampIndex(options.index, parent.children.length);
  parent.children.splice(at, 0, castDraft(detachNode(options.node)));
}

export function removeNode(draft: Draft<Project>, location: NodeLocation): void {
  const root = getTargetRoot(draft, location);
  const node = findNodeDraft(root, location.nodeId);
  if (!node) {
    throw new Error(
      `Node "${location.nodeId}" was not found in ${describeTarget(draft, location)}.`,
    );
  }
  if (node.id === root.id) {
    throw new Error(`Cannot remove the ${describeRootNode(location)} node "${location.nodeId}".`);
  }

  const parent = findParentDraft(root, location.nodeId);
  if (!parent) throw new Error(`Cannot remove node "${location.nodeId}": it has no parent.`);
  const index = parent.children.findIndex((child) => child.id === location.nodeId);
  if (index === -1) throw new Error(`Node "${location.nodeId}" is not a child of its parent.`);
  parent.children.splice(index, 1);
}

export function moveNode(
  draft: Draft<Project>,
  options: NodeLocation & { parentId: NodeId; index?: number },
): void {
  const root = getTargetRoot(draft, options);
  const node = findNodeDraft(root, options.nodeId);
  if (!node) {
    throw new Error(`Node "${options.nodeId}" was not found in ${describeTarget(draft, options)}.`);
  }

  const oldParent = findParentDraft(root, options.nodeId);
  if (!oldParent) {
    throw new Error(`Cannot move the ${describeRootNode(options)} node "${options.nodeId}".`);
  }

  const newParent = findNodeDraft(root, options.parentId);
  if (!newParent) {
    throw new Error(
      `Parent node "${options.parentId}" was not found in ${describeTarget(draft, options)}.`,
    );
  }
  if (newParent.type !== "frame") {
    throw new Error(
      `Cannot move into node "${options.parentId}" of type "${newParent.type}"; the parent must be a frame.`,
    );
  }
  if (subtreeContains(node, options.parentId)) {
    throw new Error(
      `Cannot move node "${options.nodeId}" into itself or one of its descendants ("${options.parentId}").`,
    );
  }

  const oldIndex = oldParent.children.findIndex((child) => child.id === options.nodeId);
  if (oldIndex === -1) throw new Error(`Node "${options.nodeId}" is not a child of its parent.`);
  oldParent.children.splice(oldIndex, 1);

  // The index is interpreted after removal, in the target parent's final list.
  const at = clampIndex(options.index, newParent.children.length);
  newParent.children.splice(at, 0, node);
}

/* -------------------------------------------------------------- wrapping */

export interface WrapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Options for `wrapNodes`: the scene target plus the layers and frame shape. */
export type WrapNodesOptions = SceneTarget & {
  nodeIds: NodeId[];
  kind: "frame" | "stack";
  /** Measured union bounds in the shared parent's coordinate space. */
  bounds?: WrapBounds;
  /** Authoritative base positions, relative to the new frame. */
  positions?: Record<NodeId, { x: number; y: number }>;
  name?: string;
};

/** Options for `unwrapNode`: the scene target plus the frame to remove. */
export type UnwrapNodeOptions = SceneTarget & {
  nodeId: NodeId;
  /** Authoritative base positions for the children, relative to the parent. */
  childPositions?: Record<NodeId, { x: number; y: number }>;
};

function fixedLength(size: { mode: string; value?: number } | undefined): number {
  if (!size || size.mode !== "fixed") return 0;
  const value = size.value;
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

/** The union extent of the layers' base positions and fixed sizes. */
function wrappedBounds(nodes: readonly SceneNode[]): WrapBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const base = node.responsive.base;
    minX = Math.min(minX, base.position.x);
    minY = Math.min(minY, base.position.y);
    maxX = Math.max(maxX, base.position.x + fixedLength(base.size.width));
    maxY = Math.max(maxY, base.position.y + fixedLength(base.size.height));
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0, width: 400, height: 400 };
  }
  const width = maxX - minX;
  const height = maxY - minY;
  return {
    x: minX,
    y: minY,
    width: width > 0 ? width : 400,
    height: height > 0 ? height : 400,
  };
}

/**
 * Moves a layer into the new frame, rebasing its position on the frame origin.
 * A supplied position is authoritative for the base; responsive overrides keep
 * their visual place by subtracting the frame origin when they set x or y.
 */
function offsetIntoFrame(
  node: SceneNode,
  frame: { x: number; y: number },
  positions?: Record<NodeId, { x: number; y: number }>,
): void {
  const base = node.responsive.base.position;
  const supplied = positions?.[node.id];
  node.responsive.base.position = {
    ...base,
    x: supplied ? supplied.x : base.x - frame.x,
    y: supplied ? supplied.y : base.y - frame.y,
  };

  for (const override of Object.values(node.responsive.overrides)) {
    const position = override.position;
    if (!position) continue;
    const patch: { x?: number; y?: number } = {};
    if (position.x !== undefined) patch.x = position.x - frame.x;
    if (position.y !== undefined) patch.y = position.y - frame.y;
    if (patch.x !== undefined || patch.y !== undefined) {
      override.position = { ...position, ...patch };
    }
  }
}

/**
 * Wraps sibling layers in a new Frame or Stack.
 *
 * All layers must share one frame parent and none may be the scene root. The
 * wrapper takes the lowest index among the selected layers, so the stacking
 * order is preserved, and its children keep their parent order. One call is one
 * history entry. Returns the new frame id.
 */
export function wrapNodes(draft: Draft<Project>, options: WrapNodesOptions): NodeId {
  const root = getTargetRoot(draft, options);
  const nodeIds = [...new Set(options.nodeIds)];
  if (nodeIds.length === 0) {
    throw new Error("Select at least one layer to wrap.");
  }
  if (nodeIds.includes(root.id)) {
    throw new Error(`Cannot wrap the ${describeRootNode(options)} node "${root.id}".`);
  }

  const parents: Draft<FrameNode>[] = [];
  for (const nodeId of nodeIds) {
    const node = findNodeDraft(root, nodeId);
    if (!node) {
      throw new Error(`Node "${nodeId}" was not found in ${describeTarget(draft, options)}.`);
    }
    const parent = findParentDraft(root, nodeId);
    if (!parent) {
      throw new Error(`Cannot wrap node "${nodeId}": it has no parent.`);
    }
    parents.push(parent);
  }

  const parent = parents[0];
  if (!parent) throw new Error("Select at least one layer to wrap.");
  if (parents.some((candidate) => candidate.id !== parent.id)) {
    throw new Error("All wrapped layers must share the same parent.");
  }

  const selected = new Set(nodeIds);
  const ordered = parent.children.filter((child) => selected.has(child.id));
  const lowestIndex = parent.children.findIndex((child) => selected.has(child.id));
  if (lowestIndex === -1) {
    throw new Error("Selected layers are not children of their parent.");
  }

  const bounds = options.bounds ?? wrappedBounds(toPlain(ordered));
  const moved = ordered.map((node) => detachNode(node));
  for (const node of moved) offsetIntoFrame(node, bounds, options.positions);

  // Remove the selected layers before inserting the wrapper at their lowest
  // index; no selected layer sits before that index, so it stays valid.
  for (let index = parent.children.length - 1; index >= 0; index -= 1) {
    const child = parent.children[index];
    if (child && selected.has(child.id)) parent.children.splice(index, 1);
  }

  const frame = createFrame({
    name: options.name ?? (options.kind === "stack" ? "Stack" : "Frame"),
    props: {
      position: { x: bounds.x, y: bounds.y },
      size: {
        width: { mode: "fixed", value: bounds.width },
        height: { mode: "fixed", value: bounds.height },
      },
      style: { fill: null, overflow: "visible" },
      layout:
        options.kind === "stack"
          ? { mode: "stack", direction: "vertical" }
          : { mode: "none" },
    },
    children: moved,
  });

  parent.children.splice(lowestIndex, 0, castDraft(frame as SceneNode));
  return frame.id;
}

/**
 * Removes a frame and moves its children into its parent at the frame's index.
 *
 * Children keep their visual position by adding the frame origin to their base
 * (or using a measured `childPositions` entry), and responsive position
 * overrides shift by the same origin. Returns the moved child ids, which is
 * empty for an empty frame.
 */
export function unwrapNode(draft: Draft<Project>, options: UnwrapNodeOptions): NodeId[] {
  const root = getTargetRoot(draft, options);
  const node = findNodeDraft(root, options.nodeId);
  if (!node) {
    throw new Error(`Node "${options.nodeId}" was not found in ${describeTarget(draft, options)}.`);
  }
  if (node.id === root.id) {
    throw new Error(`Cannot remove the ${describeRootNode(options)} node "${options.nodeId}".`);
  }
  if (node.type !== "frame") {
    throw new Error(
      `Cannot remove node "${options.nodeId}": it is a ${node.type}, not a frame.`,
    );
  }

  const parent = findParentDraft(root, options.nodeId);
  if (!parent) {
    throw new Error(`Cannot remove node "${options.nodeId}": it has no parent.`);
  }
  const index = parent.children.findIndex((child) => child.id === options.nodeId);
  if (index === -1) {
    throw new Error(`Node "${options.nodeId}" is not a child of its parent.`);
  }

  const frame = node.responsive.base.position;
  const children = node.children.map((child) => detachNode(child));
  const moved: NodeId[] = [];

  for (const child of children) {
    const base = child.responsive.base.position;
    const supplied = options.childPositions?.[child.id];
    child.responsive.base.position = {
      ...base,
      x: supplied ? supplied.x : base.x + frame.x,
      y: supplied ? supplied.y : base.y + frame.y,
    };

    for (const override of Object.values(child.responsive.overrides)) {
      const position = override.position;
      if (!position) continue;
      const patch: { x?: number; y?: number } = {};
      if (position.x !== undefined) patch.x = position.x + frame.x;
      if (position.y !== undefined) patch.y = position.y + frame.y;
      if (patch.x !== undefined || patch.y !== undefined) {
        override.position = { ...position, ...patch };
      }
    }
    moved.push(child.id);
  }

  parent.children.splice(index, 1, ...castDraft(children));
  return moved;
}

export function duplicateNode(draft: Draft<Project>, location: NodeLocation): NodeId {
  const root = getTargetRoot(draft, location);
  const node = findNodeDraft(root, location.nodeId);
  if (!node) {
    throw new Error(
      `Node "${location.nodeId}" was not found in ${describeTarget(draft, location)}.`,
    );
  }

  const parent = findParentDraft(root, location.nodeId);
  if (!parent) {
    throw new Error(
      `Cannot duplicate the ${describeRootNode(location)} node "${location.nodeId}".`,
    );
  }

  const index = parent.children.findIndex((child) => child.id === location.nodeId);
  if (index === -1) throw new Error(`Node "${location.nodeId}" is not a child of its parent.`);

  const clone = cloneWithFreshIds(detachNode(node));
  parent.children.splice(index + 1, 0, castDraft(clone));
  return clone.id;
}

export function updateNode(
  draft: Draft<Project>,
  location: NodeLocation,
  updater: (node: Draft<SceneNode>) => void,
): void {
  updater(getTargetNodeOrThrow(draft, location, location.nodeId));
}

export function updateBoxProps(
  draft: Draft<Project>,
  options: NodeLocation & { breakpointId: BreakpointId; patch: DeepPartial<BoxProps> },
): void {
  const node = getTargetNodeOrThrow(draft, options, options.nodeId);
  writeResponsive(
    draft,
    node as { responsive: ResponsiveDraft<BoxProps> },
    options.breakpointId,
    options.patch,
  );
}

export function updateTextProps(
  draft: Draft<Project>,
  options: NodeLocation & { breakpointId: BreakpointId; patch: DeepPartial<TextProps> },
): void {
  const node = getTargetNodeOrThrow(draft, options, options.nodeId);
  if (node.type !== "text") {
    throw new Error(`Node "${options.nodeId}" is a ${node.type}; expected a text node.`);
  }
  writeResponsive(draft, node, options.breakpointId, options.patch);
}

export function updateImageProps(
  draft: Draft<Project>,
  options: NodeLocation & { breakpointId: BreakpointId; patch: DeepPartial<ImageProps> },
): void {
  const node = getTargetNodeOrThrow(draft, options, options.nodeId);
  if (node.type !== "image") {
    throw new Error(`Node "${options.nodeId}" is a ${node.type}; expected an image node.`);
  }
  writeResponsive(draft, node, options.breakpointId, options.patch);
}

export function renameNode(draft: Draft<Project>, location: NodeLocation, name: string): void {
  getTargetNodeOrThrow(draft, location, location.nodeId).name = name;
}

export function setNodeVisible(
  draft: Draft<Project>,
  location: NodeLocation,
  visible: boolean,
): void {
  getTargetNodeOrThrow(draft, location, location.nodeId).visible = visible;
}

export function setNodeLocked(
  draft: Draft<Project>,
  location: NodeLocation,
  locked: boolean,
): void {
  getTargetNodeOrThrow(draft, location, location.nodeId).locked = locked;
}

/* -------------------------------------------------------------- interactions */

const INTERACTION_TRIGGERS: readonly InteractionTrigger[] = ["appear", "hover", "tap"];
const INTERACTION_EFFECTS: readonly InteractionEffect[] = ["fade", "slide", "scale"];
const INTERACTION_DIRECTIONS: readonly InteractionDirection[] = ["up", "down", "left", "right"];
const INTERACTION_EASINGS: readonly InteractionEasing[] = ["ease", "linear", "ease-in", "ease-out"];
const MAX_INTERACTION_TIME = 10000;

/** Input for `addInteraction`: an interaction without, or with, an id. */
export type InteractionInput = Omit<Interaction, "id"> & { id?: string };

function assertOneOf<T extends string>(
  field: string,
  value: string,
  allowed: readonly T[],
): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new Error(
      `Interaction ${field} must be one of ${allowed.map((entry) => `"${entry}"`).join(", ")}, received "${String(value)}".`,
    );
  }
}

function assertInteractionTime(field: "duration" | "delay", value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INTERACTION_TIME) {
    throw new Error(
      `Interaction ${field} must be a whole number from 0 to ${MAX_INTERACTION_TIME}, received ${String(value)}.`,
    );
  }
}

function validateInteraction(input: Partial<InteractionInput>): void {
  if (input.trigger !== undefined) assertOneOf("trigger", input.trigger, INTERACTION_TRIGGERS);
  if (input.effect !== undefined) assertOneOf("effect", input.effect, INTERACTION_EFFECTS);
  if (input.direction !== undefined) {
    assertOneOf("direction", input.direction, INTERACTION_DIRECTIONS);
  }
  if (input.easing !== undefined) assertOneOf("easing", input.easing, INTERACTION_EASINGS);
  if (input.duration !== undefined) assertInteractionTime("duration", input.duration);
  if (input.delay !== undefined) assertInteractionTime("delay", input.delay);
}

function getInteractionOrThrow(node: Draft<SceneNode>, interactionId: string): Draft<Interaction> {
  const interaction = node.interactions?.find((candidate) => candidate.id === interactionId);
  if (!interaction) {
    throw new Error(`Interaction "${interactionId}" was not found on node "${node.id}".`);
  }
  return interaction;
}

/** Adds an effect to a node and returns its id. */
export function addInteraction(
  draft: Draft<Project>,
  location: NodeLocation,
  input: InteractionInput,
): string {
  validateInteraction(input);
  const node = getTargetNodeOrThrow(draft, location, location.nodeId);

  if (!node.interactions) node.interactions = [];
  const interactions = node.interactions;

  let id = input.id;
  if (id !== undefined) {
    if (interactions.some((candidate) => candidate.id === id)) {
      throw new Error(`Interaction id "${id}" is already used on node "${node.id}".`);
    }
  } else {
    do {
      id = createId("interaction");
    } while (interactions.some((candidate) => candidate.id === id));
  }

  const { id: _ignored, ...fields } = input;
  interactions.push({ id, ...fields });
  return id;
}

/** Applies a validated patch to an existing effect. */
export function updateInteraction(
  draft: Draft<Project>,
  location: NodeLocation,
  interactionId: string,
  patch: Partial<Omit<Interaction, "id">>,
): void {
  const node = getTargetNodeOrThrow(draft, location, location.nodeId);
  const interaction = getInteractionOrThrow(node, interactionId);
  validateInteraction(patch);

  if (patch.trigger !== undefined) interaction.trigger = patch.trigger;
  if (patch.effect !== undefined) interaction.effect = patch.effect;
  if (patch.direction !== undefined) interaction.direction = patch.direction;
  if (patch.duration !== undefined) interaction.duration = patch.duration;
  if (patch.delay !== undefined) interaction.delay = patch.delay;
  if (patch.easing !== undefined) interaction.easing = patch.easing;
}

/** Removes an effect from a node. */
export function removeInteraction(
  draft: Draft<Project>,
  location: NodeLocation,
  interactionId: string,
): void {
  const node = getTargetNodeOrThrow(draft, location, location.nodeId);
  const index = node.interactions?.findIndex((candidate) => candidate.id === interactionId) ?? -1;
  if (!node.interactions || index === -1) {
    throw new Error(`Interaction "${interactionId}" was not found on node "${node.id}".`);
  }
  node.interactions.splice(index, 1);
}

/* ---------------------------------------------------------------- components */

const BOX_PROP_KEYS = ["layout", "size", "position", "style"] as const;

/** Copies only the four BoxProps fields that exist on a node's props. */
function pickBoxFields(source: object): Partial<BoxProps> {
  const out: Record<string, unknown> = {};
  for (const key of BOX_PROP_KEYS) {
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined) out[key] = structuredClone(value);
  }
  return out as Partial<BoxProps>;
}

/** A box-only copy of a node's responsive value, stripping text/image props. */
function boxOnlyResponsive(source: {
  base: object;
  overrides: Record<string, object | undefined>;
}): Responsive<BoxProps> {
  const overrides: Record<BreakpointId, DeepPartial<BoxProps>> = {};
  for (const [breakpointId, override] of Object.entries(source.overrides)) {
    if (override === undefined) continue;
    overrides[breakpointId] = pickBoxFields(override) as DeepPartial<BoxProps>;
  }
  return {
    base: pickBoxFields(source.base) as BoxProps,
    overrides,
  };
}

/** Resets a variant root's position to the origin at every breakpoint. */
function resetPosition(node: SceneNode): void {
  node.responsive.base.position = { ...node.responsive.base.position, x: 0, y: 0 };
  for (const override of Object.values(node.responsive.overrides)) {
    if (override.position !== undefined) {
      override.position = { ...override.position, x: 0, y: 0 };
    }
  }
}

function uniqueVariantName(
  component: { variants: Array<{ name: string }> },
  requested?: string,
): string {
  const taken = (candidate: string): boolean =>
    component.variants.some((variant) => variant.name === candidate);
  const trimmed = requested?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    if (!taken(trimmed)) return trimmed;
    let suffix = 2;
    while (taken(`${trimmed} ${suffix}`)) suffix += 1;
    return `${trimmed} ${suffix}`;
  }

  let suffix = component.variants.length + 1;
  while (taken(`Variant ${suffix}`)) suffix += 1;
  return `Variant ${suffix}`;
}

export function createComponentFromNode(
  draft: Draft<Project>,
  options: { pageId: PageId; nodeId: NodeId; name?: string },
): { componentId: ComponentId; variantId: VariantId; instanceId: NodeId } {
  const page = getPageOrThrow(draft, options.pageId);
  const node = findNodeDraft(page.root, options.nodeId);
  if (!node) {
    throw new Error(`Node "${options.nodeId}" was not found in page "${options.pageId}".`);
  }
  if (node.id === page.root.id) {
    throw new Error(`Cannot create a component from the page root node "${options.nodeId}".`);
  }

  const parent = findParentDraft(page.root, options.nodeId);
  if (!parent) {
    throw new Error(`Cannot create a component from node "${options.nodeId}": it has no parent.`);
  }
  const index = parent.children.findIndex((child) => child.id === options.nodeId);
  if (index === -1) throw new Error(`Node "${options.nodeId}" is not a child of its parent.`);

  const original = detachNode(node);
  const componentName = options.name?.trim() || original.name || "Component";

  const clone = cloneWithFreshIds(original);
  let variantRoot: FrameNode;
  if (clone.type === "frame") {
    resetPosition(clone);
    variantRoot = clone;
  } else {
    // Text, images and other leaves become the child of a hug-sized wrapper.
    resetPosition(clone);
    variantRoot = createFrame({
      name: componentName,
      props: {
        layout: { mode: "none" },
        size: { width: { mode: "hug" }, height: { mode: "hug" } },
        style: { fill: null },
      },
      children: [clone],
    });
  }

  const component = createComponentDefinition({ name: componentName, root: variantRoot });
  draft.components.push(castDraft(component));

  const instance: ComponentInstanceNode = {
    id: createId("node"),
    type: "componentInstance",
    name: componentName,
    visible: original.visible,
    locked: original.locked,
    responsive: boxOnlyResponsive(original.responsive),
    componentId: component.id,
    variantId: component.defaultVariantId,
    propertyValues: {},
  };
  parent.children[index] = castDraft(instance);

  return {
    componentId: component.id,
    variantId: component.defaultVariantId,
    instanceId: instance.id,
  };
}

export function insertComponentInstance(
  draft: Draft<Project>,
  options: {
    pageId: PageId;
    parentId: NodeId;
    componentId: ComponentId;
    variantId?: VariantId;
    index?: number;
    position?: { x: number; y: number };
  },
): NodeId {
  const { component, variant } = resolveVariantOrThrow(
    draft,
    options.componentId,
    options.variantId,
  );
  const base = structuredClone(unwrapDraft(variant.root.responsive.base));

  const instance: ComponentInstanceNode = {
    id: createId("node"),
    type: "componentInstance",
    name: component.name,
    visible: true,
    locked: false,
    responsive: createResponsive({
      ...base,
      position: options.position ? { ...options.position } : { x: 0, y: 0 },
    }),
    componentId: component.id,
    variantId: variant.id,
    propertyValues: {},
  };

  insertNode(draft, {
    pageId: options.pageId,
    parentId: options.parentId,
    node: instance,
    index: options.index,
  });
  return instance.id;
}

export function addComponentVariant(
  draft: Draft<Project>,
  options: { componentId: ComponentId; name?: string; fromVariantId?: VariantId },
): VariantId {
  const component = getComponentOrThrow(draft, options.componentId);
  if (component.variants.length === 0) {
    throw new Error(`Component "${options.componentId}" has no variants.`);
  }

  const source =
    options.fromVariantId !== undefined
      ? component.variants.find((variant) => variant.id === options.fromVariantId)
      : (component.variants.find((variant) => variant.id === component.defaultVariantId) ??
        component.variants[0]);
  if (!source) {
    throw new Error(
      `Variant "${options.fromVariantId}" was not found in component "${options.componentId}".`,
    );
  }

  const variant: ComponentVariant = {
    id: createId("variant"),
    name: uniqueVariantName(component, options.name),
    // Variants share node ids with the source variant: corresponding layers keep
    // their identity across variants so component-wide bindings resolve in all
    // of them. The variant itself gets a fresh id.
    root: structuredClone(detachNode(source.root) as FrameNode),
  };
  component.variants.push(castDraft(variant));
  return variant.id;
}

export function renameComponentVariant(
  draft: Draft<Project>,
  options: { componentId: ComponentId; variantId: VariantId; name: string },
): void {
  const component = getComponentOrThrow(draft, options.componentId);
  const trimmed = options.name.trim();
  if (trimmed.length === 0) throw new Error("Variant name cannot be empty.");

  const variant = component.variants.find((candidate) => candidate.id === options.variantId);
  if (!variant) {
    throw new Error(
      `Variant "${options.variantId}" was not found in component "${options.componentId}".`,
    );
  }
  if (
    component.variants.some(
      (candidate) => candidate.id !== options.variantId && candidate.name === trimmed,
    )
  ) {
    throw new Error(
      `A variant named "${trimmed}" already exists in component "${options.componentId}".`,
    );
  }
  variant.name = trimmed;
}

export function setComponentDefaultVariant(
  draft: Draft<Project>,
  options: { componentId: ComponentId; variantId: VariantId },
): void {
  const component = getComponentOrThrow(draft, options.componentId);
  if (!component.variants.some((variant) => variant.id === options.variantId)) {
    throw new Error(
      `Variant "${options.variantId}" was not found in component "${options.componentId}".`,
    );
  }
  component.defaultVariantId = options.variantId;
}

export function deleteComponentVariant(
  draft: Draft<Project>,
  options: { componentId: ComponentId; variantId: VariantId },
): void {
  const component = getComponentOrThrow(draft, options.componentId);
  if (component.variants.length <= 1) {
    throw new Error(`Cannot delete the last variant of component "${options.componentId}".`);
  }
  const index = component.variants.findIndex((variant) => variant.id === options.variantId);
  if (index === -1) {
    throw new Error(
      `Variant "${options.variantId}" was not found in component "${options.componentId}".`,
    );
  }

  const [removed] = component.variants.splice(index, 1);
  if (removed && component.defaultVariantId === removed.id) {
    component.defaultVariantId = component.variants[0]!.id;
  }
}

export function renameComponent(
  draft: Draft<Project>,
  options: { componentId: ComponentId; name: string },
): void {
  const trimmed = options.name.trim();
  if (trimmed.length === 0) throw new Error("Component name cannot be empty.");
  getComponentOrThrow(draft, options.componentId).name = trimmed;
}

export function deleteComponent(
  draft: Draft<Project>,
  options: { componentId: ComponentId },
): void {
  const index = draft.components.findIndex((component) => component.id === options.componentId);
  if (index === -1) throw new Error(`Component "${options.componentId}" was not found.`);
  const component = draft.components[index]!;

  // Instances inside this component's own variants disappear with it; every
  // page and every other component must be free of references.
  const references: ComponentInstanceNode[] = [];
  for (const page of draft.pages) {
    references.push(...findComponentInstances(page, options.componentId));
  }
  for (const other of draft.components) {
    if (other.id === options.componentId) continue;
    for (const variant of other.variants) {
      references.push(...findComponentInstances(variant.root, options.componentId));
    }
  }

  if (references.length > 0) {
    throw new Error(
      `Cannot delete component "${component.name}": ${references.length} instance(s) still reference it.`,
    );
  }
  draft.components.splice(index, 1);
}

export function setInstanceVariant(
  draft: Draft<Project>,
  location: NodeLocation,
  variantId: VariantId,
): void {
  const node = getTargetNodeOrThrow(draft, location, location.nodeId);
  if (node.type !== "componentInstance") {
    throw new Error(`Node "${location.nodeId}" is a ${node.type}; expected a component instance.`);
  }
  const component = getComponentOrThrow(draft, node.componentId);
  if (!component.variants.some((variant) => variant.id === variantId)) {
    throw new Error(`Variant "${variantId}" was not found in component "${node.componentId}".`);
  }
  node.variantId = variantId;
}

export function setInstancePropertyValue(
  draft: Draft<Project>,
  location: NodeLocation,
  propertyId: PropertyId,
  value: ComponentPropertyValue,
): void {
  const node = getTargetNodeOrThrow(draft, location, location.nodeId);
  if (node.type !== "componentInstance") {
    throw new Error(`Node "${location.nodeId}" is a ${node.type}; expected a component instance.`);
  }
  const component = getComponentOrThrow(draft, node.componentId);
  if (!component.properties.some((property) => property.id === propertyId)) {
    throw new Error(`Property "${propertyId}" was not found on component "${node.componentId}".`);
  }
  node.propertyValues[propertyId] = value;
}

/** Clears an instance override so the component property default applies again. */
export function removeInstancePropertyValue(
  draft: Draft<Project>,
  location: NodeLocation,
  propertyId: PropertyId,
): void {
  const node = getTargetNodeOrThrow(draft, location, location.nodeId);
  if (node.type !== "componentInstance") {
    throw new Error(`Node "${location.nodeId}" is a ${node.type}; expected a component instance.`);
  }
  delete node.propertyValues[propertyId];
}

export function addComponentProperty(
  draft: Draft<Project>,
  options: { componentId: ComponentId; property: ComponentPropertyInput },
): PropertyId {
  const component = getComponentOrThrow(draft, options.componentId);
  const name = options.property.name.trim();
  if (name.length === 0) throw new Error("Component property name cannot be empty.");
  if (component.properties.some((property) => property.name === name)) {
    throw new Error(
      `A component property named "${name}" already exists in component "${options.componentId}".`,
    );
  }

  const id = options.property.id ?? createId("prop");
  if (component.properties.some((property) => property.id === id)) {
    throw new Error(
      `Component property id "${id}" is already used in component "${options.componentId}".`,
    );
  }

  const property = { ...options.property, id, name } as ComponentProperty;
  component.properties.push(castDraft(property));
  return id;
}

export function removeComponentProperty(
  draft: Draft<Project>,
  options: { componentId: ComponentId; propertyId: PropertyId },
): void {
  const component = getComponentOrThrow(draft, options.componentId);
  const index = component.properties.findIndex((property) => property.id === options.propertyId);
  if (index === -1) {
    throw new Error(
      `Property "${options.propertyId}" was not found on component "${options.componentId}".`,
    );
  }
  component.properties.splice(index, 1);

  for (let i = component.bindings.length - 1; i >= 0; i -= 1) {
    if (component.bindings[i]!.propertyId === options.propertyId) {
      component.bindings.splice(i, 1);
    }
  }

  // Remove the stale value from every instance in the project.
  for (const instance of findComponentInstances(draft, options.componentId)) {
    delete instance.propertyValues[options.propertyId];
  }
}

export function setComponentBinding(
  draft: Draft<Project>,
  options: { componentId: ComponentId; binding: PropertyBinding },
): void {
  const component = getComponentOrThrow(draft, options.componentId);
  if (!component.properties.some((property) => property.id === options.binding.propertyId)) {
    throw new Error(
      `Property "${options.binding.propertyId}" was not found on component "${options.componentId}".`,
    );
  }

  // Bindings are component-wide, unlike Framer's per-variant bindings, so the
  // node must exist in every variant.
  for (const variant of component.variants) {
    if (!findNodeDraft(variant.root, options.binding.nodeId)) {
      throw new Error(
        `Cannot bind property "${options.binding.propertyId}" to node "${options.binding.nodeId}": ` +
          `the node was not found in variant "${variant.id}" of component "${options.componentId}".`,
      );
    }
  }

  const index = component.bindings.findIndex(
    (binding) => binding.propertyId === options.binding.propertyId,
  );
  if (index === -1) {
    component.bindings.push(castDraft({ ...options.binding }));
  } else {
    component.bindings[index] = castDraft({ ...options.binding });
  }
}

/* --------------------------------------------------------------------- pages */

function normalizePagePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) throw new Error("Page path cannot be empty.");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function uniquePagePath(project: Draft<Project>, path: string, excludePageId?: PageId): string {
  const base = normalizePagePath(path);
  const taken = (candidate: string): boolean =>
    project.pages.some((page) => page.id !== excludePageId && page.path === candidate);
  if (!taken(base)) return base;

  let suffix = 2;
  while (taken(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function uniquePageName(project: Draft<Project>, name: string): string {
  const base = name.trim() || "New Page";
  const taken = (candidate: string): boolean =>
    project.pages.some((page) => page.name === candidate);
  if (!taken(base)) return base;

  let suffix = 2;
  while (taken(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

export function addPage(
  draft: Draft<Project>,
  options: { name?: string; path?: string } = {},
): PageId {
  const name = uniquePageName(draft, options.name ?? "New Page");
  const path = uniquePagePath(draft, options.path ?? "/new-page");
  const breakpoints = draft.breakpoints.map((breakpoint) => ({
    id: breakpoint.id,
    name: breakpoint.name,
    width: breakpoint.width,
  }));
  const page = createPage({ name, path, breakpoints });
  draft.pages.push(castDraft(page));
  return page.id;
}

export function updatePage(
  draft: Draft<Project>,
  {
    pageId,
    name,
    path,
    background,
  }: {
    pageId: PageId;
    name?: string;
    path?: string;
    background?: Fill | null;
  },
): void {
  const page = getPageOrThrow(draft, pageId);

  if (name !== undefined) {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error("Page name cannot be empty.");
    page.name = trimmed;
  }
  if (path !== undefined) {
    page.path = uniquePagePath(draft, path, pageId);
  }
  if (background !== undefined) {
    page.background = castDraft(background);
  }
}

export function removePage(draft: Draft<Project>, pageId: PageId): void {
  const index = draft.pages.findIndex((page) => page.id === pageId);
  if (index === -1) throw new Error(`Page "${pageId}" was not found.`);
  if (draft.pages.length === 1) throw new Error("Cannot remove the last page.");
  draft.pages.splice(index, 1);
}

export function renameProject(draft: Draft<Project>, name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("Project name cannot be empty.");
  draft.name = trimmed;
}

export function setProjectPublish(draft: Draft<Project>, config: PublishConfig | undefined): void {
  if (config === undefined) {
    delete draft.publish;
    return;
  }
  draft.publish = castDraft(config);
}
