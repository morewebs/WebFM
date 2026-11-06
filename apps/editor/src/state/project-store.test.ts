import {
  createFrame,
  createProject,
  findNode,
  type FrameNode,
  type Project,
} from "@webfm/model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ProjectApi } from "../api/client";
import { createProjectStore } from "./project-store";

interface Fixture {
  project: Project;
  pageId: string;
  rootId: string;
  childId: string;
}

function fixture(): Fixture {
  const project = createProject({ name: "Demo", now: "2026-01-01T00:00:00.000Z" });
  const page = project.pages[0];
  if (!page) throw new Error("Fixture project has no page");
  const child = createFrame({
    id: "node_card",
    name: "Card",
    props: {
      position: { x: 0, y: 0 },
      size: { width: { mode: "fixed", value: 200 }, height: { mode: "fixed", value: 120 } },
    },
  });
  page.root.children.push(child);
  return { project, pageId: page.id, rootId: page.root.id, childId: child.id };
}

interface FakeApi {
  api: ProjectApi;
  saveProject: ReturnType<typeof vi.fn>;
  getProject: ReturnType<typeof vi.fn>;
}

function makeApi(project: Project, overrides: Partial<ProjectApi> = {}): FakeApi {
  const getProject = vi.fn(async (_id: string): Promise<Project> => structuredClone(project));
  const saveProject = vi.fn(
    async (_id: string, draft: Project, expectedVersion: number): Promise<Project> => ({
      ...structuredClone(draft),
      version: expectedVersion + 1,
      updatedAt: "2026-01-01T00:00:01.000Z",
    }),
  );
  const api: ProjectApi = {
    health: async () => ({ ok: true, name: "WebFM", version: "0.1.0" }),
    listProjects: async () => [],
    createProject: async (name) => ({ ...structuredClone(project), name }),
    getProject,
    saveProject,
    deleteProject: async () => {},
    uploadAsset: async () => {
      throw new Error("not implemented in the fake");
    },
    publish: async () => ({ files: [] }),
    ...overrides,
  };
  return { api, saveProject, getProject };
}

function frameAt(project: Project | null, nodeId: string): FrameNode {
  const page = project?.pages[0];
  if (!page) throw new Error("No page");
  const node = findNode(page.root, nodeId);
  if (node?.type !== "frame") throw new Error(`Missing frame ${nodeId}`);
  return node;
}

describe("project store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a project and initializes page, breakpoint and history", async () => {
    const { project, pageId, rootId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });

    await store.getState().openProject(project.id);

    const state = store.getState();
    expect(state.loadState).toBe("ready");
    expect(state.error).toBeNull();
    expect(state.conflict).toBeNull();
    expect(state.project?.id).toBe(project.id);
    expect(state.activePageId).toBe(pageId);
    expect(state.activeBreakpointId).toBe(project.breakpoints[0]?.id);
    expect(state.selection).toEqual([]);
    expect(state.history?.past).toHaveLength(0);
    expect(state.dirty).toBe(false);
    expect(state.saving).toBe(false);
    expect(state.lastSavedAt).toBe(1000);
    expect(frameAt(state.project, rootId).id).toBe(rootId);
  });

  it("applies a box update, then undoes and redoes it", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    store.getState().updateBox(childId, { position: { x: 42, y: 24 } });

    expect(frameAt(store.getState().project, childId).responsive.base.position).toMatchObject({
      x: 42,
      y: 24,
    });
    expect(store.getState().dirty).toBe(true);
    expect(store.getState().history?.past).toHaveLength(1);

    store.getState().undo();
    expect(frameAt(store.getState().project, childId).responsive.base.position).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(store.getState().history?.future).toHaveLength(1);

    store.getState().redo();
    expect(frameAt(store.getState().project, childId).responsive.base.position).toMatchObject({
      x: 42,
      y: 24,
    });
    expect(store.getState().history?.future).toHaveLength(0);
  });

  it("writes box updates into the active breakpoint override", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api });
    await store.getState().openProject(project.id);

    store.getState().setActiveBreakpoint("bp_phone");
    store.getState().updateBox(childId, { size: { width: { mode: "fixed", value: 100 } } });

    const frame = frameAt(store.getState().project, childId);
    expect(frame.responsive.base.size.width.value).toBe(200);
    expect(frame.responsive.overrides.bp_phone?.size?.width?.value).toBe(100);
  });

  it("autosaves once after the 600 ms debounce", async () => {
    const { project, childId } = fixture();
    const { api, saveProject } = makeApi(project);
    const store = createProjectStore({ api, debounceMs: 600, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().updateBox(childId, { position: { x: 10 } });
    store.getState().updateBox(childId, { position: { x: 20 } });

    expect(saveProject).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(599);
    expect(saveProject).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(saveProject.mock.calls[0]?.[2]).toBe(1);

    const state = store.getState();
    expect(state.saving).toBe(false);
    expect(state.dirty).toBe(false);
    expect(state.project?.version).toBe(2);
    expect(state.lastSavedAt).toBe(1000);
  });

  it("enters conflict on a 409 and stops autosaving until reload", async () => {
    const { project, childId } = fixture();
    const conflictSave = vi.fn(async (): Promise<Project> => {
      throw new ApiError(
        409,
        { error: "version_conflict", currentVersion: 7 },
        "Project changed on the server.",
      );
    });
    const { api } = makeApi(project, { saveProject: conflictSave });
    const store = createProjectStore({ api, debounceMs: 600, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().updateBox(childId, { position: { x: 5 } });
    await vi.advanceTimersByTimeAsync(600);

    const state = store.getState();
    expect(conflictSave).toHaveBeenCalledTimes(1);
    expect(state.conflict).toEqual({
      expectedVersion: 1,
      serverVersion: 7,
      message: "Project changed on the server.",
    });
    expect(state.saving).toBe(false);
    expect(state.dirty).toBe(true);

    // Further edits do not overwrite the server while the conflict stands.
    store.getState().updateBox(childId, { position: { x: 9 } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(conflictSave).toHaveBeenCalledTimes(1);

    // Reloading clears the conflict.
    await store.getState().openProject(project.id);
    expect(store.getState().conflict).toBeNull();
    expect(store.getState().dirty).toBe(false);
  });

  it("clears selection to the parent when the selected node is deleted", async () => {
    const { project, childId, rootId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    store.getState().deleteSelection();

    expect(store.getState().selection).toEqual([rootId]);
    const root = store.getState().project?.pages[0]?.root;
    expect(root ? findNode(root, childId) : null).toBeNull();
    expect(store.getState().history?.past).toHaveLength(1);
  });

  it("duplicates the selection and selects the copies", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const newIds = store.getState().duplicateSelection();

    expect(newIds).toHaveLength(1);
    expect(newIds[0]).not.toBe(childId);
    expect(store.getState().selection).toEqual(newIds);
    const root = store.getState().project?.pages[0]?.root;
    expect(root?.type === "frame" ? root.children.length : 0).toBe(2);
  });

  it("reports a typed error when the project cannot be loaded", async () => {
    const { project } = fixture();
    const { api } = makeApi(project, {
      getProject: vi.fn(async () => {
        throw new ApiError(404, { error: "not_found" }, "Project not found.");
      }),
    });
    const store = createProjectStore({ api });

    await store.getState().openProject("missing");

    expect(store.getState().loadState).toBe("error");
    expect(store.getState().error).toBe("Project not found.");
    expect(store.getState().project).toBeNull();
  });
});
