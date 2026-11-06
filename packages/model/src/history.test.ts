import type { Draft } from "immer";
import { describe, expect, it } from "vitest";
import { createProject, createText } from "./defaults";
import { applyOperation, canRedo, canUndo, createHistory, redo, undo } from "./history";
import { insertNode, renameProject, setNodeVisible } from "./operations";
import type { Project } from "./types";

function rename(name: string): (draft: Draft<Project>) => void {
  return (draft) => renameProject(draft, name);
}

describe("createHistory", () => {
  it("starts empty with the default limit and accepts a custom one", () => {
    const project = createProject({ name: "Base" });
    const history = createHistory(project);

    expect(history.project).toBe(project);
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(history.limit).toBe(100);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);

    expect(createHistory(project, { limit: 5 }).limit).toBe(5);
    expect(() => createHistory(project, { limit: -1 })).toThrow(/limit/);
  });

  it("returns the same state when undoing or redoing an empty history", () => {
    const history = createHistory(createProject());
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });
});

describe("applyOperation with undo and redo", () => {
  it("round-trips one operation", () => {
    const base = createProject({ name: "Base" });
    const h0 = createHistory(base);
    const h1 = applyOperation(h0, "Rename project", rename("Changed"));

    expect(h1.project.name).toBe("Changed");
    expect(h1.project).not.toBe(base);
    expect(h1.past).toHaveLength(1);
    expect(h1.past[0]!.label).toBe("Rename project");
    expect(h1.past[0]!.patches.length).toBeGreaterThan(0);
    expect(h1.past[0]!.inversePatches.length).toBeGreaterThan(0);
    expect(h1.future).toEqual([]);
    expect(canUndo(h1)).toBe(true);
    expect(canRedo(h1)).toBe(false);

    const undone = undo(h1);
    expect(undone.project.name).toBe("Base");
    expect(undone.past).toEqual([]);
    expect(undone.future).toHaveLength(1);
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);

    const redone = redo(undone);
    expect(redone.project.name).toBe("Changed");
    expect(redone.past).toHaveLength(1);
    expect(redone.future).toEqual([]);
    expect(canRedo(redone)).toBe(false);
  });

  it("walks multiple entries back and forward in order", () => {
    const base = createProject({ name: "Base" });
    let history = createHistory(base);
    history = applyOperation(history, "One", rename("One"));
    history = applyOperation(history, "Two", rename("Two"));
    history = applyOperation(history, "Three", rename("Three"));
    expect(history.past).toHaveLength(3);

    let step = undo(history);
    expect(step.project.name).toBe("Two");
    step = undo(step);
    expect(step.project.name).toBe("One");
    step = undo(step);
    expect(step.project.name).toBe("Base");
    expect(canUndo(step)).toBe(false);

    step = redo(step);
    expect(step.project.name).toBe("One");
    step = redo(step);
    expect(step.project.name).toBe("Two");
    step = redo(step);
    expect(step.project.name).toBe("Three");
    expect(canRedo(step)).toBe(false);
  });

  it("undoes and redoes a structural operation through patches", () => {
    const base = createProject();
    const pageId = base.pages[0]!.id;
    const rootId = base.pages[0]!.root.id;
    let history = createHistory(base);

    history = applyOperation(history, "Insert", (draft) => {
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({ id: "added", content: "Added" }),
      });
    });
    expect(history.project.pages[0]!.root.children).toHaveLength(1);

    history = undo(history);
    expect(history.project.pages[0]!.root.children).toHaveLength(0);

    history = redo(history);
    expect(history.project.pages[0]!.root.children.map((node) => node.id)).toEqual(["added"]);
  });
});

describe("coalescing", () => {
  const base = createProject();
  const pageId = base.pages[0]!.id;
  const rootId = base.pages[0]!.root.id;

  function setVisible(visible: boolean): (draft: Draft<Project>) => void {
    return (draft) => setNodeVisible(draft, { pageId, nodeId: rootId }, visible);
  }

  it("merges consecutive operations that share a coalesce key", () => {
    let history = createHistory(base);
    history = applyOperation(history, "Hide", setVisible(false), {
      coalesceKey: "visibility:root",
    });
    history = applyOperation(history, "Show", setVisible(true), {
      coalesceKey: "visibility:root",
    });

    expect(history.past).toHaveLength(1);
    expect(history.past[0]!.label).toBe("Show");
    expect(history.project.pages[0]!.root.visible).toBe(true);

    const undone = undo(history);
    expect(undone.project.pages[0]!.root.visible).toBe(true);
    expect(undone.past).toHaveLength(0);
    expect(undone.future).toHaveLength(1);
  });

  it("does not merge different keys or a missing key", () => {
    let different = createHistory(base);
    different = applyOperation(different, "Hide", setVisible(false), { coalesceKey: "a" });
    different = applyOperation(different, "Show", setVisible(true), { coalesceKey: "b" });
    expect(different.past).toHaveLength(2);

    let plain = createHistory(base);
    plain = applyOperation(plain, "Hide", setVisible(false));
    plain = applyOperation(plain, "Show", setVisible(true));
    expect(plain.past).toHaveLength(2);
  });

  it("does not coalesce when a redo branch is still pending", () => {
    let history = createHistory(base);
    history = applyOperation(history, "One", rename("One"), { coalesceKey: "k1" });
    history = applyOperation(history, "Two", rename("Two"), { coalesceKey: "k2" });
    history = undo(history);
    expect(history.project.name).toBe("One");
    expect(history.future).toHaveLength(1);

    history = applyOperation(history, "Three", rename("Three"), { coalesceKey: "k1" });
    expect(history.past).toHaveLength(2);
    expect(history.future).toHaveLength(0);
    expect(history.project.name).toBe("Three");
  });
});

describe("limit and branching", () => {
  it("drops the oldest past entries beyond the limit", () => {
    const base = createProject({ name: "Base" });
    let history = createHistory(base, { limit: 2 });
    history = applyOperation(history, "One", rename("One"));
    history = applyOperation(history, "Two", rename("Two"));
    history = applyOperation(history, "Three", rename("Three"));

    expect(history.past).toHaveLength(2);
    expect(history.past.map((entry) => entry.label)).toEqual(["Two", "Three"]);

    let step = undo(history);
    expect(step.project.name).toBe("Two");
    step = undo(step);
    expect(step.project.name).toBe("One");
    expect(canUndo(step)).toBe(false);
  });

  it("clears redo entries when a new operation branches", () => {
    const base = createProject({ name: "Base" });
    let history = createHistory(base);
    history = applyOperation(history, "One", rename("One"));
    history = applyOperation(history, "Two", rename("Two"));
    history = undo(history);
    expect(canRedo(history)).toBe(true);

    history = applyOperation(history, "Branch", rename("Branch"));
    expect(history.project.name).toBe("Branch");
    expect(history.future).toHaveLength(0);
    expect(canRedo(history)).toBe(false);
    expect(history.past.map((entry) => entry.label)).toEqual(["One", "Branch"]);
  });
});
