/**
 * Document operations.
 *
 * Every operation mutates an Immer draft, so the editor can wrap any of them in
 * `produce`/`produceWithPatches` and history comes for free. Operations throw a
 * descriptive error when they are handed a page, node, parent or breakpoint
 * that does not exist.
 */

import { castDraft, current, type Draft, isDraft } from "immer";
import { createPage, mergeDeep } from "./defaults";
import { createId } from "./ids";
import type {
  BoxProps,
  BreakpointId,
  DeepPartial,
  Fill,
  FrameNode,
  ImageProps,
  NodeId,
  Page,
  PageId,
  Project,
  PublishConfig,
  SceneNode,
  TextProps,
} from "./types";

/** A node is addressed by the page that contains it plus its id. */
interface NodeRef {
  pageId: PageId;
  nodeId: NodeId;
}

/* --------------------------------------------------------------- draft tree */

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

function getNodeOrThrow(project: Draft<Project>, pageId: PageId, nodeId: NodeId): Draft<SceneNode> {
  const page = getPageOrThrow(project, pageId);
  const node = findNodeDraft(page.root, nodeId);
  if (!node) throw new Error(`Node "${nodeId}" was not found in page "${pageId}".`);
  return node;
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

/** Copies a node without attaching it to a draft, so the caller's object is not frozen. */
function detachNode(node: SceneNode): SceneNode {
  const source = isDraft(node) ? current(node as Draft<SceneNode>) : node;
  return structuredClone(source);
}

function assignFreshIds(node: SceneNode): void {
  node.id = createId("node");
  if (node.type === "frame") {
    for (const child of node.children) assignFreshIds(child);
  }
}

function cloneWithFreshIds(node: SceneNode): SceneNode {
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

/* -------------------------------------------------------------------- nodes */

export function insertNode(
  draft: Draft<Project>,
  {
    pageId,
    parentId,
    node,
    index,
  }: { pageId: PageId; parentId: NodeId; node: SceneNode; index?: number },
): void {
  const page = getPageOrThrow(draft, pageId);
  const parent = findNodeDraft(page.root, parentId);
  if (!parent) {
    throw new Error(`Parent node "${parentId}" was not found in page "${pageId}".`);
  }
  if (parent.type !== "frame") {
    throw new Error(
      `Cannot insert into node "${parentId}" of type "${parent.type}"; the parent must be a frame.`,
    );
  }

  const at = clampIndex(index, parent.children.length);
  parent.children.splice(at, 0, castDraft(detachNode(node)));
}

export function removeNode(draft: Draft<Project>, { pageId, nodeId }: NodeRef): void {
  const page = getPageOrThrow(draft, pageId);
  const node = findNodeDraft(page.root, nodeId);
  if (!node) throw new Error(`Node "${nodeId}" was not found in page "${pageId}".`);
  if (node.id === page.root.id) {
    throw new Error(`Cannot remove the page root node "${nodeId}".`);
  }

  const parent = findParentDraft(page.root, nodeId);
  if (!parent) throw new Error(`Cannot remove node "${nodeId}": it has no parent.`);
  const index = parent.children.findIndex((child) => child.id === nodeId);
  if (index === -1) throw new Error(`Node "${nodeId}" is not a child of its parent.`);
  parent.children.splice(index, 1);
}

export function moveNode(
  draft: Draft<Project>,
  {
    pageId,
    nodeId,
    parentId,
    index,
  }: { pageId: PageId; nodeId: NodeId; parentId: NodeId; index?: number },
): void {
  const page = getPageOrThrow(draft, pageId);
  const node = findNodeDraft(page.root, nodeId);
  if (!node) throw new Error(`Node "${nodeId}" was not found in page "${pageId}".`);

  const oldParent = findParentDraft(page.root, nodeId);
  if (!oldParent) throw new Error(`Cannot move the page root node "${nodeId}".`);

  const newParent = findNodeDraft(page.root, parentId);
  if (!newParent) {
    throw new Error(`Parent node "${parentId}" was not found in page "${pageId}".`);
  }
  if (newParent.type !== "frame") {
    throw new Error(
      `Cannot move into node "${parentId}" of type "${newParent.type}"; the parent must be a frame.`,
    );
  }
  if (subtreeContains(node, parentId)) {
    throw new Error(
      `Cannot move node "${nodeId}" into itself or one of its descendants ("${parentId}").`,
    );
  }

  const oldIndex = oldParent.children.findIndex((child) => child.id === nodeId);
  if (oldIndex === -1) throw new Error(`Node "${nodeId}" is not a child of its parent.`);
  oldParent.children.splice(oldIndex, 1);

  // The index is interpreted after removal, in the target parent's final list.
  const at = clampIndex(index, newParent.children.length);
  newParent.children.splice(at, 0, node);
}

export function duplicateNode(draft: Draft<Project>, { pageId, nodeId }: NodeRef): NodeId {
  const page = getPageOrThrow(draft, pageId);
  const node = findNodeDraft(page.root, nodeId);
  if (!node) throw new Error(`Node "${nodeId}" was not found in page "${pageId}".`);

  const parent = findParentDraft(page.root, nodeId);
  if (!parent) throw new Error(`Cannot duplicate the page root node "${nodeId}".`);

  const index = parent.children.findIndex((child) => child.id === nodeId);
  if (index === -1) throw new Error(`Node "${nodeId}" is not a child of its parent.`);

  const clone = cloneWithFreshIds(current(node) as SceneNode);
  parent.children.splice(index + 1, 0, castDraft(clone));
  return clone.id;
}

export function updateNode(
  draft: Draft<Project>,
  { pageId, nodeId }: NodeRef,
  updater: (node: Draft<SceneNode>) => void,
): void {
  updater(getNodeOrThrow(draft, pageId, nodeId));
}

export function updateBoxProps(
  draft: Draft<Project>,
  {
    pageId,
    nodeId,
    breakpointId,
    patch,
  }: {
    pageId: PageId;
    nodeId: NodeId;
    breakpointId: BreakpointId;
    patch: DeepPartial<BoxProps>;
  },
): void {
  const node = getNodeOrThrow(draft, pageId, nodeId);
  writeResponsive(draft, node as { responsive: ResponsiveDraft<BoxProps> }, breakpointId, patch);
}

export function updateTextProps(
  draft: Draft<Project>,
  {
    pageId,
    nodeId,
    breakpointId,
    patch,
  }: {
    pageId: PageId;
    nodeId: NodeId;
    breakpointId: BreakpointId;
    patch: DeepPartial<TextProps>;
  },
): void {
  const node = getNodeOrThrow(draft, pageId, nodeId);
  if (node.type !== "text") {
    throw new Error(`Node "${nodeId}" is a ${node.type}; expected a text node.`);
  }
  writeResponsive(draft, node, breakpointId, patch);
}

export function updateImageProps(
  draft: Draft<Project>,
  {
    pageId,
    nodeId,
    breakpointId,
    patch,
  }: {
    pageId: PageId;
    nodeId: NodeId;
    breakpointId: BreakpointId;
    patch: DeepPartial<ImageProps>;
  },
): void {
  const node = getNodeOrThrow(draft, pageId, nodeId);
  if (node.type !== "image") {
    throw new Error(`Node "${nodeId}" is a ${node.type}; expected an image node.`);
  }
  writeResponsive(draft, node, breakpointId, patch);
}

export function renameNode(draft: Draft<Project>, { pageId, nodeId }: NodeRef, name: string): void {
  const node = getNodeOrThrow(draft, pageId, nodeId);
  node.name = name;
}

export function setNodeVisible(
  draft: Draft<Project>,
  { pageId, nodeId }: NodeRef,
  visible: boolean,
): void {
  const node = getNodeOrThrow(draft, pageId, nodeId);
  node.visible = visible;
}

export function setNodeLocked(
  draft: Draft<Project>,
  { pageId, nodeId }: NodeRef,
  locked: boolean,
): void {
  const node = getNodeOrThrow(draft, pageId, nodeId);
  node.locked = locked;
}

/* -------------------------------------------------------------------- pages */

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
