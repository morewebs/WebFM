import type {
  ComponentId,
  ComponentInstanceNode,
  FrameNode,
  NodeId,
  Page,
  PageId,
  Project,
  SceneNode,
} from "./types";

export function getPage(project: Project, pageId: PageId): Page | undefined {
  return project.pages.find((page) => page.id === pageId);
}

export function walkNode(node: SceneNode, visitor: (node: SceneNode) => void): void {
  visitor(node);
  if (node.type === "frame") {
    for (const child of node.children) walkNode(child, visitor);
  }
}

export function walkNodes(root: SceneNode, visitor: (node: SceneNode) => void): void {
  walkNode(root, visitor);
}

export function collectNodes(root: SceneNode): SceneNode[] {
  const nodes: SceneNode[] = [];
  walkNode(root, (node) => nodes.push(node));
  return nodes;
}

export function findNode(root: SceneNode, nodeId: NodeId): SceneNode | null {
  if (root.id === nodeId) return root;
  if (root.type === "frame") {
    for (const child of root.children) {
      const found = findNode(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function findParent(root: SceneNode, nodeId: NodeId): FrameNode | null {
  if (root.type === "frame") {
    for (const child of root.children) {
      if (child.id === nodeId) return root;
      const found = findParent(child, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function indexOfNode(parent: FrameNode, nodeId: NodeId): number {
  return parent.children.findIndex((child) => child.id === nodeId);
}

/** True when `ancestorId` is the node itself or one of its ancestors. */
export function isSelfOrDescendant(root: SceneNode, ancestorId: NodeId, nodeId: NodeId): boolean {
  const path = nodePath(root, nodeId);
  return path.some((node) => node.id === ancestorId);
}

/** Path from the root to the node, both included. Empty when not found. */
export function nodePath(root: SceneNode, nodeId: NodeId): SceneNode[] {
  if (root.id === nodeId) return [root];
  if (root.type === "frame") {
    for (const child of root.children) {
      const path = nodePath(child, nodeId);
      if (path.length > 0) return [root, ...path];
    }
  }
  return [];
}

export function findNodeInPage(page: Page, nodeId: NodeId): SceneNode | null {
  return findNode(page.root, nodeId);
}

export function findNodeInProject(
  project: Project,
  pageId: PageId,
  nodeId: NodeId,
): SceneNode | null {
  const page = getPage(project, pageId);
  return page ? findNode(page.root, nodeId) : null;
}

/**
 * Finds every component instance that references `componentId`.
 *
 * `source` may be the whole project (pages plus every component variant), one
 * page, or any scene subtree. The project form is what delete protection and
 * the UI instance counter use.
 */
export function findComponentInstances(
  source: Project | Page | SceneNode,
  componentId: ComponentId,
): ComponentInstanceNode[] {
  const instances: ComponentInstanceNode[] = [];

  const scan = (root: SceneNode): void => {
    walkNode(root, (node) => {
      if (node.type === "componentInstance" && node.componentId === componentId) {
        instances.push(node);
      }
    });
  };

  if (isProjectSource(source)) {
    for (const page of source.pages) scan(page.root);
    for (const component of source.components) {
      for (const variant of component.variants) scan(variant.root);
    }
  } else if (isPageSource(source)) {
    scan(source.root);
  } else {
    scan(source);
  }

  return instances;
}

function isProjectSource(source: Project | Page | SceneNode): source is Project {
  return "pages" in source;
}

function isPageSource(source: Project | Page | SceneNode): source is Page {
  return "root" in source;
}
