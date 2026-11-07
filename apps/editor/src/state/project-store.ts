/**
 * Editor state for one open project.
 *
 * The document lives in `packages/model` history state; this store owns the
 * editor-only state around it (selection, viewport, save status) and wires
 * operations through `applyOperation` so undo/redo comes for free. Autosave is a
 * 600 ms debounce; conflicts are surfaced instead of overwriting the server.
 */

import type { Asset } from "@webfm/model";
import {
  addBreakpoint as addBreakpointOperation,
  addColorStyle as addColorStyleOperation,
  addComponentVariant as addComponentVariantOperation,
  addGuide as addGuideOperation,
  applyOperation,
  type BoxProps,
  type Breakpoint,
  type BreakpointId,
  type ColorStyle,
  type ColorStyleId,
  type ColorStylePatch,
  type ComponentDefinition,
  type ComponentId,
  type ComponentVariant,
  canRedo,
  canUndo,
  createComponentFromNode,
  createHistory,
  type DeepPartial,
  duplicateNode,
  findNode,
  findParent,
  type Guide,
  getPage,
  type HistoryState,
  type ImageProps,
  insertComponentInstance as insertComponentInstanceOperation,
  insertNode as insertNodeOperation,
  isSelfOrDescendant,
  type NodeId,
  normalizeProject,
  type Page,
  type PageId,
  type Project,
  redo as redoHistory,
  removeBreakpoint as removeBreakpointOperation,
  removeColorStyle as removeColorStyleOperation,
  removeGuide as removeGuideOperation,
  removeNode,
  renameComponent as renameComponentOperation,
  renameComponentVariant as renameComponentVariantOperation,
  renameNode,
  resolveNodeProps,
  type SceneNode,
  type SceneTarget,
  setInstanceVariant as setInstanceVariantOperation,
  type TextProps,
  undo as undoHistory,
  unwrapNode,
  updateBoxProps,
  updateColorStyle as updateColorStyleOperation,
  updateGuide as updateGuideOperation,
  updateImageProps,
  updateTextProps,
  type VariantId,
  wrapNodes,
} from "@webfm/model";
import type { Draft } from "immer";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { ApiError, api as defaultApi, type ProjectApi, type PublishResponse } from "../api/client";

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface Pan {
  x: number;
  y: number;
}

export interface ConflictState {
  expectedVersion: number;
  serverVersion: number | null;
  message: string;
}

export interface InsertNodeOptions {
  parentId?: NodeId;
  index?: number;
}

/** The component variant the editor is currently editing, if any. */
export interface EditingComponent {
  componentId: ComponentId;
  variantId: VariantId;
  /** The instance on the page that opened this edit session, for "Back to page". */
  instanceId?: NodeId;
}

/** The page or component variant that node operations currently address. */
export interface ActiveScene {
  kind: "page" | "component";
  root: SceneNode;
  target: SceneTarget;
  page: Page | null;
  component: ComponentDefinition | null;
  variant: ComponentVariant | null;
}

export interface ProjectStoreState {
  project: Project | null;
  activePageId: PageId;
  activeBreakpointId: BreakpointId;
  editingComponent: EditingComponent | null;
  selection: NodeId[];
  hoveredNodeId: NodeId | null;
  zoom: number;
  pan: Pan;
  history: HistoryState | null;
  saving: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  loadState: LoadState;
  error: string | null;
  conflict: ConflictState | null;

  openProject(id: string): Promise<void>;
  createProject(name: string): Promise<void>;
  closeProject(): void;
  setActivePage(pageId: PageId): void;
  setActiveBreakpoint(breakpointId: BreakpointId): void;
  addBreakpoint(name: string, width: number): BreakpointId | null;
  removeBreakpoint(breakpointId: BreakpointId): void;
  /**
   * Adds a guide to the active page and returns its id. Guides are page-level
   * editor metadata: even in component edit mode they write to the active page.
   */
  addGuide(axis: Guide["axis"], position: number): string | null;
  updateGuide(guideId: string, position: number): void;
  removeGuide(guideId: string): void;
  select(nodeId: NodeId, additive?: boolean): void;
  selectMany(nodeIds: NodeId[]): void;
  clearSelection(): void;
  setHovered(nodeId: NodeId | null): void;
  setZoom(zoom: number): void;
  setPan(pan: Pan): void;
  applyRecipe(label: string, recipe: (draft: Draft<Project>) => void, coalesceKey?: string): void;
  updateBox(nodeId: NodeId, patch: DeepPartial<BoxProps>, breakpointId?: BreakpointId): void;
  setNodePositions(updates: Array<{ nodeId: NodeId; x: number; y: number }>, label?: string): void;
  updateText(nodeId: NodeId, patch: DeepPartial<TextProps>): void;
  updateImage(nodeId: NodeId, patch: DeepPartial<ImageProps>): void;
  insertNode(node: SceneNode, options?: InsertNodeOptions): NodeId | null;
  deleteSelection(): void;
  duplicateSelection(): NodeId[];
  wrapSelection(
    kind: "frame" | "stack",
    bounds: { x: number; y: number; width: number; height: number },
    positions: Record<NodeId, { x: number; y: number }>,
  ): NodeId | null;
  unwrapSelection(
    nodeId: NodeId,
    childPositions?: Record<NodeId, { x: number; y: number }>,
  ): NodeId[];
  enterComponent(componentId: ComponentId, variantId?: VariantId, instanceId?: NodeId): void;
  exitComponent(): void;
  createComponentFromSelection(
    name?: string,
  ): { componentId: ComponentId; variantId: VariantId; instanceId: NodeId } | null;
  insertComponentInstance(componentId: ComponentId, variantId?: VariantId): NodeId | null;
  addComponentVariant(): VariantId | null;
  setEditingVariant(variantId: VariantId): void;
  setInstanceVariant(nodeId: NodeId, variantId: VariantId): void;
  renameComponentVariant(variantId: VariantId, name: string): void;
  renameComponent(componentId: ComponentId, name: string): void;
  /**
   * Adds a project color style. When `fromSelection` is true and the selected
   * layer has a solid fill or text color, that color seeds the new style;
   * otherwise it defaults to #0099ff at full opacity.
   */
  createColorStyle(fromSelection?: boolean): ColorStyleId | null;
  /** Edits a color style and propagates the value to every linked usage. */
  updateColorStyle(id: ColorStyleId, patch: ColorStylePatch): boolean;
  /** Deletes a color style and detaches every linked usage without recoloring. */
  removeColorStyle(id: ColorStyleId): void;
  /** Applies a color style to the selected layer(s) in the active scene. */
  applyColorStyle(id: ColorStyleId): boolean;
  undo(): void;
  redo(): void;
  saveNow(): Promise<void>;
  scheduleSave(): void;
  uploadAsset(file: File | Blob): Promise<Asset | null>;
  publish(adapterId: string, options?: Record<string, unknown>): Promise<PublishResponse | null>;
}

export interface ProjectStoreDeps {
  api?: ProjectApi;
  debounceMs?: number;
  historyLimit?: number;
  now?: () => number;
}

const DEFAULT_DEBOUNCE_MS = 600;
const DEFAULT_HISTORY_LIMIT = 100;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function conflictFrom(error: ApiError, expectedVersion: number): ConflictState {
  let serverVersion: number | null = null;
  if (isRecord(error.body)) {
    const candidate = error.body.currentVersion ?? error.body.serverVersion ?? error.body.version;
    if (typeof candidate === "number" && Number.isFinite(candidate)) serverVersion = candidate;
  }
  return { expectedVersion, serverVersion, message: error.message };
}

/** The active page, falling back to the first page (e.g. after a reload). */
export function activePageOf(project: Project | null, pageId: PageId): Page | null {
  if (!project) return null;
  return project.pages.find((page) => page.id === pageId) ?? project.pages[0] ?? null;
}

/** The active breakpoint, falling back to the primary one. */
export function activeBreakpointOf(
  project: Project | null,
  breakpointId: BreakpointId,
): Breakpoint | null {
  if (!project) return null;
  return (
    project.breakpoints.find((breakpoint) => breakpoint.id === breakpointId) ??
    project.breakpoints[0] ??
    null
  );
}

/**
 * The scene node operations currently address. Component edit mode resolves the
 * component and variant (explicit, then default, then first); otherwise the
 * active page. Returns null when the project or target does not exist.
 */
export function activeSceneOf(
  project: Project | null,
  pageId: PageId,
  editing: EditingComponent | null,
): ActiveScene | null {
  if (!project) return null;

  if (editing) {
    const component = project.components.find((candidate) => candidate.id === editing.componentId);
    if (!component || component.variants.length === 0) return null;
    const variant =
      component.variants.find((candidate) => candidate.id === editing.variantId) ??
      component.variants.find((candidate) => candidate.id === component.defaultVariantId) ??
      component.variants[0];
    if (!variant) return null;
    return {
      kind: "component",
      root: variant.root,
      target: { componentId: component.id, variantId: variant.id },
      page: null,
      component,
      variant,
    };
  }

  const page = activePageOf(project, pageId);
  if (!page) return null;
  return {
    kind: "page",
    root: page.root,
    target: { pageId: page.id },
    page,
    component: null,
    variant: null,
  };
}

/** Highest selected nodes, so deleting a parent and child does not double-delete. */
function topLevelSelection(root: SceneNode, selection: NodeId[]): NodeId[] {
  const unique = [...new Set(selection)].filter(
    (id) => findNode(root, id) !== null && id !== root.id,
  );
  return unique.filter(
    (id) => !unique.some((other) => other !== id && isSelfOrDescendant(root, other, id)),
  );
}

function defaultInsertParent(root: SceneNode, selection: NodeId[]): NodeId {
  const selectedId = selection[0];
  if (!selectedId) return root.id;
  const node = findNode(root, selectedId);
  if (!node) return root.id;
  if (node.type === "frame") return node.id;
  return findParent(root, selectedId)?.id ?? root.id;
}

/** The selected frame, or the active root when the selection is not a frame. */
function insertComponentParent(root: SceneNode, selection: NodeId[]): NodeId {
  const selectedId = selection[0];
  if (!selectedId) return root.id;
  const node = findNode(root, selectedId);
  return node?.type === "frame" ? node.id : root.id;
}

/** Builds a `SceneTarget & extra` object without losing the target's fields. */
function withTarget<T extends object>(target: SceneTarget, extra: T): SceneTarget & T {
  return { ...target, ...extra } as SceneTarget & T;
}

/** A text node's name is automatic while it mirrors its content, is "Text", or is blank. */
function isAutoTextName(name: string, content: string): boolean {
  return name === content || name === "Text" || name.trim() === "";
}

/** The name a text node gets from its content: its first 24 characters, or "Text". */
function autoTextName(content: string): string {
  const name = content.slice(0, 24).trim();
  return name.length > 0 ? name : "Text";
}

const DEFAULT_COLOR_STYLE = { color: "#0099ff", opacity: 1 } as const;

/** "Color 1", "Color 2", … skipping names already in the project. */
function uniqueColorStyleName(styles: ColorStyle[]): string {
  const taken = new Set(styles.map((style) => style.name.trim().toLowerCase()));
  let index = 1;
  while (taken.has(`color ${index}`)) index += 1;
  return `Color ${index}`;
}

export type ProjectStore = UseBoundStore<StoreApi<ProjectStoreState>>;

export function createProjectStore(deps: ProjectStoreDeps = {}): ProjectStore {
  const api = deps.api ?? defaultApi;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const historyLimit = deps.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const now = deps.now ?? (() => Date.now());

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let loadToken = 0;

  return create<ProjectStoreState>()((set, get) => {
    const cancelScheduledSave = (): void => {
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
    };

    const newHistory = (project: Project): HistoryState =>
      createHistory(project, { limit: historyLimit });

    const activateProject = (project: Project): void => {
      cancelScheduledSave();
      const normalized = normalizeProject(project);
      const page = normalized.pages[0] ?? null;
      const breakpoint = normalized.breakpoints[0] ?? null;
      set({
        project: normalized,
        history: newHistory(normalized),
        activePageId: page?.id ?? "",
        activeBreakpointId: breakpoint?.id ?? "",
        editingComponent: null,
        selection: [],
        hoveredNodeId: null,
        zoom: 1,
        pan: { x: 0, y: 0 },
        saving: false,
        dirty: false,
        lastSavedAt: now(),
        loadState: "ready",
        error: null,
        conflict: null,
      });
    };

    const currentPage = (): Page | null => {
      const state = get();
      return activePageOf(state.project, state.activePageId);
    };

    const currentScene = (): ActiveScene | null => {
      const state = get();
      return activeSceneOf(state.project, state.activePageId, state.editingComponent);
    };

    const saveNow = async (): Promise<void> => {
      const state = get();
      const project = state.project;
      if (!project || state.saving || state.conflict) return;
      cancelScheduledSave();

      const expectedVersion = project.version;
      set({ saving: true, error: null });

      try {
        const savedProject = await api.saveProject(project.id, project, expectedVersion);
        const current = get();
        // The user switched projects while the request was in flight.
        if (current.project?.id !== project.id) return;
        const editedDuringSave = current.project !== project;
        const lastSavedAt = now();

        if (editedDuringSave && current.project) {
          // Keep local edits but adopt the server's new revision, then save again.
          const merged: Project = {
            ...current.project,
            version: savedProject.version,
            updatedAt: savedProject.updatedAt,
          };
          set({
            project: merged,
            history: current.history ? { ...current.history, project: merged } : newHistory(merged),
            saving: false,
            dirty: true,
            lastSavedAt,
            error: null,
          });
          get().scheduleSave();
          return;
        }

        set({
          project: savedProject,
          history: current.history
            ? { ...current.history, project: savedProject }
            : newHistory(savedProject),
          saving: false,
          dirty: false,
          lastSavedAt,
          error: null,
        });
      } catch (error) {
        if (get().project?.id !== project.id) return;
        if (error instanceof ApiError && error.status === 409) {
          set({
            saving: false,
            conflict: conflictFrom(error, expectedVersion),
            error: error.message,
          });
          return;
        }
        set({ saving: false, error: errorMessage(error) });
      }
    };

    const scheduleSave = (): void => {
      const state = get();
      if (!state.project || state.conflict || state.saving) return;
      cancelScheduledSave();
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void get().saveNow();
      }, debounceMs);
    };

    /** Applies a document operation to history; false when it threw. */
    const runRecipe = (
      label: string,
      recipe: (draft: Draft<Project>) => void,
      coalesceKey?: string,
    ): boolean => {
      const state = get();
      if (!state.project || !state.history) return false;
      try {
        const history =
          coalesceKey === undefined
            ? applyOperation(state.history, label, recipe)
            : applyOperation(state.history, label, recipe, { coalesceKey });
        set({ project: history.project, history, dirty: true, error: null });
        get().scheduleSave();
        return true;
      } catch (error) {
        set({ error: errorMessage(error) });
        return false;
      }
    };

    const applyRecipe = (
      label: string,
      recipe: (draft: Draft<Project>) => void,
      coalesceKey?: string,
    ): void => {
      runRecipe(label, recipe, coalesceKey);
    };

    /** Runs a recipe and returns what it captured; null when it threw. */
    const applyRecipeWithResult = <T>(
      label: string,
      recipe: (draft: Draft<Project>) => T,
    ): T | null => {
      let result: T | null = null;
      const applied = runRecipe(label, (draft) => {
        result = recipe(draft);
      });
      return applied ? result : null;
    };

    const updateBox = (
      nodeId: NodeId,
      patch: DeepPartial<BoxProps>,
      breakpointId?: BreakpointId,
    ): void => {
      const scene = currentScene();
      if (!scene) return;
      const activeBreakpointId = breakpointId ?? get().activeBreakpointId;
      applyRecipe("Update box", (draft) => {
        updateBoxProps(
          draft,
          withTarget(scene.target, { nodeId, breakpointId: activeBreakpointId, patch }),
        );
      });
    };

    const setNodePositions = (
      updates: Array<{ nodeId: NodeId; x: number; y: number }>,
      label = "Set positions",
    ): void => {
      if (updates.length === 0) return;
      const scene = currentScene();
      if (!scene) return;
      const breakpointId = get().activeBreakpointId;
      applyRecipe(label, (draft) => {
        for (const { nodeId, x, y } of updates) {
          updateBoxProps(
            draft,
            withTarget(scene.target, {
              nodeId,
              breakpointId,
              patch: { position: { x, y } },
            }),
          );
        }
      });
    };

    const deleteSelection = (): void => {
      const state = get();
      const scene = currentScene();
      if (!scene || state.selection.length === 0) return;
      const topLevel = topLevelSelection(scene.root, state.selection);
      if (topLevel.length === 0) return;
      const first = topLevel[0];
      const parent = first ? findParent(scene.root, first) : null;
      applyRecipe("Delete selection", (draft) => {
        for (const nodeId of topLevel) {
          removeNode(draft, withTarget(scene.target, { nodeId }));
        }
      });
      set({ selection: parent ? [parent.id] : [], hoveredNodeId: null });
    };

    return {
      project: null,
      activePageId: "",
      activeBreakpointId: "",
      editingComponent: null,
      selection: [],
      hoveredNodeId: null,
      zoom: 1,
      pan: { x: 0, y: 0 },
      history: null,
      saving: false,
      dirty: false,
      lastSavedAt: null,
      loadState: "idle",
      error: null,
      conflict: null,

      async openProject(id) {
        const token = ++loadToken;
        set({ loadState: "loading", error: null });
        try {
          const project = await api.getProject(id);
          if (token !== loadToken) return;
          activateProject(project);
        } catch (error) {
          if (token !== loadToken) return;
          set({ loadState: "error", error: errorMessage(error) });
        }
      },

      async createProject(name) {
        const token = ++loadToken;
        set({ loadState: "loading", error: null });
        try {
          const project = await api.createProject(name);
          if (token !== loadToken) return;
          activateProject(project);
        } catch (error) {
          if (token !== loadToken) return;
          set({ loadState: "error", error: errorMessage(error) });
        }
      },

      closeProject() {
        loadToken += 1;
        cancelScheduledSave();
        set({
          project: null,
          activePageId: "",
          activeBreakpointId: "",
          editingComponent: null,
          selection: [],
          hoveredNodeId: null,
          zoom: 1,
          pan: { x: 0, y: 0 },
          history: null,
          saving: false,
          dirty: false,
          lastSavedAt: null,
          loadState: "idle",
          error: null,
          conflict: null,
        });
      },

      setActivePage(pageId) {
        const state = get();
        const page = state.project ? getPage(state.project, pageId) : undefined;
        if (!page) return;
        set({
          activePageId: page.id,
          editingComponent: null,
          selection: [],
          hoveredNodeId: null,
        });
      },

      setActiveBreakpoint(breakpointId) {
        const state = get();
        if (!state.project?.breakpoints.some((breakpoint) => breakpoint.id === breakpointId)) {
          return;
        }
        set({ activeBreakpointId: breakpointId });
      },

      addBreakpoint(name, width) {
        const breakpointId = applyRecipeWithResult("Add breakpoint", (draft) =>
          addBreakpointOperation(draft, { name, width }),
        );
        if (breakpointId === null) return null;
        set({ activeBreakpointId: breakpointId });
        return breakpointId;
      },

      removeBreakpoint(breakpointId) {
        applyRecipe("Remove breakpoint", (draft) => {
          removeBreakpointOperation(draft, breakpointId);
        });
        const state = get();
        if (!state.project) return;
        // A failed removal (primary, missing) leaves the active breakpoint valid;
        // a successful removal of the active one falls back to the primary.
        const activeStillExists = state.project.breakpoints.some(
          (breakpoint) => breakpoint.id === state.activeBreakpointId,
        );
        if (!activeStillExists) {
          set({ activeBreakpointId: state.project.breakpoints[0]?.id ?? "" });
        }
      },

      addGuide(axis, position) {
        const page = currentPage();
        if (!page) return null;
        const guideId = applyRecipeWithResult("Add guide", (draft) =>
          addGuideOperation(draft, { pageId: page.id, axis, position }),
        );
        return guideId;
      },

      updateGuide(guideId, position) {
        const page = currentPage();
        if (!page) return;
        applyRecipe("Update guide", (draft) => {
          updateGuideOperation(draft, { pageId: page.id, guideId, position });
        });
      },

      removeGuide(guideId) {
        const page = currentPage();
        if (!page) return;
        applyRecipe("Remove guide", (draft) => {
          removeGuideOperation(draft, { pageId: page.id, guideId });
        });
      },

      select(nodeId, additive = false) {
        const scene = currentScene();
        if (scene && !findNode(scene.root, nodeId)) return;
        const selection = get().selection;
        if (!additive) {
          set({ selection: [nodeId] });
          return;
        }
        set({
          selection: selection.includes(nodeId)
            ? selection.filter((id) => id !== nodeId)
            : [...selection, nodeId],
        });
      },

      selectMany(nodeIds) {
        const scene = currentScene();
        if (!scene) return;
        set({ selection: nodeIds.filter((id) => findNode(scene.root, id) !== null) });
      },

      clearSelection() {
        set({ selection: [] });
      },

      setHovered(nodeId) {
        if (nodeId !== null) {
          const scene = currentScene();
          if (scene && !findNode(scene.root, nodeId)) return;
        }
        set({ hoveredNodeId: nodeId });
      },

      setZoom(zoom) {
        if (!Number.isFinite(zoom)) return;
        set({ zoom: Math.min(4, Math.max(0.1, zoom)) });
      },

      setPan(pan) {
        set({ pan: { x: pan.x, y: pan.y } });
      },

      applyRecipe,

      updateBox,

      setNodePositions,

      updateText(nodeId, patch) {
        const state = get();
        const scene = activeSceneOf(state.project, state.activePageId, state.editingComponent);
        const project = state.project;
        if (!scene || !project) return;
        const breakpointId = state.activeBreakpointId;

        // Content edits auto-rename a node whose name still mirrors its text.
        let autoName: string | null = null;
        const nextContent = patch.text?.content;
        if (nextContent !== undefined) {
          const node = findNode(scene.root, nodeId);
          if (node?.type === "text") {
            const currentContent = resolveNodeProps(node, breakpointId, project.breakpoints).text
              .content;
            if (nextContent !== currentContent && isAutoTextName(node.name, currentContent)) {
              autoName = autoTextName(nextContent);
            }
          }
        }

        applyRecipe("Update text", (draft) => {
          updateTextProps(draft, withTarget(scene.target, { nodeId, breakpointId, patch }));
          if (autoName !== null) {
            renameNode(draft, withTarget(scene.target, { nodeId }), autoName);
          }
        });
      },

      updateImage(nodeId, patch) {
        const scene = currentScene();
        if (!scene) return;
        const breakpointId = get().activeBreakpointId;
        applyRecipe("Update image", (draft) => {
          updateImageProps(draft, withTarget(scene.target, { nodeId, breakpointId, patch }));
        });
      },

      insertNode(node, options = {}) {
        const scene = currentScene();
        if (!scene) return null;
        const parentId = options.parentId ?? defaultInsertParent(scene.root, get().selection);
        applyRecipe("Insert node", (draft) => {
          insertNodeOperation(
            draft,
            withTarget(scene.target, { parentId, node, index: options.index }),
          );
        });
        set({ selection: [node.id] });
        return node.id;
      },

      deleteSelection,

      duplicateSelection() {
        const state = get();
        const scene = currentScene();
        if (!scene) return [];
        const topLevel = topLevelSelection(scene.root, state.selection);
        const newIds: NodeId[] = [];
        if (topLevel.length === 0) return newIds;
        applyRecipe("Duplicate selection", (draft) => {
          for (const nodeId of topLevel) {
            newIds.push(duplicateNode(draft, withTarget(scene.target, { nodeId })));
          }
        });
        set({ selection: newIds });
        return newIds;
      },

      wrapSelection(kind, bounds, positions) {
        const state = get();
        const scene = currentScene();
        if (!scene) return null;
        const nodeIds = topLevelSelection(scene.root, state.selection);
        if (nodeIds.length === 0) return null;

        const frameId = applyRecipeWithResult(
          kind === "stack" ? "Wrap in stack" : "Wrap in frame",
          (draft) =>
            wrapNodes(draft, withTarget(scene.target, { nodeIds, kind, bounds, positions })),
        );
        if (frameId === null) return null;
        set({ selection: [frameId] });
        return frameId;
      },

      unwrapSelection(nodeId, childPositions) {
        const scene = currentScene();
        if (!scene) return [];
        const parent = findParent(scene.root, nodeId);

        const moved = applyRecipeWithResult("Remove frame", (draft) =>
          unwrapNode(draft, withTarget(scene.target, { nodeId, childPositions })),
        );
        if (moved === null) return [];
        set({ selection: moved.length > 0 ? moved : parent ? [parent.id] : [] });
        return moved;
      },

      enterComponent(componentId, variantId, instanceId) {
        const state = get();
        const project = state.project;
        if (!project) return;
        const component = project.components.find((candidate) => candidate.id === componentId);
        if (!component || component.variants.length === 0) return;
        const variant =
          variantId !== undefined
            ? component.variants.find((candidate) => candidate.id === variantId)
            : (component.variants.find(
                (candidate) => candidate.id === component.defaultVariantId,
              ) ?? component.variants[0]);
        if (!variant) return;
        const editing: EditingComponent = { componentId: component.id, variantId: variant.id };
        if (instanceId !== undefined) editing.instanceId = instanceId;
        set({ editingComponent: editing, selection: [], hoveredNodeId: null });
      },

      exitComponent() {
        const state = get();
        const editing = state.editingComponent;
        if (!editing) return;
        let selection: NodeId[] = [];
        if (editing.instanceId !== undefined) {
          const pageScene = activeSceneOf(state.project, state.activePageId, null);
          if (pageScene && findNode(pageScene.root, editing.instanceId) !== null) {
            selection = [editing.instanceId];
          }
        }
        set({ editingComponent: null, selection, hoveredNodeId: null });
      },

      createComponentFromSelection(name) {
        const state = get();
        const scene = currentScene();
        if (!scene || scene.kind !== "page") return null;
        if (state.selection.length !== 1) return null;
        const nodeId = state.selection[0];
        if (nodeId === undefined || nodeId === scene.root.id) return null;

        const result = applyRecipeWithResult("Create component", (draft) =>
          createComponentFromNode(draft, {
            pageId: state.activePageId,
            nodeId,
            name,
          }),
        );
        if (!result) return null;
        set({
          editingComponent: {
            componentId: result.componentId,
            variantId: result.variantId,
            instanceId: result.instanceId,
          },
          selection: [],
          hoveredNodeId: null,
        });
        return result;
      },

      insertComponentInstance(componentId, variantId) {
        const state = get();
        const scene = currentScene();
        if (!scene) return null;
        const parentId = insertComponentParent(scene.root, state.selection);
        const instanceId = applyRecipeWithResult("Insert component instance", (draft) =>
          insertComponentInstanceOperation(draft, {
            pageId: state.activePageId,
            parentId,
            componentId,
            variantId,
          }),
        );
        if (instanceId === null) return null;
        set({ selection: [instanceId] });
        return instanceId;
      },

      addComponentVariant() {
        const state = get();
        const editing = state.editingComponent;
        if (!editing) return null;
        const variantId = applyRecipeWithResult("Add variant", (draft) =>
          addComponentVariantOperation(draft, {
            componentId: editing.componentId,
            fromVariantId: editing.variantId,
          }),
        );
        if (variantId === null) return null;
        set({
          editingComponent: { ...editing, variantId },
          selection: [],
          hoveredNodeId: null,
        });
        return variantId;
      },

      setEditingVariant(variantId) {
        const state = get();
        const editing = state.editingComponent;
        if (!editing) return;
        const component = state.project?.components.find(
          (candidate) => candidate.id === editing.componentId,
        );
        if (!component?.variants.some((variant) => variant.id === variantId)) return;
        set({
          editingComponent: { ...editing, variantId },
          selection: [],
          hoveredNodeId: null,
        });
      },

      setInstanceVariant(nodeId, variantId) {
        const scene = currentScene();
        if (!scene) return;
        applyRecipe("Set instance variant", (draft) => {
          setInstanceVariantOperation(draft, withTarget(scene.target, { nodeId }), variantId);
        });
      },

      renameComponentVariant(variantId, name) {
        const state = get();
        const project = state.project;
        if (!project) return;
        const editing = state.editingComponent;
        const editingComponent = editing
          ? project.components.find((candidate) => candidate.id === editing.componentId)
          : undefined;
        const owner =
          editingComponent?.variants.some((variant) => variant.id === variantId) === true
            ? editingComponent
            : project.components.find((component) =>
                component.variants.some((variant) => variant.id === variantId),
              );
        if (!owner) return;
        applyRecipe("Rename variant", (draft) => {
          renameComponentVariantOperation(draft, {
            componentId: owner.id,
            variantId,
            name,
          });
        });
      },

      renameComponent(componentId, name) {
        applyRecipe("Rename component", (draft) => {
          renameComponentOperation(draft, { componentId, name });
        });
      },

      createColorStyle(fromSelection = true) {
        const state = get();
        const project = state.project;
        const scene = currentScene();
        if (!project) return null;

        let seed: { color: string; opacity: number } = { ...DEFAULT_COLOR_STYLE };
        // Creating a style from a layer links that layer to the new style, the
        // way Framer does when a style is saved from the color picker.
        let seedTarget: { nodeId: NodeId; type: "frame" | "text" } | null = null;
        if (fromSelection && scene) {
          const selectedId = state.selection[0];
          const node = selectedId ? findNode(scene.root, selectedId) : null;
          if (node?.type === "text") {
            const props = resolveNodeProps<BoxProps & TextProps>(
              node,
              state.activeBreakpointId,
              project.breakpoints,
            );
            seed = { color: props.text.color, opacity: 1 };
            seedTarget = { nodeId: node.id, type: "text" };
          } else if (node?.type === "frame") {
            const props = resolveNodeProps<BoxProps>(
              node,
              state.activeBreakpointId,
              project.breakpoints,
            );
            if (props.style.fill?.type === "solid") {
              seed = { color: props.style.fill.color, opacity: props.style.fill.opacity };
              seedTarget = { nodeId: node.id, type: "frame" };
            }
          }
        }

        const name = uniqueColorStyleName(project.colorStyles);
        const breakpointId = state.activeBreakpointId;
        return applyRecipeWithResult("Create color style", (draft) => {
          const id = addColorStyleOperation(draft, { name, ...seed });
          if (seedTarget && scene) {
            if (seedTarget.type === "text") {
              updateTextProps(
                draft,
                withTarget(scene.target, {
                  nodeId: seedTarget.nodeId,
                  breakpointId,
                  patch: {
                    text: { color: seed.color },
                    colorStyleId: id,
                  },
                }),
              );
            } else {
              updateBoxProps(
                draft,
                withTarget(scene.target, {
                  nodeId: seedTarget.nodeId,
                  breakpointId,
                  patch: {
                    style: {
                      fill: {
                        type: "solid",
                        color: seed.color,
                        opacity: seed.opacity,
                        styleId: id,
                      },
                    },
                  },
                }),
              );
            }
          }
          return id;
        });
      },

      updateColorStyle(id, patch) {
        const style = get().project?.colorStyles.find((candidate) => candidate.id === id);
        if (style) {
          const nextName = patch.name === undefined ? style.name : patch.name.trim();
          const nextColor = patch.color === undefined ? style.color : patch.color.trim();
          const nextOpacity = patch.opacity === undefined ? style.opacity : patch.opacity;
          // Saving an unchanged inline editor must not create an undo step.
          if (
            nextName === style.name &&
            nextColor === style.color &&
            nextOpacity === style.opacity
          ) {
            return true;
          }
        }
        return runRecipe("Update color style", (draft) => {
          updateColorStyleOperation(draft, id, patch);
        });
      },

      removeColorStyle(id) {
        applyRecipe("Remove color style", (draft) => {
          removeColorStyleOperation(draft, id);
        });
      },

      applyColorStyle(id) {
        const state = get();
        const scene = currentScene();
        const project = state.project;
        if (!scene || !project) {
          set({ error: "Open a page before applying a color style." });
          return false;
        }
        const style = project.colorStyles.find((candidate) => candidate.id === id);
        if (!style) {
          set({ error: `Color style "${id}" was not found.` });
          return false;
        }

        const targets = state.selection.flatMap((nodeId) => {
          const node = findNode(scene.root, nodeId);
          if (!node) return [];
          if (node.type !== "frame" && node.type !== "text") return [];
          return [{ nodeId, type: node.type }];
        });
        if (targets.length === 0) {
          set({ error: "Select a frame or text layer to apply a color style." });
          return false;
        }

        const breakpointId = state.activeBreakpointId;
        const alreadyApplied = targets.every((target) => {
          const node = findNode(scene.root, target.nodeId);
          if (node?.type === "text") {
            const props = resolveNodeProps<BoxProps & TextProps>(
              node,
              breakpointId,
              project.breakpoints,
            );
            return props.colorStyleId === style.id && props.text.color === style.color;
          }
          if (node?.type !== "frame") return false;
          const fill = resolveNodeProps<BoxProps>(node, breakpointId, project.breakpoints).style
            .fill;
          return (
            fill?.type === "solid" &&
            fill.styleId === style.id &&
            fill.color === style.color &&
            fill.opacity === style.opacity
          );
        });
        // Clicking an already-applied swatch should not add an undo step.
        if (alreadyApplied) return true;

        return runRecipe("Apply color style", (draft) => {
          for (const target of targets) {
            if (target.type === "text") {
              updateTextProps(
                draft,
                withTarget(scene.target, {
                  nodeId: target.nodeId,
                  breakpointId,
                  patch: {
                    text: { color: style.color },
                    colorStyleId: style.id,
                  },
                }),
              );
            } else {
              updateBoxProps(
                draft,
                withTarget(scene.target, {
                  nodeId: target.nodeId,
                  breakpointId,
                  patch: {
                    style: {
                      fill: {
                        type: "solid",
                        color: style.color,
                        opacity: style.opacity,
                        styleId: style.id,
                      },
                    },
                  },
                }),
              );
            }
          }
        });
      },

      undo() {
        const state = get();
        if (!state.history || !canUndo(state.history)) return;
        const history = undoHistory(state.history);
        const scene = activeSceneOf(history.project, state.activePageId, state.editingComponent);
        set({
          project: history.project,
          history,
          dirty: true,
          editingComponent: scene ? state.editingComponent : null,
          selection: scene
            ? state.selection.filter((nodeId) => findNode(scene.root, nodeId) !== null)
            : [],
        });
        get().scheduleSave();
      },

      redo() {
        const state = get();
        if (!state.history || !canRedo(state.history)) return;
        const history = redoHistory(state.history);
        const scene = activeSceneOf(history.project, state.activePageId, state.editingComponent);
        set({
          project: history.project,
          history,
          dirty: true,
          editingComponent: scene ? state.editingComponent : null,
          selection: scene
            ? state.selection.filter((nodeId) => findNode(scene.root, nodeId) !== null)
            : [],
        });
        get().scheduleSave();
      },

      saveNow,

      scheduleSave,

      async uploadAsset(file) {
        const project = get().project;
        if (!project) return null;
        // Flush local edits first: the server versions the project when it
        // stores the asset, so the editor must not save over that revision.
        await saveNow();
        const synced = get().project;
        if (!synced) return null;
        if (get().conflict) {
          set({ error: "Resolve the save conflict before uploading assets." });
          return null;
        }
        try {
          const result = await api.uploadAsset(synced.id, file);
          const current = get();
          if (current.project?.id !== synced.id) return result.asset;
          if (result.project) {
            const editedDuringUpload = current.project !== synced;
            const merged: Project = current.project
              ? {
                  ...current.project,
                  version: result.project.version,
                  updatedAt: result.project.updatedAt,
                  assets: result.project.assets,
                }
              : result.project;
            set({
              project: merged,
              history: current.history
                ? { ...current.history, project: merged }
                : newHistory(merged),
              dirty: editedDuringUpload,
              lastSavedAt: now(),
            });
            if (editedDuringUpload) get().scheduleSave();
          } else {
            get().applyRecipe("Add asset", (draft) => {
              draft.assets.push(result.asset);
            });
          }
          return result.asset;
        } catch (error) {
          set({ error: errorMessage(error) });
          return null;
        }
      },

      async publish(adapterId, options = {}) {
        const project = get().project;
        if (!project) return null;
        await saveNow();
        if (get().conflict) {
          set({ error: "Resolve the save conflict before publishing." });
          return null;
        }
        try {
          return await api.publish(project.id, adapterId, options);
        } catch (error) {
          set({ error: errorMessage(error) });
          return null;
        }
      },
    };
  });
}

export const useProjectStore = createProjectStore();
