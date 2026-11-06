import { type Draft, produce } from "immer";
import { describe, expect, it } from "vitest";
import { createFrame, createImage, createProject, createText, resolveNodeProps } from "./defaults";
import {
  addPage,
  duplicateNode,
  insertNode,
  moveNode,
  removeNode,
  removePage,
  renameNode,
  renameProject,
  setNodeLocked,
  setNodeVisible,
  setProjectPublish,
  updateBoxProps,
  updateImageProps,
  updateNode,
  updatePage,
  updateTextProps,
} from "./operations";
import { collectNodes, findNode } from "./tree";
import type { FrameNode, Project, SceneNode } from "./types";

/** Runs a recipe against a draft and returns both the next project and its result. */
function run<T>(
  project: Project,
  recipe: (draft: Draft<Project>) => T,
): { project: Project; result: T } {
  let result: T | undefined;
  const next = produce(project, (draft) => {
    result = recipe(draft);
  });
  return { project: next, result: result as T };
}

function ids(project: Project): { pageId: string; rootId: string } {
  const page = project.pages[0]!;
  return { pageId: page.id, rootId: page.root.id };
}

function getNode(project: Project, nodeId: string): SceneNode {
  const node = findNode(project.pages[0]!.root, nodeId);
  if (!node) throw new Error(`Expected node "${nodeId}" to exist.`);
  return node;
}

function getFrameNode(project: Project, nodeId: string): FrameNode {
  const node = getNode(project, nodeId);
  if (node.type !== "frame") throw new Error(`Expected node "${nodeId}" to be a frame.`);
  return node;
}

function addToRoot(base: Project, nodes: SceneNode[]): Project {
  const { pageId, rootId } = ids(base);
  return run(base, (draft) => {
    for (const node of nodes) {
      insertNode(draft, { pageId, parentId: rootId, node });
    }
  }).project;
}

describe("insertNode", () => {
  it("appends by default and clamps negative and oversized indexes", () => {
    const base = createProject();
    const { pageId, rootId } = ids(base);
    const a = createText({ id: "a", content: "A" });
    const b = createText({ id: "b", content: "B" });
    const c = createText({ id: "c", content: "C" });
    const d = createText({ id: "d", content: "D" });

    const { project } = run(base, (draft) => {
      insertNode(draft, { pageId, parentId: rootId, node: a });
      insertNode(draft, { pageId, parentId: rootId, node: b, index: 0 });
      insertNode(draft, { pageId, parentId: rootId, node: c, index: -5 });
      insertNode(draft, { pageId, parentId: rootId, node: d, index: 99 });
    });

    const children = project.pages[0]!.root.children;
    expect(children.map((node) => node.id)).toEqual(["c", "b", "a", "d"]);
    expect(children[0]!.type).toBe("text");
  });

  it("inserts into a nested frame", () => {
    const base = createProject();
    const { pageId, rootId } = ids(base);
    const card = createFrame({ id: "card", name: "Card" });
    const inside = createText({ id: "inside", content: "Inside" });

    const { project } = run(base, (draft) => {
      insertNode(draft, { pageId, parentId: rootId, node: card });
      insertNode(draft, { pageId, parentId: "card", node: inside });
    });

    const cardNode = getFrameNode(project, "card");
    expect(cardNode.children.map((node) => node.id)).toEqual(["inside"]);
    expect(project.pages[0]!.root.children.map((node) => node.id)).toEqual(["card"]);
  });

  it("throws for a missing page, a missing parent and a non-frame parent", () => {
    const base = createProject();
    const { pageId, rootId } = ids(base);

    expect(() =>
      run(base, (draft) =>
        insertNode(draft, { pageId: "missing", parentId: rootId, node: createText() }),
      ),
    ).toThrow(/Page "missing"/);

    expect(() =>
      run(base, (draft) => insertNode(draft, { pageId, parentId: "missing", node: createText() })),
    ).toThrow(/Parent node "missing"/);

    expect(() =>
      run(base, (draft) => {
        insertNode(draft, { pageId, parentId: rootId, node: createText({ id: "leaf" }) });
        insertNode(draft, { pageId, parentId: "leaf", node: createText() });
      }),
    ).toThrow(/must be a frame/);
  });
});

describe("removeNode", () => {
  const base = createProject();
  const { pageId, rootId } = ids(base);
  const seeded = run(base, (draft) => {
    insertNode(draft, { pageId, parentId: rootId, node: createFrame({ id: "card" }) });
    insertNode(draft, {
      pageId,
      parentId: "card",
      node: createText({ id: "inside", content: "In" }),
    });
    insertNode(draft, { pageId, parentId: rootId, node: createFrame({ id: "other" }) });
  }).project;

  it("removes a leaf without touching its parent", () => {
    const { project } = run(seeded, (draft) => removeNode(draft, { pageId, nodeId: "inside" }));
    expect(findNode(project.pages[0]!.root, "inside")).toBeNull();
    expect(getFrameNode(project, "card").children).toHaveLength(0);
    expect(getFrameNode(project, "other").children).toHaveLength(0);
  });

  it("removes a non-root container with its whole subtree", () => {
    const { project } = run(seeded, (draft) => removeNode(draft, { pageId, nodeId: "card" }));
    expect(project.pages[0]!.root.children.map((node) => node.id)).toEqual(["other"]);
    expect(findNode(project.pages[0]!.root, "inside")).toBeNull();
  });

  it("throws when removing the page root or an unknown node", () => {
    expect(() => run(seeded, (draft) => removeNode(draft, { pageId, nodeId: rootId }))).toThrow(
      /page root/,
    );
    expect(() => run(seeded, (draft) => removeNode(draft, { pageId, nodeId: "nope" }))).toThrow(
      /not found/,
    );
  });
});

describe("moveNode", () => {
  const base = createProject();
  const { pageId, rootId } = ids(base);

  it("moves a node between parents", () => {
    const seeded = run(base, (draft) => {
      insertNode(draft, { pageId, parentId: rootId, node: createFrame({ id: "left" }) });
      insertNode(draft, { pageId, parentId: rootId, node: createFrame({ id: "right" }) });
      insertNode(draft, {
        pageId,
        parentId: "left",
        node: createText({ id: "item", content: "Item" }),
      });
    }).project;

    const { project } = run(seeded, (draft) =>
      moveNode(draft, { pageId, nodeId: "item", parentId: "right", index: 0 }),
    );

    expect(getFrameNode(project, "left").children).toHaveLength(0);
    expect(getFrameNode(project, "right").children.map((node) => node.id)).toEqual(["item"]);
  });

  it("reorders within a parent using the index after removal", () => {
    const seeded = addToRoot(base, [
      createText({ id: "a" }),
      createText({ id: "b" }),
      createText({ id: "c" }),
    ]);

    const { project } = run(seeded, (draft) => {
      moveNode(draft, { pageId, nodeId: "c", parentId: rootId, index: 0 });
      // After removing "a" the list is [c, b], so index 2 appends.
      moveNode(draft, { pageId, nodeId: "a", parentId: rootId, index: 2 });
    });

    expect(project.pages[0]!.root.children.map((node) => node.id)).toEqual(["c", "b", "a"]);
  });

  it("throws when moving into itself, a descendant or the page root", () => {
    const seeded = run(base, (draft) => {
      insertNode(draft, { pageId, parentId: rootId, node: createFrame({ id: "outer" }) });
      insertNode(draft, { pageId, parentId: "outer", node: createFrame({ id: "inner" }) });
      insertNode(draft, {
        pageId,
        parentId: "inner",
        node: createText({ id: "leaf", content: "Leaf" }),
      });
    }).project;

    expect(() =>
      run(seeded, (draft) =>
        moveNode(draft, { pageId, nodeId: "outer", parentId: "outer", index: 0 }),
      ),
    ).toThrow(/itself or one of its descendants/);

    expect(() =>
      run(seeded, (draft) =>
        moveNode(draft, { pageId, nodeId: "outer", parentId: "inner", index: 0 }),
      ),
    ).toThrow(/itself or one of its descendants/);

    expect(() =>
      run(seeded, (draft) =>
        moveNode(draft, { pageId, nodeId: "outer", parentId: "leaf", index: 0 }),
      ),
    ).toThrow(/must be a frame/);

    expect(() =>
      run(seeded, (draft) => moveNode(draft, { pageId, nodeId: rootId, parentId: "outer" })),
    ).toThrow(/page root/);
  });
});

describe("duplicateNode", () => {
  const base = createProject();
  const { pageId, rootId } = ids(base);
  const seeded = run(base, (draft) => {
    insertNode(draft, {
      pageId,
      parentId: rootId,
      node: createFrame({ id: "card", name: "Card" }),
    });
    insertNode(draft, {
      pageId,
      parentId: "card",
      node: createText({ id: "label", content: "Label" }),
    });
    insertNode(draft, { pageId, parentId: rootId, node: createFrame({ id: "other" }) });
  }).project;

  it("remaps every id, keeps content and inserts the clone after the original", () => {
    const { project, result } = run(seeded, (draft) =>
      duplicateNode(draft, { pageId, nodeId: "card" }),
    );

    const root = project.pages[0]!.root;
    expect(root.children.map((node) => node.id)).toEqual(["card", result, "other"]);

    const original = root.children[0]!;
    const clone = root.children[1]!;
    expect(clone.id).toBe(result);
    expect(clone.name).toBe("Card");
    expect(clone.type).toBe("frame");

    const originalIds = collectNodes(original).map((node) => node.id);
    const clonedIds = collectNodes(clone).map((node) => node.id);
    expect(clonedIds).toHaveLength(originalIds.length);
    expect(clonedIds).toHaveLength(2);
    for (const id of clonedIds) expect(originalIds).not.toContain(id);
    for (const id of clonedIds) expect(id.startsWith("node_")).toBe(true);

    const clonedLabel = getFrameNodeIn(clone, "text");
    expect(clonedLabel.responsive.base).toMatchObject({
      text: { content: "Label", fontFamily: "Inter" },
    });
  });

  it("throws when duplicating the page root or an unknown node", () => {
    expect(() => run(seeded, (draft) => duplicateNode(draft, { pageId, nodeId: rootId }))).toThrow(
      /page root/,
    );
    expect(() => run(seeded, (draft) => duplicateNode(draft, { pageId, nodeId: "nope" }))).toThrow(
      /not found/,
    );
  });

  function getFrameNodeIn(node: SceneNode, type: "text"): Extract<SceneNode, { type: "text" }> {
    if (node.type !== "frame") throw new Error("Expected a frame.");
    for (const child of node.children) {
      if (child.type === type) return child;
    }
    throw new Error(`Expected a child of type "${type}".`);
  }
});

describe("responsive prop updates", () => {
  const base = createProject();
  const { pageId, rootId } = ids(base);
  const seeded = run(base, (draft) => {
    insertNode(draft, { pageId, parentId: rootId, node: createFrame({ id: "card" }) });
    insertNode(draft, {
      pageId,
      parentId: rootId,
      node: createText({ id: "headline", content: "Hello" }),
    });
    insertNode(draft, { pageId, parentId: rootId, node: createImage({ id: "photo" }) });
  }).project;

  it("writes desktop props to base and keeps unrelated fields", () => {
    const { project } = run(seeded, (draft) => {
      updateBoxProps(draft, {
        pageId,
        nodeId: "card",
        breakpointId: "bp_desktop",
        patch: { size: { width: { mode: "fixed", value: 720 } } },
      });
    });

    const card = getFrameNode(project, "card");
    expect(card.responsive.base.size.width).toEqual({ mode: "fixed", value: 720 });
    expect(card.responsive.base.size.height).toEqual({ mode: "fixed", value: 400 });
    expect(card.responsive.base.layout.mode).toBe("none");
    expect(card.responsive.base.style.fill).toEqual({
      type: "solid",
      color: "#ffffff",
      opacity: 1,
    });
    expect(card.responsive.overrides).toEqual({});
  });

  it("cascades tablet and phone overrides through the base", () => {
    const { project } = run(seeded, (draft) => {
      updateBoxProps(draft, {
        pageId,
        nodeId: "card",
        breakpointId: "bp_tablet",
        patch: { size: { width: { mode: "fixed", value: 500 } } },
      });
      updateBoxProps(draft, {
        pageId,
        nodeId: "card",
        breakpointId: "bp_phone",
        patch: { style: { fill: { type: "solid", color: "#ff0000", opacity: 1 } } },
      });
    });

    const card = getFrameNode(project, "card");
    const breakpoints = project.breakpoints;
    const desktop = resolveNodeProps(card, "bp_desktop", breakpoints);
    const tablet = resolveNodeProps(card, "bp_tablet", breakpoints);
    const phone = resolveNodeProps(card, "bp_phone", breakpoints);

    expect(desktop.size.width).toEqual({ mode: "fixed", value: 400 });
    expect(tablet.size.width).toEqual({ mode: "fixed", value: 500 });
    expect(phone.size.width).toEqual({ mode: "fixed", value: 500 });
    expect(tablet.layout.mode).toBe("none");
    expect(phone.style.fill).toEqual({ type: "solid", color: "#ff0000", opacity: 1 });
    expect(card.responsive.overrides.bp_tablet?.size?.height).toBeUndefined();
  });

  it("replaces discriminated sizing values when the mode changes", () => {
    const { project } = run(seeded, (draft) => {
      updateBoxProps(draft, {
        pageId,
        nodeId: "card",
        breakpointId: "bp_tablet",
        patch: { size: { width: { mode: "hug" } } },
      });
      updateBoxProps(draft, {
        pageId,
        nodeId: "card",
        breakpointId: "bp_tablet",
        patch: { size: { width: { mode: "fixed", value: 640 } } },
      });
    });

    const card = getFrameNode(project, "card");
    expect(card.responsive.overrides.bp_tablet?.size?.width).toEqual({
      mode: "fixed",
      value: 640,
    });
  });

  it("updates text props per breakpoint", () => {
    const { project } = run(seeded, (draft) => {
      updateTextProps(draft, {
        pageId,
        nodeId: "headline",
        breakpointId: "bp_desktop",
        patch: { text: { content: "Welcome", fontSize: 32 } },
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "headline",
        breakpointId: "bp_phone",
        patch: { text: { fontSize: 18 } },
      });
    });

    const headline = getNode(project, "headline");
    if (headline.type !== "text") throw new Error("Expected a text node.");
    const desktop = resolveNodeProps(headline, "bp_desktop", project.breakpoints);
    const phone = resolveNodeProps(headline, "bp_phone", project.breakpoints);

    expect(desktop.text.content).toBe("Welcome");
    expect(desktop.text.fontSize).toBe(32);
    expect(desktop.text.fontFamily).toBe("Inter");
    expect(phone.text.fontSize).toBe(18);
    expect(phone.text.content).toBe("Welcome");
  });

  it("updates image props per breakpoint", () => {
    const { project } = run(seeded, (draft) => {
      updateImageProps(draft, {
        pageId,
        nodeId: "photo",
        breakpointId: "bp_desktop",
        patch: { image: { src: "https://example.com/a.png", alt: "A photo" } },
      });
    });

    const photo = getNode(project, "photo");
    if (photo.type !== "image") throw new Error("Expected an image node.");
    const desktop = resolveNodeProps(photo, "bp_desktop", project.breakpoints);

    expect(desktop.image.src).toBe("https://example.com/a.png");
    expect(desktop.image.alt).toBe("A photo");
    expect(desktop.image.fit).toBe("fill");
    expect(desktop.image.positionX).toBe(50);
  });

  it("rejects a wrong node type and an unknown breakpoint", () => {
    expect(() =>
      run(seeded, (draft) =>
        updateTextProps(draft, {
          pageId,
          nodeId: "card",
          breakpointId: "bp_desktop",
          patch: { text: { content: "No" } },
        }),
      ),
    ).toThrow(/expected a text node/);

    expect(() =>
      run(seeded, (draft) =>
        updateImageProps(draft, {
          pageId,
          nodeId: "card",
          breakpointId: "bp_desktop",
          patch: { image: { alt: "No" } },
        }),
      ),
    ).toThrow(/expected an image node/);

    expect(() =>
      run(seeded, (draft) =>
        updateBoxProps(draft, {
          pageId,
          nodeId: "card",
          breakpointId: "bp_watch",
          patch: { position: { x: 1 } },
        }),
      ),
    ).toThrow(/Breakpoint "bp_watch"/);
  });
});

describe("node metadata", () => {
  it("updates through the generic hook, rename, visibility and lock", () => {
    const base = createProject();
    const { pageId, rootId } = ids(base);
    const seeded = run(base, (draft) => {
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createFrame({ id: "card", name: "Card" }),
      });
    }).project;

    const { project } = run(seeded, (draft) => {
      updateNode(draft, { pageId, nodeId: "card" }, (node) => {
        node.name = "Hero";
      });
      renameNode(draft, { pageId, nodeId: "card" }, "Hero Section");
      setNodeVisible(draft, { pageId, nodeId: "card" }, false);
      setNodeLocked(draft, { pageId, nodeId: "card" }, true);
    });

    const card = getNode(project, "card");
    expect(card.name).toBe("Hero Section");
    expect(card.visible).toBe(false);
    expect(card.locked).toBe(true);
  });
});

describe("pages", () => {
  it("adds pages with a unique default name and path", () => {
    const base = createProject();
    const first = run(base, (draft) => addPage(draft));

    expect(first.project.pages).toHaveLength(2);
    const added = first.project.pages[1]!;
    expect(added.id).toBe(first.result);
    expect(added.name).toBe("New Page");
    expect(added.path).toBe("/new-page");
    expect(added.root.type).toBe("frame");
    expect(added.root.responsive.overrides.bp_tablet?.size?.width).toEqual({
      mode: "fixed",
      value: 810,
    });
    expect(added.root.responsive.overrides.bp_phone?.size?.width).toEqual({
      mode: "fixed",
      value: 390,
    });

    const second = run(first.project, (draft) => addPage(draft));
    expect(second.project.pages).toHaveLength(3);
    expect(second.project.pages[2]!.name).toBe("New Page 2");
    expect(second.project.pages[2]!.path).toBe("/new-page-2");
  });

  it("normalizes missing slashes and uniquifies a requested name and path", () => {
    const base = createProject();
    const { project } = run(base, (draft) => addPage(draft, { name: "Home", path: "about" }));
    expect(project.pages[1]!.name).toBe("Home 2");
    expect(project.pages[1]!.path).toBe("/about");

    const { project: rootClash } = run(base, (draft) =>
      addPage(draft, { name: "About", path: "/" }),
    );
    expect(rootClash.pages[1]!.name).toBe("About");
    expect(rootClash.pages[1]!.path).toBe("/-2");
  });

  it("updates a page name, path and background, keeping the path unique", () => {
    const base = createProject();
    const withAbout = run(base, (draft) =>
      addPage(draft, { name: "About", path: "/about" }),
    ).project;
    const added = withAbout.pages[1]!;

    const { project } = run(withAbout, (draft) =>
      updatePage(draft, {
        pageId: added.id,
        name: "Contact",
        path: "contact",
        background: null,
      }),
    );
    const page = project.pages[1]!;
    expect(page.name).toBe("Contact");
    expect(page.path).toBe("/contact");
    expect(page.background).toBeNull();

    const { project: deduped } = run(project, (draft) =>
      updatePage(draft, { pageId: added.id, path: "/" }),
    );
    expect(deduped.pages[1]!.path).toBe("/-2");
    expect(deduped.pages[0]!.path).toBe("/");
  });

  it("refuses to remove the last page and removes other pages", () => {
    const base = createProject();
    expect(() => run(base, (draft) => removePage(draft, base.pages[0]!.id))).toThrow(/last page/);
    expect(() => run(base, (draft) => removePage(draft, "missing"))).toThrow(/not found/);

    const withTwo = run(base, (draft) => addPage(draft)).project;
    const { project } = run(withTwo, (draft) => removePage(draft, withTwo.pages[1]!.id));
    expect(project.pages).toHaveLength(1);
    expect(project.pages[0]!.path).toBe("/");
  });
});

describe("project metadata", () => {
  it("renames the project and sets or clears publish settings", () => {
    const base = createProject({ name: "Untitled" });

    const renamed = run(base, (draft) => renameProject(draft, "Portfolio")).project;
    expect(renamed.name).toBe("Portfolio");

    const published = run(renamed, (draft) =>
      setProjectPublish(draft, { adapterId: "static", options: { minify: true } }),
    ).project;
    expect(published.publish).toEqual({ adapterId: "static", options: { minify: true } });

    const cleared = run(published, (draft) => setProjectPublish(draft, undefined)).project;
    expect(cleared.publish).toBeUndefined();
    expect("publish" in cleared).toBe(false);
  });
});
