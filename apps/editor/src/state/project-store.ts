/**
 * Editor state for one open project.
 *
 * The document lives in `packages/model` history state; this store owns the
 * editor-only state around it (selection, viewport, save status) and wires
 * operations through `applyOperation` so undo/redo comes for free. Autosave is a
 * 600 ms debounce; conflicts are surfaced instead of overwriting the server.
 */

import {
  applyOperation,
  canRedo,
  canUndo,
  createHistory,
  duplicateNode,
  findNode,
  findParent,
  getPage,
  insertNode as insertNodeOperation,
  isSelfOrDescendant,
  type BoxProps,
  type Breakpoint,
  type BreakpointId,
  type DeepPartial,
  type HistoryState,
  type ImageProps,
  type NodeId,
  type Page,
  type PageId,
  type Project,
  type SceneNode,
  type TextProps,
  redo as redoHistory,
  removeNode,
  undo as undoHistory,
  updateBoxProps,
  updateImageProps,
  updateTextProps,
} from "@webfm/model";
import type { Asset } from "@webfm/model";
import type { Draft } from "immer";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  ApiError,
  api as defaultApi,
  type ProjectApi,
  type PublishResponse,
} from "../api/client";

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

export interface ProjectStoreState {
  project: Project | null;
  activePageId: PageId;
  activeBreakpointId: BreakpointId;
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
  select(nodeId: NodeId, additive?: boolean): void;
  selectMany(nodeIds: NodeId[]): void;
  clearSelection(): void;
  setHovered(nodeId: NodeId | null): void;
  setZoom(zoom: number): void;
  setPan(pan: Pan): void;
  applyRecipe(
    label: string,
    recipe: (draft: Draft<Project>) => void,
    coalesceKey?: string,
  ): void;
  updateBox(nodeId: NodeId, patch: DeepPartial<BoxProps>, breakpointId?: BreakpointId): void;
  updateText(nodeId: NodeId, patch: DeepPartial<TextProps>): void;
  updateImage(nodeId: NodeId, patch: DeepPartial<ImageProps>): void;
  insertNode(node: SceneNode, options?: InsertNodeOptions): NodeId | null;
  deleteSelection(): void;
  duplicateSelection(): NodeId[];
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

/** Highest selected nodes, so deleting a parent and child does not double-delete. */
function topLevelSelection(root: SceneNode, selection: NodeId[]): NodeId[] {
  const unique = [...new Set(selection)].filter(
    (id) => findNode(root, id) !== null && id !== root.id,
  );
  return unique.filter(
    (id) => !unique.some((other) => other !== id && isSelfOrDescendant(root, other, id)),
  );
}

function defaultInsertParent(page: Page, selection: NodeId[]): NodeId {
  const selectedId = selection[0];
  if (!selectedId) return page.root.id;
  const node = findNode(page.root, selectedId);
  if (!node) return page.root.id;
  if (node.type === "frame") return node.id;
  return findParent(page.root, selectedId)?.id ?? page.root.id;
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
      const page = project.pages[0] ?? null;
      const breakpoint = project.breakpoints[0] ?? null;
      set({
        project,
        history: newHistory(project),
        activePageId: page?.id ?? "",
        activeBreakpointId: breakpoint?.id ?? "",
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

    const applyRecipe = (
      label: string,
      recipe: (draft: Draft<Project>) => void,
      coalesceKey?: string,
    ): void => {
      const state = get();
      if (!state.project || !state.history) return;
      try {
        const history =
          coalesceKey === undefined
            ? applyOperation(state.history, label, recipe)
            : applyOperation(state.history, label, recipe, { coalesceKey });
        set({ project: history.project, history, dirty: true, error: null });
        get().scheduleSave();
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    };

    const updateBox = (
      nodeId: NodeId,
      patch: DeepPartial<BoxProps>,
      breakpointId?: BreakpointId,
    ): void => {
      const page = currentPage();
      if (!page) return;
      const activeBreakpointId = breakpointId ?? get().activeBreakpointId;
      applyRecipe("Update box", (draft) => {
        updateBoxProps(draft, {
          pageId: page.id,
          nodeId,
          breakpointId: activeBreakpointId,
          patch,
        });
      });
    };

    const deleteSelection = (): void => {
      const state = get();
      const page = currentPage();
      if (!page || state.selection.length === 0) return;
      const topLevel = topLevelSelection(page.root, state.selection);
      if (topLevel.length === 0) return;
      const first = topLevel[0];
      const parent = first ? findParent(page.root, first) : null;
      applyRecipe("Delete selection", (draft) => {
        for (const nodeId of topLevel) removeNode(draft, { pageId: page.id, nodeId });
      });
      set({ selection: parent ? [parent.id] : [], hoveredNodeId: null });
    };

    return {
      project: null,
      activePageId: "",
      activeBreakpointId: "",
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
        set({ activePageId: page.id, selection: [], hoveredNodeId: null });
      },

      setActiveBreakpoint(breakpointId) {
        const state = get();
        if (!state.project?.breakpoints.some((breakpoint) => breakpoint.id === breakpointId)) {
          return;
        }
        set({ activeBreakpointId: breakpointId });
      },

      select(nodeId, additive = false) {
        const page = currentPage();
        if (page && !findNode(page.root, nodeId)) return;
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
        const page = currentPage();
        if (!page) return;
        set({ selection: nodeIds.filter((id) => findNode(page.root, id) !== null) });
      },

      clearSelection() {
        set({ selection: [] });
      },

      setHovered(nodeId) {
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

      updateText(nodeId, patch) {
        const page = currentPage();
        if (!page) return;
        const breakpointId = get().activeBreakpointId;
        applyRecipe("Update text", (draft) => {
          updateTextProps(draft, { pageId: page.id, nodeId, breakpointId, patch });
        });
      },

      updateImage(nodeId, patch) {
        const page = currentPage();
        if (!page) return;
        const breakpointId = get().activeBreakpointId;
        applyRecipe("Update image", (draft) => {
          updateImageProps(draft, { pageId: page.id, nodeId, breakpointId, patch });
        });
      },

      insertNode(node, options = {}) {
        const page = currentPage();
        if (!page) return null;
        const parentId = options.parentId ?? defaultInsertParent(page, get().selection);
        applyRecipe("Insert node", (draft) => {
          insertNodeOperation(draft, {
            pageId: page.id,
            parentId,
            node,
            index: options.index,
          });
        });
        set({ selection: [node.id] });
        return node.id;
      },

      deleteSelection,

      duplicateSelection() {
        const state = get();
        const page = currentPage();
        if (!page) return [];
        const topLevel = topLevelSelection(page.root, state.selection);
        const newIds: NodeId[] = [];
        if (topLevel.length === 0) return newIds;
        applyRecipe("Duplicate selection", (draft) => {
          for (const nodeId of topLevel) {
            newIds.push(duplicateNode(draft, { pageId: page.id, nodeId }));
          }
        });
        set({ selection: newIds });
        return newIds;
      },

      undo() {
        const state = get();
        if (!state.history || !canUndo(state.history)) return;
        const history = undoHistory(state.history);
        set({ project: history.project, history, dirty: true });
        get().scheduleSave();
      },

      redo() {
        const state = get();
        if (!state.history || !canRedo(state.history)) return;
        const history = redoHistory(state.history);
        set({ project: history.project, history, dirty: true });
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
