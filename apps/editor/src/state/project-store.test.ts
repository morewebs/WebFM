import {
  createFrame,
  createProject,
  createText,
  type FrameNode,
  findNode,
  type Project,
  resolveNodeProps,
  type TextNode,
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

function variantFrame(project: Project, componentId: string, variantId: string): FrameNode {
  const component = project.components.find((candidate) => candidate.id === componentId);
  const variant = component?.variants.find((candidate) => candidate.id === variantId);
  if (!variant) throw new Error(`Missing variant ${variantId}`);
  return variant.root;
}

function instanceNode(project: Project | null, nodeId: string) {
  const page = project?.pages[0];
  const node = page ? findNode(page.root, nodeId) : null;
  if (node?.type !== "componentInstance") throw new Error(`Missing instance ${nodeId}`);
  return node;
}

function textNode(project: Project | null, nodeId: string): TextNode {
  const page = project?.pages[0];
  const node = page ? findNode(page.root, nodeId) : null;
  if (node?.type !== "text") throw new Error(`Missing text node ${nodeId}`);
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

  it("updates two sibling positions in one history entry and undoes both", async () => {
    const { project, childId } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    page.root.children.push(
      createFrame({
        id: "node_badge",
        name: "Badge",
        props: {
          position: { x: 40, y: 50 },
          size: { width: { mode: "fixed", value: 80 }, height: { mode: "fixed", value: 24 } },
        },
      }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().setNodePositions(
      [
        { nodeId: childId, x: 10, y: 20 },
        { nodeId: "node_badge", x: 30, y: 40 },
      ],
      "Align left",
    );

    expect(frameAt(store.getState().project, childId).responsive.base.position).toMatchObject({
      x: 10,
      y: 20,
    });
    expect(frameAt(store.getState().project, "node_badge").responsive.base.position).toMatchObject({
      x: 30,
      y: 40,
    });
    expect(store.getState().history?.past).toHaveLength(1);
    expect(store.getState().history?.past[0]?.label).toBe("Align left");

    store.getState().undo();
    expect(frameAt(store.getState().project, childId).responsive.base.position).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(frameAt(store.getState().project, "node_badge").responsive.base.position).toMatchObject({
      x: 40,
      y: 50,
    });
  });

  it("sets positions in the component variant target", async () => {
    const { project, childId } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    const card = findNode(page.root, childId);
    if (card?.type !== "frame") throw new Error("Fixture card is not a frame");
    card.children.push(
      createFrame({ id: "node_a", name: "A" }),
      createFrame({ id: "node_b", name: "B" }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card");
    if (!created) throw new Error("Component was not created");

    // Creating a component clones the subtree with fresh ids.
    const initialRoot = variantFrame(
      store.getState().project!,
      created.componentId,
      created.variantId,
    );
    const nodeA = findNode(initialRoot, "node_a") ?? initialRoot.children[0];
    const nodeB = findNode(initialRoot, "node_b") ?? initialRoot.children[1];
    if (!nodeA || !nodeB) throw new Error("Component children missing");

    store.getState().setNodePositions(
      [
        { nodeId: nodeA.id, x: 5, y: 6 },
        { nodeId: nodeB.id, x: 7, y: 8 },
      ],
      "Align top",
    );

    let root = variantFrame(store.getState().project!, created.componentId, created.variantId);
    expect(findNode(root, nodeA.id)?.responsive.base.position).toMatchObject({ x: 5, y: 6 });
    expect(findNode(root, nodeB.id)?.responsive.base.position).toMatchObject({ x: 7, y: 8 });
    // The page instance keeps its own placement.
    expect(
      instanceNode(store.getState().project, created.instanceId).responsive.base.position,
    ).toMatchObject({ x: 0, y: 0 });

    store.getState().undo();
    root = variantFrame(store.getState().project!, created.componentId, created.variantId);
    expect(findNode(root, nodeA.id)?.responsive.base.position).toMatchObject({ x: 0, y: 0 });
    expect(findNode(root, nodeB.id)?.responsive.base.position).toMatchObject({ x: 0, y: 0 });
  });

  it("renames an auto-named text node when its content changes", async () => {
    const { project } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    page.root.children.push(createText({ id: "node_hello", content: "Hello" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().updateText("node_hello", { text: { content: "Goodbye" } });

    const node = textNode(store.getState().project, "node_hello");
    expect(node.responsive.base.text.content).toBe("Goodbye");
    expect(node.name).toBe("Goodbye");
    // The content change and the rename are one history entry.
    expect(store.getState().history?.past).toHaveLength(1);

    store.getState().undo();
    const restored = textNode(store.getState().project, "node_hello");
    expect(restored.responsive.base.text.content).toBe("Hello");
    expect(restored.name).toBe("Hello");
  });

  it("keeps a manually renamed text node's name", async () => {
    const { project } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    page.root.children.push(
      createText({ id: "node_hero", name: "Hero heading", content: "Hello" }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().updateText("node_hero", { text: { content: "New words" } });

    const node = textNode(store.getState().project, "node_hero");
    expect(node.responsive.base.text.content).toBe("New words");
    expect(node.name).toBe("Hero heading");
  });

  it("does not rename text nodes on typography-only updates", async () => {
    const { project } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    page.root.children.push(createText({ id: "node_style", content: "Hello" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().updateText("node_style", { text: { fontSize: 32 } });

    const node = textNode(store.getState().project, "node_style");
    expect(node.responsive.base.text.fontSize).toBe(32);
    expect(node.name).toBe("Hello");
  });

  it("truncates long content and falls back to Text for empty content", async () => {
    const { project } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    page.root.children.push(createText({ id: "node_long", content: "Short" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().updateText("node_long", {
      text: { content: "A very long heading that exceeds twenty-four characters" },
    });
    expect(textNode(store.getState().project, "node_long").name).toBe("A very long heading that");

    const blankId = store.getState().insertNode(createText({ id: "node_blank", content: "Short" }));
    if (!blankId) throw new Error("Blank text node was not inserted");
    store.getState().updateText(blankId, { text: { content: "   " } });
    expect(textNode(store.getState().project, blankId).name).toBe("Text");
  });

  it("removes a node by id and selects its parent", async () => {
    const { project, rootId } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    page.root.children.push(createText({ id: "node_blank", content: "" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().removeNodeById("node_blank");

    const saved = store.getState().project;
    expect(saved).not.toBeNull();
    expect(findNode(saved!.pages[0]!.root, "node_blank")).toBeNull();
    expect(store.getState().selection).toEqual([rootId]);
  });

  it("copies and pastes layers with fresh ids, and selects all", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().selectAll();
    expect(store.getState().selection).toEqual([childId]);

    store.getState().select(childId);
    expect(store.getState().copySelection()).toBe(1);

    const pasted = store.getState().pasteClipboard();
    expect(pasted).toHaveLength(1);
    expect(pasted[0]).not.toBe(childId);
    const saved = store.getState().project;
    expect(saved).not.toBeNull();
    const root = saved!.pages[0]!.root as FrameNode;
    // The selected Card is a container, so the paste lands inside it.
    const card = findNode(root, childId) as FrameNode;
    expect(card.children.map((child) => child.id)).toEqual(pasted);
    const clone = findNode(root, pasted[0]!);
    expect(clone?.type).toBe("frame");
    expect(clone?.name).toBe("Card");
    expect(store.getState().selection).toEqual(pasted);

    // The pasted frame is selected, so the next paste goes inside it.
    const second = store.getState().pasteClipboard();
    expect(second[0]).not.toBe(pasted[0]);
    const latestRoot = store.getState().project!.pages[0]!.root as FrameNode;
    expect(latestRoot.children).toHaveLength(1);
    const pastedFrame = findNode(latestRoot, pasted[0]!) as FrameNode;
    expect(pastedFrame.children.map((child) => child.id)).toEqual(second);
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

  it("adds a breakpoint, makes it active and gives the page root its width", async () => {
    const { project, rootId, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);
    store.getState().select(childId);

    const breakpointId = store.getState().addBreakpoint("Watch", 320);

    expect(breakpointId).not.toBeNull();
    const state = store.getState();
    expect(state.activeBreakpointId).toBe(breakpointId);
    expect(
      state.project?.breakpoints.find((breakpoint) => breakpoint.id === breakpointId),
    ).toMatchObject({ name: "Watch", width: 320 });
    expect(frameAt(state.project, rootId).responsive.overrides[breakpointId!]?.size?.width).toEqual(
      { mode: "fixed", value: 320 },
    );
    // Breakpoints do not change nodes, so the selection survives.
    expect(state.selection).toEqual([childId]);
    expect(state.dirty).toBe(true);
    expect(state.history?.past).toHaveLength(1);
  });

  it("returns null and leaves state alone when a breakpoint is invalid", async () => {
    const { project } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);
    const before = store.getState().project;
    const activeBefore = store.getState().activeBreakpointId;

    const breakpointId = store.getState().addBreakpoint("Desktop", 500);

    expect(breakpointId).toBeNull();
    const state = store.getState();
    expect(state.project?.breakpoints).toEqual(before?.breakpoints);
    expect(state.activeBreakpointId).toBe(activeBefore);
    expect(state.error).toMatch(/already exists/);
    expect(state.history?.past).toHaveLength(0);
    expect(state.dirty).toBe(false);
  });

  it("falls back to Desktop when the active breakpoint is removed", async () => {
    const { project, rootId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const breakpointId = store.getState().addBreakpoint("Watch", 320)!;
    expect(store.getState().activeBreakpointId).toBe(breakpointId);

    store.getState().removeBreakpoint(breakpointId);

    const state = store.getState();
    expect(state.activeBreakpointId).toBe(project.breakpoints[0]?.id);
    expect(state.project?.breakpoints.some((breakpoint) => breakpoint.id === breakpointId)).toBe(
      false,
    );
    expect(frameAt(state.project, rootId).responsive.overrides[breakpointId]).toBeUndefined();
  });

  it("keeps the state unchanged when the primary breakpoint cannot be removed", async () => {
    const { project } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);
    const before = store.getState().project;
    const primaryId = project.breakpoints[0]!.id;

    store.getState().removeBreakpoint(primaryId);

    const state = store.getState();
    expect(state.project?.breakpoints).toEqual(before?.breakpoints);
    expect(state.activeBreakpointId).toBe(primaryId);
    expect(state.project?.breakpoints.some((breakpoint) => breakpoint.id === primaryId)).toBe(true);
    expect(state.error).toMatch(/primary/);
    expect(state.history?.past).toHaveLength(0);
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

  it("creates a component from the selected frame and enters its edit mode", async () => {
    const { project, childId } = fixture();
    const { api, saveProject } = makeApi(project);
    const store = createProjectStore({ api, debounceMs: 600, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card");

    expect(created).not.toBeNull();
    const ids = created!;
    const state = store.getState();
    const page = state.project?.pages[0];
    expect(page ? findNode(page.root, childId) : undefined).toBeNull();
    const instance = instanceNode(state.project, ids.instanceId);
    expect(instance.componentId).toBe(ids.componentId);

    const component = state.project?.components.find(
      (candidate) => candidate.id === ids.componentId,
    );
    expect(component?.name).toBe("Card");
    expect(component?.variants).toHaveLength(1);
    expect(component?.variants[0]?.id).toBe(ids.variantId);
    expect(state.editingComponent).toEqual({
      componentId: ids.componentId,
      variantId: ids.variantId,
      instanceId: ids.instanceId,
    });
    expect(state.selection).toEqual([]);
    expect(state.dirty).toBe(true);

    expect(saveProject).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(saveProject).toHaveBeenCalledTimes(1);
  });

  it("edits the variant root in component mode, undoes it, and exits to the instance", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card")!;
    const variantRootId = variantFrame(
      store.getState().project!,
      created.componentId,
      created.variantId,
    ).id;

    store.getState().updateBox(variantRootId, { position: { x: 12, y: 8 } });

    let current = store.getState().project!;
    expect(
      variantFrame(current, created.componentId, created.variantId).responsive.base.position,
    ).toMatchObject({ x: 12, y: 8 });
    // The page instance keeps its own placement; the update did not hit the page.
    expect(instanceNode(current, created.instanceId).responsive.base.position).toMatchObject({
      x: 0,
      y: 0,
    });

    store.getState().undo();
    current = store.getState().project!;
    expect(
      variantFrame(current, created.componentId, created.variantId).responsive.base.position,
    ).toMatchObject({ x: 0, y: 0 });

    store.getState().exitComponent();
    expect(store.getState().editingComponent).toBeNull();
    expect(store.getState().selection).toEqual([created.instanceId]);
  });

  it("adds a variant, inserts an instance and changes that instance's variant", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card")!;
    const variantId = store.getState().addComponentVariant();

    expect(variantId).not.toBeNull();
    expect(store.getState().editingComponent?.variantId).toBe(variantId);
    expect(store.getState().selection).toEqual([]);
    const component = store
      .getState()
      .project?.components.find((candidate) => candidate.id === created.componentId);
    expect(component?.variants).toHaveLength(2);
    expect(component?.variants.find((variant) => variant.id === variantId)?.name).toBe("Variant 2");

    store.getState().exitComponent();
    const instanceId = store.getState().insertComponentInstance(created.componentId);

    expect(instanceId).not.toBeNull();
    expect(store.getState().selection).toEqual([instanceId]);
    expect(instanceNode(store.getState().project, instanceId!).variantId).toBe(created.variantId);

    store.getState().setInstanceVariant(instanceId!, variantId!);
    expect(instanceNode(store.getState().project, instanceId!).variantId).toBe(variantId);
  });

  it("leaves component mode when the active page changes and resets on open", async () => {
    const { project, pageId, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card")!;

    store.getState().enterComponent(created.componentId, created.variantId, created.instanceId);
    expect(store.getState().editingComponent).not.toBeNull();

    store.getState().setActivePage(pageId);
    expect(store.getState().editingComponent).toBeNull();

    store.getState().enterComponent(created.componentId);
    expect(store.getState().editingComponent).not.toBeNull();

    await store.getState().openProject(project.id);
    expect(store.getState().editingComponent).toBeNull();
    expect(store.getState().selection).toEqual([]);
  });

  it("keeps page-mode insertion, updates and deletion on the page", async () => {
    const { project, rootId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const inserted = store.getState().insertNode(
      createFrame({
        id: "node_banner",
        name: "Banner",
        props: { position: { x: 1, y: 2 } },
      }),
    );
    expect(inserted).toBe("node_banner");
    expect(store.getState().selection).toEqual(["node_banner"]);
    expect(frameAt(store.getState().project, rootId).children).toHaveLength(2);

    store.getState().updateBox("node_banner", { position: { x: 5, y: 6 } });
    expect(frameAt(store.getState().project, "node_banner").responsive.base.position).toMatchObject(
      { x: 5, y: 6 },
    );

    store.getState().select("node_banner");
    store.getState().deleteSelection();
    const root = store.getState().project?.pages[0]?.root;
    expect(root ? findNode(root, "node_banner") : null).toBeNull();
    expect(store.getState().selection).toEqual([rootId]);
  });

  it("wraps two siblings into one frame in one history entry and undoes it", async () => {
    const { project, childId, rootId } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    page.root.children.push(
      createFrame({
        id: "node_badge",
        name: "Badge",
        props: {
          position: { x: 40, y: 50 },
          size: { width: { mode: "fixed", value: 80 }, height: { mode: "fixed", value: 24 } },
        },
      }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    store.getState().select("node_badge", true);
    const frameId = store
      .getState()
      .wrapSelection(
        "frame",
        { x: 0, y: 0, width: 200, height: 120 },
        { [childId]: { x: 0, y: 0 }, node_badge: { x: 40, y: 50 } },
      );

    expect(frameId).not.toBeNull();
    const state = store.getState();
    expect(frameAt(state.project, rootId).children.map((node) => node.id)).toEqual([frameId]);
    const frame = frameAt(state.project, frameId!);
    expect(frame.name).toBe("Frame");
    expect(frame.responsive.base.size.width).toEqual({ mode: "fixed", value: 200 });
    expect(frame.children.map((node) => node.id)).toEqual([childId, "node_badge"]);
    expect(frameAt(state.project, childId).responsive.base.position).toMatchObject({ x: 0, y: 0 });
    expect(frameAt(state.project, "node_badge").responsive.base.position).toMatchObject({
      x: 40,
      y: 50,
    });
    expect(state.selection).toEqual([frameId]);
    expect(state.history?.past).toHaveLength(1);
    expect(state.history?.past[0]?.label).toBe("Wrap in frame");

    store.getState().undo();
    const undone = store.getState();
    expect(frameAt(undone.project, rootId).children.map((node) => node.id)).toEqual([
      childId,
      "node_badge",
    ]);
    expect(frameAt(undone.project, childId).responsive.base.position).toMatchObject({ x: 0, y: 0 });
    expect(frameAt(undone.project, "node_badge").responsive.base.position).toMatchObject({
      x: 40,
      y: 50,
    });
  });

  it("unwraps the selected frame and restores child positions", async () => {
    const { project, childId, rootId } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    page.root.children.push(
      createFrame({
        id: "node_badge",
        name: "Badge",
        props: {
          position: { x: 40, y: 50 },
          size: { width: { mode: "fixed", value: 80 }, height: { mode: "fixed", value: 24 } },
        },
      }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().selectMany([childId, "node_badge"]);
    const frameId = store
      .getState()
      .wrapSelection(
        "stack",
        { x: 0, y: 0, width: 200, height: 120 },
        { [childId]: { x: 0, y: 0 }, node_badge: { x: 40, y: 50 } },
      )!;

    const moved = store.getState().unwrapSelection(frameId);
    expect(moved).toEqual([childId, "node_badge"]);
    const state = store.getState();
    expect(frameAt(state.project, rootId).children.map((node) => node.id)).toEqual([
      childId,
      "node_badge",
    ]);
    expect(frameAt(state.project, childId).responsive.base.position).toMatchObject({ x: 0, y: 0 });
    expect(frameAt(state.project, "node_badge").responsive.base.position).toMatchObject({
      x: 40,
      y: 50,
    });
    expect(state.selection).toEqual([childId, "node_badge"]);
    expect(state.history?.past).toHaveLength(2);
    expect(state.history?.past[1]?.label).toBe("Remove frame");
  });

  it("wraps and unwraps in the component variant target", async () => {
    const { project, childId } = fixture();
    const page = project.pages[0];
    if (!page) throw new Error("Fixture project has no page");
    const card = findNode(page.root, childId);
    if (card?.type !== "frame") throw new Error("Fixture card is not a frame");
    card.children.push(
      createFrame({ id: "node_a", name: "A" }),
      createFrame({ id: "node_b", name: "B" }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card");
    if (!created) throw new Error("Component was not created");

    const variant = variantFrame(store.getState().project!, created.componentId, created.variantId);
    const nodeA = variant.children[0];
    const nodeB = variant.children[1];
    if (!nodeA || !nodeB) throw new Error("Variant children missing");

    store.getState().selectMany([nodeA.id, nodeB.id]);
    const frameId = store
      .getState()
      .wrapSelection(
        "frame",
        { x: 0, y: 0, width: 300, height: 200 },
        { [nodeA.id]: { x: 1, y: 2 }, [nodeB.id]: { x: 3, y: 4 } },
      );
    expect(frameId).not.toBeNull();

    let root = variantFrame(store.getState().project!, created.componentId, created.variantId);
    expect(root.children.map((node) => node.id)).toEqual([frameId]);
    expect(findNode(root, nodeA.id)?.responsive.base.position).toMatchObject({ x: 1, y: 2 });

    const moved = store.getState().unwrapSelection(frameId!);
    expect(moved).toEqual([nodeA.id, nodeB.id]);
    root = variantFrame(store.getState().project!, created.componentId, created.variantId);
    expect(root.children.map((node) => node.id)).toEqual([nodeA.id, nodeB.id]);
  });

  it("leaves the document alone when the wrap target is the scene root", async () => {
    const { project, rootId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(rootId);
    const frameId = store
      .getState()
      .wrapSelection("frame", { x: 0, y: 0, width: 200, height: 120 }, {});
    expect(frameId).toBeNull();
    expect(store.getState().history?.past).toHaveLength(0);
    expect(store.getState().selection).toEqual([rootId]);
  });

  it("adds, updates and removes page guides with one history entry each", async () => {
    const { project } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const guideId = store.getState().addGuide("x", 120);
    expect(guideId).toMatch(/^guide_/);
    let state = store.getState();
    expect(state.project?.pages[0]?.guides).toEqual([{ id: guideId, axis: "x", position: 120 }]);
    expect(state.history?.past).toHaveLength(1);
    expect(state.history?.past[0]?.label).toBe("Add guide");
    expect(state.selection).toEqual([]);

    store.getState().updateGuide(guideId!, 240);
    state = store.getState();
    expect(state.project?.pages[0]?.guides?.[0]?.position).toBe(240);
    expect(state.history?.past).toHaveLength(2);
    expect(state.history?.past[1]?.label).toBe("Update guide");

    store.getState().undo();
    expect(store.getState().project?.pages[0]?.guides?.[0]?.position).toBe(120);
    store.getState().redo();
    expect(store.getState().project?.pages[0]?.guides?.[0]?.position).toBe(240);

    store.getState().removeGuide(guideId!);
    state = store.getState();
    expect(state.project?.pages[0]?.guides).toEqual([]);
    expect(state.history?.past).toHaveLength(3);
    expect(state.history?.past[2]?.label).toBe("Remove guide");
  });

  it("targets the active page for guides while editing a component", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card");
    if (!created) throw new Error("Component was not created");
    store.getState().enterComponent(created.componentId, created.variantId, created.instanceId);
    expect(store.getState().editingComponent).not.toBeNull();

    const guideId = store.getState().addGuide("y", 42);
    expect(guideId).not.toBeNull();
    expect(store.getState().project?.pages[0]?.guides?.[0]).toMatchObject({
      id: guideId,
      axis: "y",
      position: 42,
    });

    store.getState().updateGuide(guideId!, 84);
    expect(store.getState().project?.pages[0]?.guides?.[0]?.position).toBe(84);
    store.getState().removeGuide(guideId!);
    expect(store.getState().project?.pages[0]?.guides).toEqual([]);
  });
});

describe("color styles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a style from the selected fill or text color with unique names", async () => {
    const { project, childId } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(
      createText({
        id: "node_label",
        content: "Label",
        props: { text: { color: "#abcdef" } },
      }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const first = store.getState().createColorStyle();
    expect(first).not.toBeNull();
    expect(store.getState().project?.colorStyles).toHaveLength(1);
    expect(store.getState().project?.colorStyles[0]).toMatchObject({
      id: first,
      name: "Color 1",
      color: "#ffffff",
      opacity: 1,
    });
    expect(store.getState().history?.past).toHaveLength(1);
    // The layer the style was created from is linked in the same entry.
    const linkedFill = frameAt(store.getState().project, childId).responsive.base.style.fill;
    if (linkedFill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(linkedFill).toMatchObject({ color: "#ffffff", opacity: 1, styleId: first });

    store.getState().select("node_label");
    const second = store.getState().createColorStyle();
    expect(second).not.toBeNull();
    expect(store.getState().project?.colorStyles[1]).toMatchObject({
      name: "Color 2",
      color: "#abcdef",
      opacity: 1,
    });
    expect(store.getState().history?.past).toHaveLength(2);
    const linkedText = textNode(store.getState().project, "node_label");
    expect(linkedText.responsive.base.text.color).toBe("#abcdef");
    expect(linkedText.responsive.base.colorStyleId).toBe(second);
  });

  it("falls back to the default color when nothing usable is selected", async () => {
    const { project } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().createColorStyle();
    expect(store.getState().project?.colorStyles[0]).toMatchObject({
      color: "#0099ff",
      opacity: 1,
    });
  });

  it("applies a style to a frame and text in one entry, then undoes it", async () => {
    const { project, childId } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(createText({ id: "node_label", content: "Label" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createColorStyle(false);
    if (!styleId) throw new Error("Expected a color style");

    store.getState().selectMany([childId, "node_label"]);
    expect(store.getState().applyColorStyle(styleId)).toBe(true);

    const fill = frameAt(store.getState().project, childId).responsive.base.style.fill;
    if (fill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(fill).toMatchObject({ color: "#0099ff", opacity: 1, styleId });

    const label = textNode(store.getState().project, "node_label");
    expect(label.responsive.base.text.color).toBe("#0099ff");
    expect(label.responsive.base.colorStyleId).toBe(styleId);
    expect(store.getState().history?.past).toHaveLength(2);

    store.getState().undo();

    const undoneFill = frameAt(store.getState().project, childId).responsive.base.style.fill;
    if (undoneFill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(undoneFill.color).toBe("#ffffff");
    expect(undoneFill.styleId).toBeUndefined();
    const undoneLabel = textNode(store.getState().project, "node_label");
    expect(undoneLabel.responsive.base.colorStyleId).toBeUndefined();
    expect(store.getState().history?.past).toHaveLength(1);
  });

  it("edits a style, propagates to linked usages, and undoes the propagation", async () => {
    const { project, childId } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(createText({ id: "node_label", content: "Label" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createColorStyle(false);
    if (!styleId) throw new Error("Expected a color style");
    store.getState().selectMany([childId, "node_label"]);
    store.getState().applyColorStyle(styleId);

    expect(
      store.getState().updateColorStyle(styleId, {
        name: "Accent",
        color: "#ff0000",
        opacity: 0.4,
      }),
    ).toBe(true);

    expect(store.getState().project?.colorStyles[0]).toMatchObject({
      name: "Accent",
      color: "#ff0000",
      opacity: 0.4,
    });
    const fill = frameAt(store.getState().project, childId).responsive.base.style.fill;
    if (fill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(fill).toMatchObject({ color: "#ff0000", opacity: 0.4, styleId });
    const label = textNode(store.getState().project, "node_label");
    expect(label.responsive.base.text.color).toBe("#ff0000");

    store.getState().undo();

    expect(store.getState().project?.colorStyles[0]).toMatchObject({
      name: "Color 1",
      color: "#0099ff",
      opacity: 1,
    });
    const undoneFill = frameAt(store.getState().project, childId).responsive.base.style.fill;
    if (undoneFill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(undoneFill).toMatchObject({ color: "#0099ff", opacity: 1 });
    expect(textNode(store.getState().project, "node_label").responsive.base.text.color).toBe(
      "#0099ff",
    );
  });

  it("rejects empty or duplicate names and keeps the previous edit", async () => {
    const { project } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const first = store.getState().createColorStyle(false);
    const second = store.getState().createColorStyle(false);
    if (!first || !second) throw new Error("Expected two color styles");

    expect(store.getState().updateColorStyle(first, { name: "  " })).toBe(false);
    expect(store.getState().error).toMatch(/cannot be empty/);
    expect(store.getState().updateColorStyle(second, { name: "Color 1" })).toBe(false);
    expect(store.getState().error).toMatch(/already exists/i);
    expect(store.getState().project?.colorStyles[1]?.name).toBe("Color 2");
  });

  it("removes a style, detaches usages and keeps their color", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createColorStyle(false);
    if (!styleId) throw new Error("Expected a color style");
    store.getState().select(childId);
    store.getState().applyColorStyle(styleId);

    store.getState().removeColorStyle(styleId);

    expect(store.getState().project?.colorStyles).toHaveLength(0);
    const fill = frameAt(store.getState().project, childId).responsive.base.style.fill;
    if (fill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(fill.color).toBe("#0099ff");
    expect(fill.styleId).toBeNull();
  });

  it("reports a clear error when the selection cannot take a color", async () => {
    const { project, rootId } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(
      createFrame({
        id: "node_picture",
        name: "Image",
        props: { style: { fill: null } },
      }),
    );
    const picture = page.root.children.find((node) => node.id === "node_picture");
    if (!picture) throw new Error("Missing fixture node");
    // Replace the frame with an image so the store action rejects it.
    const imageBlock = picture as unknown as { type: "frame" | "image" };
    imageBlock.type = "image";

    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createColorStyle(false);
    if (!styleId) throw new Error("Expected a color style");
    store.getState().select("node_picture");
    expect(store.getState().applyColorStyle(styleId)).toBe(false);
    expect(store.getState().error).toMatch(/Select a frame or text layer/);

    store.getState().select(rootId);
    expect(store.getState().applyColorStyle(styleId)).toBe(true);
  });

  it("creates and applies color styles on a selected component instance", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card");
    if (!created) throw new Error("Component was not created");
    store.getState().exitComponent();
    store.getState().select(created.instanceId);

    // The instance resolves to the master's #ffffff solid fill, and creating a
    // style links that instance through an override.
    const styleId = store.getState().createColorStyle();
    if (!styleId) throw new Error("Expected a color style");
    const linked = instanceNode(store.getState().project, created.instanceId);
    expect(linked.styleOverrides?.base.fill).toMatchObject({
      type: "solid",
      color: "#ffffff",
      styleId,
    });

    // A second style can be applied to the instance selection directly.
    const second = store.getState().createColorStyle(false);
    if (!second) throw new Error("Expected a second color style");
    expect(store.getState().applyColorStyle(second)).toBe(true);
    const applied = instanceNode(store.getState().project, created.instanceId);
    expect(applied.styleOverrides?.base.fill).toMatchObject({
      color: "#0099ff",
      styleId: second,
    });

    store.getState().undo();
    const undone = instanceNode(store.getState().project, created.instanceId);
    expect(undone.styleOverrides?.base.fill).toMatchObject({ styleId });
  });

  it("does not add history entries for an unchanged apply or style edit", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createColorStyle(false);
    if (!styleId) throw new Error("Expected a color style");
    store.getState().select(childId);
    expect(store.getState().applyColorStyle(styleId)).toBe(true);
    expect(store.getState().history?.past).toHaveLength(2);
    const applied = JSON.stringify(store.getState().project);

    expect(store.getState().applyColorStyle(styleId)).toBe(true);
    expect(store.getState().history?.past).toHaveLength(2);
    expect(JSON.stringify(store.getState().project)).toBe(applied);

    const style = store.getState().project?.colorStyles[0];
    if (!style) throw new Error("Expected the color style");
    expect(
      store.getState().updateColorStyle(styleId, {
        name: style.name,
        color: style.color,
        opacity: style.opacity,
      }),
    ).toBe(true);
    expect(store.getState().history?.past).toHaveLength(2);
    expect(JSON.stringify(store.getState().project)).toBe(applied);
  });
});

describe("text styles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a style from the selected text layer, links it and uses unique names", async () => {
    const { project } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(
      createText({
        id: "node_title",
        content: "Title",
        props: {
          text: { fontFamily: "Poppins", fontSize: 30, fontWeight: 700, color: "#abcdef" },
          colorStyleId: "color_old",
        },
      }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select("node_title");
    const first = store.getState().createTextStyle();
    expect(first).not.toBeNull();
    expect(store.getState().project?.textStyles).toHaveLength(1);
    expect(store.getState().project?.textStyles[0]).toMatchObject({
      id: first,
      name: "Text style 1",
      values: { fontFamily: "Poppins", fontSize: 30, fontWeight: 700, color: "#abcdef" },
    });
    const linked = textNode(store.getState().project, "node_title");
    expect(linked.responsive.base.textStyleId).toBe(first);
    expect(linked.responsive.base.colorStyleId).toBeNull();
    expect(linked.responsive.base.text).toMatchObject({ fontFamily: "Poppins", fontSize: 30 });
    expect(store.getState().history?.past).toHaveLength(1);

    store.getState().clearSelection();
    const second = store.getState().createTextStyle();
    expect(store.getState().project?.textStyles[1]).toMatchObject({
      id: second,
      name: "Text style 2",
      values: { fontFamily: "Inter", fontSize: 16 },
    });
    expect(store.getState().history?.past).toHaveLength(2);
  });

  it("applies to every selected text layer, keeps the text style through a color style, and undoes", async () => {
    const { project } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(
      createText({ id: "node_one", content: "One" }),
      createText({ id: "node_two", content: "Two" }),
    );
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createTextStyle(false);
    if (!styleId) throw new Error("Expected a text style");
    store.getState().updateTextStyle(styleId, {
      values: { fontFamily: "Poppins", fontSize: 28, color: "#ff0000" },
    });
    const beforeApply = store.getState().history?.past.length ?? 0;

    store.getState().selectMany(["node_one", "node_two"]);
    expect(store.getState().applyTextStyle(styleId)).toBe(true);

    for (const id of ["node_one", "node_two"]) {
      const text = textNode(store.getState().project, id);
      expect(text.responsive.base.textStyleId).toBe(styleId);
      expect(text.responsive.base.text).toMatchObject({
        fontFamily: "Poppins",
        fontSize: 28,
        color: "#ff0000",
      });
    }
    expect(store.getState().history?.past).toHaveLength(beforeApply + 1);

    // Applying a color style afterwards keeps the text-style link.
    const colorId = store.getState().createColorStyle(false);
    if (!colorId) throw new Error("Expected a color style");
    store.getState().select("node_one");
    expect(store.getState().applyColorStyle(colorId)).toBe(true);
    const recolored = textNode(store.getState().project, "node_one");
    expect(recolored.responsive.base.textStyleId).toBe(styleId);
    expect(recolored.responsive.base.colorStyleId).toBe(colorId);

    store.getState().undo();
    store.getState().undo();
    const undone = textNode(store.getState().project, "node_one");
    expect(undone.responsive.base.textStyleId).toBe(styleId);
    expect(undone.responsive.base.colorStyleId).toBeNull();
  });

  it("rejects non-text selections and skips history for an unchanged apply", async () => {
    const { project, childId } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(createText({ id: "node_label", content: "Label" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createTextStyle(false);
    if (!styleId) throw new Error("Expected a text style");

    store.getState().select(childId);
    expect(store.getState().applyTextStyle(styleId)).toBe(false);
    expect(store.getState().error).toMatch(/Select text layers/);

    store.getState().select("node_label");
    expect(store.getState().applyTextStyle(styleId)).toBe(true);
    const appliedProject = JSON.stringify(store.getState().project);
    const appliedHistory = store.getState().history?.past.length;

    // Re-applying the same style and values adds no undo step.
    expect(store.getState().applyTextStyle(styleId)).toBe(true);
    expect(store.getState().history?.past.length).toBe(appliedHistory);
    expect(JSON.stringify(store.getState().project)).toBe(appliedProject);

    const style = store.getState().project?.textStyles[0];
    if (!style) throw new Error("Expected the text style");
    expect(
      store.getState().updateTextStyle(styleId, {
        name: style.name,
        values: { ...style.values },
      }),
    ).toBe(true);
    expect(store.getState().history?.past.length).toBe(appliedHistory);
    expect(JSON.stringify(store.getState().project)).toBe(appliedProject);
  });

  it("updates a style, propagates typography, and undoes the propagation", async () => {
    const { project } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(createText({ id: "node_label", content: "Label" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createTextStyle(false);
    if (!styleId) throw new Error("Expected a text style");
    store.getState().select("node_label");
    store.getState().applyTextStyle(styleId);

    expect(
      store.getState().updateTextStyle(styleId, {
        name: "Display",
        values: { fontSize: 42, color: "#123456", italic: true },
      }),
    ).toBe(true);

    expect(store.getState().project?.textStyles[0]).toMatchObject({
      name: "Display",
      values: { fontSize: 42, color: "#123456", italic: true },
    });
    const label = textNode(store.getState().project, "node_label");
    expect(label.responsive.base.text).toMatchObject({
      fontSize: 42,
      color: "#123456",
      italic: true,
    });

    store.getState().undo();

    expect(store.getState().project?.textStyles[0]).toMatchObject({
      name: "Text style 1",
      values: { fontSize: 16, color: "#000000", italic: false },
    });
    const undone = textNode(store.getState().project, "node_label");
    expect(undone.responsive.base.text).toMatchObject({
      fontSize: 16,
      color: "#000000",
      italic: false,
    });
    expect(undone.responsive.base.textStyleId).toBe(styleId);
  });

  it("detaches on manual typography and color edits", async () => {
    const { project } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(createText({ id: "node_label", content: "Label" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createTextStyle(false);
    if (!styleId) throw new Error("Expected a text style");
    store.getState().select("node_label");
    store.getState().applyTextStyle(styleId);

    store.getState().updateText("node_label", { text: { fontSize: 48 } });
    const typed = textNode(store.getState().project, "node_label");
    expect(typed.responsive.base.textStyleId).toBeNull();
    expect(typed.responsive.base.text.fontSize).toBe(48);

    store.getState().applyTextStyle(styleId);
    store.getState().updateText("node_label", { text: { color: "#00ff00" } });
    const recolored = textNode(store.getState().project, "node_label");
    expect(recolored.responsive.base.textStyleId).toBeNull();
    expect(recolored.responsive.base.colorStyleId).toBeNull();
    expect(recolored.responsive.base.text.color).toBe("#00ff00");
  });

  it("removes a style, detaches usages and keeps their typography", async () => {
    const { project } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(createText({ id: "node_label", content: "Label" }));
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    const styleId = store.getState().createTextStyle(false);
    if (!styleId) throw new Error("Expected a text style");
    store.getState().updateTextStyle(styleId, { values: { fontSize: 36 } });
    store.getState().select("node_label");
    store.getState().applyTextStyle(styleId);

    store.getState().removeTextStyle(styleId);

    expect(store.getState().project?.textStyles).toHaveLength(0);
    const text = textNode(store.getState().project, "node_label");
    expect(text.responsive.base.textStyleId).toBeNull();
    expect(text.responsive.base.text.fontSize).toBe(36);
  });

  it("freezes resolved typography when a manual edit detaches at a smaller breakpoint", async () => {
    const { project } = fixture();
    const page = project.pages[0]!;
    page.root.children.push(createText({ id: "node_label", content: "Label" }));
    const initialFamily = textNode(project, "node_label").responsive.base.text.fontFamily;
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);

    store.getState().select("node_label");
    const styleId = store.getState().createTextStyle();
    if (!styleId) throw new Error("Expected a text style");

    store.getState().setActiveBreakpoint("bp_phone");
    // The Typography controls pass textStyleId: null explicitly on manual edits.
    store.getState().updateText("node_label", { text: { fontSize: 24 }, textStyleId: null });

    const detached = textNode(store.getState().project, "node_label");
    const phoneOverride = detached.responsive.overrides.bp_phone;
    expect(phoneOverride?.textStyleId).toBeNull();
    expect(phoneOverride?.text).toMatchObject({ fontSize: 24, fontFamily: initialFamily });

    // Editing the style afterwards must not leak through the linked base.
    store.getState().updateTextStyle(styleId, { values: { fontFamily: "Poppins" } });
    const projectAfter = store.getState().project!;
    const nodeAfter = textNode(projectAfter, "node_label");
    expect(nodeAfter.responsive.base.text.fontFamily).toBe("Poppins");
    const resolved = resolveNodeProps(nodeAfter, "bp_phone", projectAfter.breakpoints);
    expect(resolved.textStyleId).toBeNull();
    expect(resolved.text.fontFamily).toBe(initialFamily);
    expect(resolved.text.fontSize).toBe(24);
  });
});

describe("instance style overrides", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function instanceFixture() {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);
    store.getState().select(childId);
    const created = store.getState().createComponentFromSelection("Card")!;
    store.getState().exitComponent();
    return { store, instanceId: created.instanceId };
  }

  it("writes one history entry, skips no-ops and undoes/redoes an override", async () => {
    const { store, instanceId } = await instanceFixture();
    const before = store.getState().history?.past.length ?? 0;
    const untouched = JSON.stringify(store.getState().project);

    // The master already resolves to opacity 1, so this is not an override.
    store.getState().updateInstanceStyle(instanceId, { opacity: 1 });
    expect(store.getState().history?.past.length).toBe(before);
    expect(JSON.stringify(store.getState().project)).toBe(untouched);

    store.getState().updateInstanceStyle(instanceId, { opacity: 0.5 });
    expect(store.getState().history?.past.length).toBe(before + 1);
    expect(instanceNode(store.getState().project, instanceId).styleOverrides?.base).toMatchObject({
      opacity: 0.5,
    });

    const applied = JSON.stringify(store.getState().project);
    store.getState().updateInstanceStyle(instanceId, { opacity: 0.5 });
    expect(store.getState().history?.past.length).toBe(before + 1);
    expect(JSON.stringify(store.getState().project)).toBe(applied);

    store.getState().undo();
    expect(instanceNode(store.getState().project, instanceId).styleOverrides).toBeUndefined();
    store.getState().redo();
    expect(instanceNode(store.getState().project, instanceId).styleOverrides?.base).toMatchObject({
      opacity: 0.5,
    });
  });

  it("keeps breakpoint layers independent and resets only the active one", async () => {
    const { store, instanceId } = await instanceFixture();
    store.getState().updateInstanceStyle(instanceId, { opacity: 0.5 });

    store.getState().setActiveBreakpoint("bp_tablet");
    store.getState().updateInstanceStyle(instanceId, { opacity: 0.25 });
    const layered = instanceNode(store.getState().project, instanceId);
    expect(layered.styleOverrides?.overrides.bp_tablet).toMatchObject({ opacity: 0.25 });
    expect(store.getState().history?.past.length).toBe(3);

    store.getState().setActiveBreakpoint("bp_desktop");
    const beforeReset = store.getState().history?.past.length ?? 0;
    store.getState().resetInstanceStyle(instanceId);
    expect(store.getState().history?.past.length).toBe(beforeReset + 1);
    const afterDesktop = instanceNode(store.getState().project, instanceId);
    expect(afterDesktop.styleOverrides?.base).toEqual({});
    expect(afterDesktop.styleOverrides?.overrides.bp_tablet).toMatchObject({ opacity: 0.25 });

    // Resetting an empty breakpoint layer adds no history entry.
    store.getState().resetInstanceStyle(instanceId);
    expect(store.getState().history?.past.length).toBe(beforeReset + 1);

    store.getState().setActiveBreakpoint("bp_tablet");
    store.getState().resetInstanceStyle(instanceId);
    expect(instanceNode(store.getState().project, instanceId).styleOverrides).toBeUndefined();
    store.getState().undo();
    expect(instanceNode(store.getState().project, instanceId).styleOverrides?.overrides.bp_tablet)
      .toMatchObject({ opacity: 0.25 });
  });

  it("ignores style writes on nodes that are not component instances", async () => {
    const { project, childId } = fixture();
    const { api } = makeApi(project);
    const store = createProjectStore({ api, now: () => 1000 });
    await store.getState().openProject(project.id);
    store.getState().select(childId);

    const before = store.getState().history?.past.length ?? 0;
    store.getState().updateInstanceStyle(childId, { opacity: 0.5 });
    store.getState().resetInstanceStyle(childId);
    expect(store.getState().history?.past.length).toBe(before);
  });
});
