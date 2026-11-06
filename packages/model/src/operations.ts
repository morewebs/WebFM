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
    throw new Error(`Node "${location.nodeId}" was not found in ${describeTarget(draft, location)}.`);
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

export function duplicateNode(draft: Draft<Project>, location: NodeLocation): NodeId {
  const root = getTargetRoot(draft, location);
  const node = findNodeDraft(root, location.nodeId);
  if (!node) {
    throw new Error(`Node "${location.nodeId}" was not found in ${describeTarget(draft, location)}.`);
  }

  const parent = findParentDraft(root, location.nodeId);
  if (!parent) {
    throw new Error(`Cannot duplicate the ${describeRootNode(location)} node "${location.nodeId}".`);
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

export function setNodeLocked(draft: Draft<Project>, location: NodeLocation, locked: boolean): void {
  getTargetNodeOrThrow(draft, location, location.nodeId).locked = locked;
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
