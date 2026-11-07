import { type Draft, produce } from "immer";
import { describe, expect, it } from "vitest";
import {
  createFrame,
  createImage,
  createProject,
  createText,
  resolveNodeProps,
  resolveResponsive,
} from "./defaults";
import { applyOperation, createHistory, redo, undo } from "./history";
import {
  addBreakpoint,
  addColorStyle,
  addComponentVariant,
  addGuide,
  addInteraction,
  addPage,
  addTextStyle,
  clearInstanceStyleOverrides,
  countColorStyleUsages,
  countTextStyleUsages,
  createComponentFromNode,
  duplicateNode,
  type InteractionInput,
  insertNode,
  moveNode,
  removeBreakpoint,
  removeColorStyle,
  removeGuide,
  removeInteraction,
  removeNode,
  removePage,
  removeTextStyle,
  renameNode,
  renameProject,
  setNodeLocked,
  setNodeVisible,
  setProjectPublish,
  unwrapNode,
  updateBoxProps,
  updateColorStyle,
  updateGuide,
  updateImageProps,
  updateInstanceStyle,
  updateInteraction,
  updateNode,
  updatePage,
  updateTextProps,
  updateTextStyle,
  wrapNodes,
} from "./operations";
import { collectNodes, findNode } from "./tree";
import type {
  ComponentVariant,
  FrameNode,
  InteractionDirection,
  InteractionEasing,
  InteractionEffect,
  InteractionTrigger,
  Project,
  SceneNode,
  TextStyleValues,
} from "./types";

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

/** A project with one page and one component created from a card on it. */
function componentFixture(): {
  project: Project;
  pageId: string;
  rootId: string;
  instanceId: string;
  componentId: string;
  variantId: string;
} {
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
      node: createText({ id: "card_label", content: "Label" }),
    });
  }).project;
  const created = run(seeded, (draft) =>
    createComponentFromNode(draft, { pageId, nodeId: "card", name: "Card" }),
  );
  if (!created.result) throw new Error("Component was not created.");
  return {
    project: created.project,
    pageId,
    rootId,
    instanceId: created.result.instanceId,
    componentId: created.result.componentId,
    variantId: created.result.variantId,
  };
}

function variantOf(project: Project, componentId: string, variantId: string): ComponentVariant {
  const component = project.components.find((candidate) => candidate.id === componentId);
  const variant = component?.variants.find((candidate) => candidate.id === variantId);
  if (!variant) throw new Error(`Missing variant ${variantId}.`);
  return variant;
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

describe("breakpoints", () => {
  it("inserts widest to narrowest, keeping equal widths after existing ones", () => {
    const base = createProject();
    const { project } = run(base, (draft) => {
      addBreakpoint(draft, { name: "Wide", width: 1100 });
      addBreakpoint(draft, { name: "Tablet 2", width: 810 });
      addBreakpoint(draft, { name: "Equal", width: 810 });
      addBreakpoint(draft, { name: "Small", width: 320 });
    });

    expect(project.breakpoints.map((breakpoint) => breakpoint.name)).toEqual([
      "Desktop",
      "Wide",
      "Tablet",
      "Tablet 2",
      "Equal",
      "Phone",
      "Small",
    ]);
    expect(project.breakpoints.map((breakpoint) => breakpoint.width)).toEqual([
      1200, 1100, 810, 810, 810, 390, 320,
    ]);
  });

  it("trims the name, generates an id and rejects invalid input", () => {
    const base = createProject();
    const { project, result } = run(base, (draft) =>
      addBreakpoint(draft, { name: "  Watch  ", width: 320 }),
    );
    const added = project.breakpoints.find((breakpoint) => breakpoint.id === result);
    expect(result.startsWith("bp_")).toBe(true);
    expect(added).toMatchObject({ name: "Watch", width: 320 });

    expect(() => run(base, (draft) => addBreakpoint(draft, { name: "", width: 500 }))).toThrow(
      /name cannot be empty/,
    );
    expect(() => run(base, (draft) => addBreakpoint(draft, { name: "Narrow", width: 0 }))).toThrow(
      /whole number from 1 to 10000/,
    );
    expect(() =>
      run(base, (draft) => addBreakpoint(draft, { name: "Narrow", width: 12.5 })),
    ).toThrow(/whole number from 1 to 10000/);
    expect(() =>
      run(base, (draft) => addBreakpoint(draft, { name: "Equal primary", width: 1200 })),
    ).toThrow(/narrower than the primary breakpoint/);
    expect(() =>
      run(base, (draft) => addBreakpoint(draft, { name: "Wider", width: 1440 })),
    ).toThrow(/narrower than the primary breakpoint/);
    expect(() =>
      run(base, (draft) => addBreakpoint(draft, { name: "Desktop", width: 500 })),
    ).toThrow(/already exists/);
    expect(() =>
      run(base, (draft) => addBreakpoint(draft, { name: "Narrow", width: 500, id: "bp_desktop" })),
    ).toThrow(/id "bp_desktop" is already used/);
  });

  it("gives every page root the new width but leaves component roots alone", () => {
    const fixture = componentFixture();
    const withSecondPage = run(fixture.project, (draft) =>
      addPage(draft, { name: "About", path: "/about" }),
    ).project;
    const variant = variantOf(withSecondPage, fixture.componentId, fixture.variantId);
    const componentOverridesBefore = Object.keys(variant.root.responsive.overrides);

    const { project, result } = run(withSecondPage, (draft) =>
      addBreakpoint(draft, { name: "Watch", width: 320 }),
    );

    expect(project.pages).toHaveLength(2);
    for (const page of project.pages) {
      expect(page.root.responsive.overrides[result]?.size?.width).toEqual({
        mode: "fixed",
        value: 320,
      });
    }

    const after = variantOf(project, fixture.componentId, fixture.variantId);
    expect(after.root.responsive.overrides[result]).toBeUndefined();
    expect(Object.keys(after.root.responsive.overrides)).toEqual(componentOverridesBefore);
  });

  it("removes overrides from every page and component variant node", () => {
    const fixture = componentFixture();
    const variant = variantOf(fixture.project, fixture.componentId, fixture.variantId);
    const variantChildId = variant.root.children[0]?.id;
    if (!variantChildId) throw new Error("Expected the variant root to have a child.");

    const seeded = run(fixture.project, (draft) => {
      const pageTarget = { pageId: fixture.pageId };
      updateBoxProps(draft, {
        ...pageTarget,
        nodeId: fixture.rootId,
        breakpointId: "bp_phone",
        patch: { position: { x: 10 } },
      });
      updateBoxProps(draft, {
        ...pageTarget,
        nodeId: fixture.instanceId,
        breakpointId: "bp_phone",
        patch: { position: { x: 20 } },
      });
      const variantTarget = { componentId: fixture.componentId, variantId: fixture.variantId };
      updateBoxProps(draft, {
        ...variantTarget,
        nodeId: variant.root.id,
        breakpointId: "bp_phone",
        patch: { position: { x: 4 } },
      });
      updateBoxProps(draft, {
        ...variantTarget,
        nodeId: variantChildId,
        breakpointId: "bp_phone",
        patch: { position: { x: 2 } },
      });
      updateBoxProps(draft, {
        ...variantTarget,
        nodeId: variant.root.id,
        breakpointId: "bp_tablet",
        patch: { position: { x: 1 } },
      });
    }).project;

    const { project } = run(seeded, (draft) => removeBreakpoint(draft, "bp_phone"));

    expect(project.breakpoints.some((breakpoint) => breakpoint.id === "bp_phone")).toBe(false);

    const allNodes = [
      ...project.pages.flatMap((page) => collectNodes(page.root)),
      ...project.components.flatMap((component) =>
        component.variants.flatMap((entry) => collectNodes(entry.root)),
      ),
    ];
    for (const node of allNodes) {
      expect(node.responsive.overrides.bp_phone).toBeUndefined();
    }

    // Other breakpoints keep their overrides.
    const after = variantOf(project, fixture.componentId, fixture.variantId);
    expect(after.root.responsive.overrides.bp_tablet).toBeDefined();
  });

  it("refuses to remove a missing, primary or last breakpoint", () => {
    const base = createProject();
    expect(() => run(base, (draft) => removeBreakpoint(draft, "bp_watch"))).toThrow(/not found/);
    expect(() => run(base, (draft) => removeBreakpoint(draft, "bp_desktop"))).toThrow(/primary/);

    const single = createProject({
      breakpoints: [{ id: "bp_only", name: "Only", width: 1200 }],
    });
    expect(() => run(single, (draft) => removeBreakpoint(draft, "bp_only"))).toThrow(/last/);
  });

  it("round-trips add and remove", () => {
    const base = createProject();
    const added = run(base, (draft) => addBreakpoint(draft, { name: "Watch", width: 320 }));
    const id = added.result;
    expect(added.project.pages[0]!.root.responsive.overrides[id]).toBeDefined();

    const removed = run(added.project, (draft) => removeBreakpoint(draft, id));
    expect(removed.project.breakpoints).toEqual(base.breakpoints);
    expect(removed.project.pages[0]!.root.responsive.overrides[id]).toBeUndefined();
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

describe("guides", () => {
  it("adds x and y guides with generated ids and keeps them on the page", () => {
    const base = createProject();
    const { pageId } = ids(base);
    const { project, result } = run(base, (draft) => {
      const xId = addGuide(draft, { pageId, axis: "x", position: 120 });
      addGuide(draft, { pageId, axis: "y", position: -40.5 });
      return xId;
    });

    expect(result.startsWith("guide_")).toBe(true);
    expect(project.pages[0]!.guides).toHaveLength(2);
    expect(project.pages[0]!.guides?.[0]).toEqual({ id: result, axis: "x", position: 120 });
    expect(project.pages[0]!.guides?.[1]).toMatchObject({ axis: "y", position: -40.5 });
  });

  it("creates an empty guide list on new pages", () => {
    expect(createProject().pages[0]!.guides).toEqual([]);
    const added = run(createProject(), (draft) => addPage(draft)).project.pages[1]!;
    expect(added.guides).toEqual([]);
  });

  it("updates a guide position and removes it", () => {
    const base = createProject();
    const { pageId } = ids(base);
    const { project: added, result: guideId } = run(base, (draft) =>
      addGuide(draft, { pageId, axis: "x", position: 10 }),
    );

    const { project: moved } = run(added, (draft) =>
      updateGuide(draft, { pageId, guideId, position: 240 }),
    );
    expect(moved.pages[0]!.guides?.[0]?.position).toBe(240);

    const { project: removed } = run(moved, (draft) => removeGuide(draft, { pageId, guideId }));
    expect(removed.pages[0]!.guides).toEqual([]);
  });

  it("validates the page, axis, position and guide id", () => {
    const base = createProject();
    const { pageId } = ids(base);
    const badAxis = "z" as unknown as "x";

    expect(() =>
      run(base, (draft) => addGuide(draft, { pageId, axis: "x", position: 0 })),
    ).not.toThrow();
    expect(() =>
      run(base, (draft) => addGuide(draft, { pageId: "missing", axis: "x", position: 0 })),
    ).toThrow(/not found/);
    expect(() =>
      run(base, (draft) => addGuide(draft, { pageId, axis: badAxis, position: 0 })),
    ).toThrow(/axis/);
    expect(() =>
      run(base, (draft) => addGuide(draft, { pageId, axis: "x", position: Number.NaN })),
    ).toThrow(/finite/);
    expect(() =>
      run(base, (draft) => updateGuide(draft, { pageId, guideId: "missing", position: 0 })),
    ).toThrow(/not found/);
    expect(() => run(base, (draft) => removeGuide(draft, { pageId, guideId: "missing" }))).toThrow(
      /not found/,
    );
  });

  it("persists guide changes through undo and redo", () => {
    const base = createProject();
    const { pageId } = ids(base);
    let history = createHistory(base);
    let guideId = "";

    history = applyOperation(history, "Add guide", (draft) => {
      guideId = addGuide(draft, { pageId, axis: "x", position: 300 });
    });
    expect(history.project.pages[0]!.guides?.[0]?.position).toBe(300);

    history = applyOperation(history, "Update guide", (draft) => {
      updateGuide(draft, { pageId, guideId, position: 500 });
    });
    expect(history.project.pages[0]!.guides?.[0]?.position).toBe(500);

    const undone = undo(history);
    expect(undone.project.pages[0]!.guides?.[0]?.position).toBe(300);

    const redone = redo(undone);
    expect(redone.project.pages[0]!.guides?.[0]?.position).toBe(500);

    const removed = applyOperation(redone, "Remove guide", (draft) => {
      removeGuide(draft, { pageId, guideId });
    });
    expect(removed.project.pages[0]!.guides).toEqual([]);
    expect(undo(removed).project.pages[0]!.guides?.[0]?.position).toBe(500);
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

describe("interactions", () => {
  const DEFAULT_INTERACTION: InteractionInput = {
    trigger: "appear",
    effect: "fade",
    direction: "up",
    duration: 300,
    delay: 0,
    easing: "ease",
  };

  const base = createProject();
  const { pageId, rootId } = ids(base);
  const seeded = run(base, (draft) => {
    insertNode(draft, {
      pageId,
      parentId: rootId,
      node: createFrame({ id: "hero", name: "Hero" }),
    });
  }).project;

  function interactionsOf(project: Project, nodeId: string) {
    return getNode(project, nodeId).interactions ?? [];
  }

  it("adds, updates and removes an interaction on a page node", () => {
    const added = run(seeded, (draft) =>
      addInteraction(draft, { pageId, nodeId: "hero" }, DEFAULT_INTERACTION),
    );

    expect(added.result.startsWith("interaction_")).toBe(true);
    expect(interactionsOf(added.project, "hero")).toEqual([
      { ...DEFAULT_INTERACTION, id: added.result },
    ]);

    const updated = run(added.project, (draft) =>
      updateInteraction(draft, { pageId, nodeId: "hero" }, added.result, {
        trigger: "hover",
        effect: "slide",
        direction: "left",
        duration: 500,
        delay: 50,
        easing: "ease-in",
      }),
    );
    expect(interactionsOf(updated.project, "hero")[0]).toEqual({
      id: added.result,
      trigger: "hover",
      effect: "slide",
      direction: "left",
      duration: 500,
      delay: 50,
      easing: "ease-in",
    });

    const removed = run(updated.project, (draft) =>
      removeInteraction(draft, { pageId, nodeId: "hero" }, added.result),
    );
    expect(interactionsOf(removed.project, "hero")).toEqual([]);
  });

  it("accepts an explicit id, keeps ids unique and appends in order", () => {
    const first = run(seeded, (draft) =>
      addInteraction(draft, { pageId, nodeId: "hero" }, { ...DEFAULT_INTERACTION, id: "i_one" }),
    );
    expect(first.result).toBe("i_one");

    const second = run(first.project, (draft) =>
      addInteraction(
        draft,
        { pageId, nodeId: "hero" },
        { ...DEFAULT_INTERACTION, id: "i_two", trigger: "hover" },
      ),
    );
    expect(interactionsOf(second.project, "hero").map((entry) => entry.id)).toEqual([
      "i_one",
      "i_two",
    ]);

    expect(() =>
      run(second.project, (draft) =>
        addInteraction(draft, { pageId, nodeId: "hero" }, { ...DEFAULT_INTERACTION, id: "i_one" }),
      ),
    ).toThrow(/already used/);
  });

  it("supports component variant nodes through component targets", () => {
    const fixture = componentFixture();
    const variant = variantOf(fixture.project, fixture.componentId, fixture.variantId);
    const target = { componentId: fixture.componentId, variantId: fixture.variantId };
    const location = { ...target, nodeId: variant.root.id };

    const added = run(fixture.project, (draft) =>
      addInteraction(draft, location, {
        ...DEFAULT_INTERACTION,
        trigger: "hover",
        effect: "scale",
      }),
    );
    expect(
      variantOf(added.project, fixture.componentId, fixture.variantId).root.interactions,
    ).toHaveLength(1);

    const updated = run(added.project, (draft) =>
      updateInteraction(draft, location, added.result, { duration: 120, easing: "linear" }),
    );
    expect(
      variantOf(updated.project, fixture.componentId, fixture.variantId).root.interactions?.[0],
    ).toMatchObject({ duration: 120, easing: "linear", trigger: "hover" });

    const removed = run(updated.project, (draft) =>
      removeInteraction(draft, location, added.result),
    );
    expect(
      variantOf(removed.project, fixture.componentId, fixture.variantId).root.interactions,
    ).toEqual([]);
  });

  it("validates trigger, effect, direction, easing, duration and delay", () => {
    const invalid: Array<Partial<InteractionInput>> = [
      { trigger: "scroll" as unknown as InteractionTrigger },
      { effect: "blur" as unknown as InteractionEffect },
      { direction: "diagonal" as unknown as InteractionDirection },
      { easing: "spring" as unknown as InteractionEasing },
      { duration: -1 },
      { duration: 10001 },
      { duration: 12.5 },
      { delay: -5 },
      { delay: 10001 },
      { delay: 1.5 },
    ];

    for (const patch of invalid) {
      expect(() =>
        run(seeded, (draft) =>
          addInteraction(draft, { pageId, nodeId: "hero" }, { ...DEFAULT_INTERACTION, ...patch }),
        ),
      ).toThrow(/Interaction/);
    }

    const added = run(seeded, (draft) =>
      addInteraction(draft, { pageId, nodeId: "hero" }, DEFAULT_INTERACTION),
    );

    expect(() =>
      run(added.project, (draft) =>
        updateInteraction(draft, { pageId, nodeId: "hero" }, added.result, { duration: 20000 }),
      ),
    ).toThrow(/duration/);
    expect(() =>
      run(added.project, (draft) =>
        updateInteraction(draft, { pageId, nodeId: "hero" }, added.result, {
          easing: "spring" as unknown as InteractionEasing,
        }),
      ),
    ).toThrow(/easing/);
    expect(() =>
      run(added.project, (draft) =>
        updateInteraction(draft, { pageId, nodeId: "hero" }, "missing", { duration: 100 }),
      ),
    ).toThrow(/not found/);
    expect(() =>
      run(added.project, (draft) =>
        removeInteraction(draft, { pageId, nodeId: "hero" }, "missing"),
      ),
    ).toThrow(/not found/);
  });

  it("undoes and redoes adding and removing an interaction", () => {
    let history = createHistory(seeded);
    let interactionId = "";

    history = applyOperation(history, "Add effect", (draft) => {
      interactionId = addInteraction(draft, { pageId, nodeId: "hero" }, DEFAULT_INTERACTION);
    });
    expect(getNode(history.project, "hero").interactions).toHaveLength(1);

    const undone = undo(history);
    expect(getNode(undone.project, "hero").interactions ?? []).toHaveLength(0);
    const redone = redo(undone);
    expect(getNode(redone.project, "hero").interactions?.map((entry) => entry.id)).toEqual([
      interactionId,
    ]);

    const removed = applyOperation(redone, "Remove effect", (draft) => {
      removeInteraction(draft, { pageId, nodeId: "hero" }, interactionId);
    });
    expect(getNode(removed.project, "hero").interactions ?? []).toHaveLength(0);

    const restored = undo(removed);
    expect(getNode(restored.project, "hero").interactions?.map((entry) => entry.id)).toEqual([
      interactionId,
    ]);
  });
});

describe("wrapping", () => {
  const base = createProject();
  const { pageId, rootId } = ids(base);

  function seedSiblings(): Project {
    return addToRoot(base, [
      createFrame({
        id: "a",
        name: "A",
        props: {
          position: { x: 10, y: 20 },
          size: { width: { mode: "fixed", value: 100 }, height: { mode: "fixed", value: 50 } },
        },
      }),
      createFrame({
        id: "b",
        name: "B",
        props: {
          position: { x: 200, y: 60 },
          size: { width: { mode: "fixed", value: 80 }, height: { mode: "fixed", value: 40 } },
        },
      }),
    ]);
  }

  it("wraps two siblings with bounds and explicit positions", () => {
    const seeded = seedSiblings();
    const { project, result } = run(seeded, (draft) =>
      wrapNodes(draft, {
        pageId,
        nodeIds: ["a", "b"],
        kind: "frame",
        bounds: { x: 5, y: 5, width: 300, height: 200 },
        positions: { a: { x: 6, y: 8 }, b: { x: 9, y: 10 } },
      }),
    );

    const root = project.pages[0]!.root;
    expect(root.children.map((node) => node.id)).toEqual([result]);

    const frame = getFrameNode(project, result);
    expect(frame.name).toBe("Frame");
    expect(frame.responsive.base.position).toMatchObject({ x: 5, y: 5 });
    expect(frame.responsive.base.size.width).toEqual({ mode: "fixed", value: 300 });
    expect(frame.responsive.base.size.height).toEqual({ mode: "fixed", value: 200 });
    expect(frame.responsive.base.style.fill).toBeNull();
    expect(frame.responsive.base.style.overflow).toBe("visible");
    expect(frame.responsive.base.layout.mode).toBe("none");
    expect(frame.children.map((node) => node.id)).toEqual(["a", "b"]);
    expect(getFrameNode(project, "a").responsive.base.position).toMatchObject({ x: 6, y: 8 });
    expect(getFrameNode(project, "b").responsive.base.position).toMatchObject({ x: 9, y: 10 });
  });

  it("wraps three siblings with explicit positions in parent order", () => {
    const seeded = addToRoot(base, [
      createFrame({ id: "a", props: { position: { x: 0, y: 0 } } }),
      createFrame({ id: "b", props: { position: { x: 10, y: 10 } } }),
      createFrame({ id: "c", props: { position: { x: 20, y: 20 } } }),
    ]);

    const { project, result } = run(seeded, (draft) =>
      wrapNodes(draft, {
        pageId,
        nodeIds: ["c", "a", "b"],
        kind: "frame",
        bounds: { x: 0, y: 0, width: 320, height: 240 },
        positions: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, c: { x: 5, y: 6 } },
      }),
    );

    const frame = getFrameNode(project, result);
    expect(frame.children.map((node) => node.id)).toEqual(["a", "b", "c"]);
    expect(frame.children.map((node) => node.responsive.base.position)).toMatchObject([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ]);
  });

  it("computes the union bounds and rebases base positions", () => {
    const seeded = seedSiblings();
    const { project, result } = run(seeded, (draft) =>
      wrapNodes(draft, { pageId, nodeIds: ["a", "b"], kind: "frame" }),
    );

    const frame = getFrameNode(project, result);
    // min (10, 20); extent to (200 + 80, 60 + 40).
    expect(frame.responsive.base.position).toMatchObject({ x: 10, y: 20 });
    expect(frame.responsive.base.size.width).toEqual({ mode: "fixed", value: 270 });
    expect(frame.responsive.base.size.height).toEqual({ mode: "fixed", value: 80 });
    expect(getFrameNode(project, "a").responsive.base.position).toMatchObject({ x: 0, y: 0 });
    expect(getFrameNode(project, "b").responsive.base.position).toMatchObject({ x: 190, y: 40 });
  });

  it("keeps parent order and inserts the wrapper at the lowest index", () => {
    const seeded = addToRoot(base, [
      createFrame({ id: "x", name: "X" }),
      createFrame({ id: "a", name: "A" }),
      createFrame({ id: "b", name: "B" }),
      createFrame({ id: "c", name: "C" }),
    ]);

    const { project, result } = run(seeded, (draft) =>
      wrapNodes(draft, { pageId, nodeIds: ["c", "a"], kind: "frame" }),
    );

    const root = project.pages[0]!.root;
    expect(root.children.map((node) => node.id)).toEqual(["x", result, "b"]);
    expect(getFrameNode(project, result).children.map((node) => node.id)).toEqual(["a", "c"]);
  });

  it("creates a vertical stack wrapper and honours a custom name", () => {
    const seeded = seedSiblings();
    const stacked = run(seeded, (draft) =>
      wrapNodes(draft, {
        pageId,
        nodeIds: ["a", "b"],
        kind: "stack",
        bounds: { x: 0, y: 0, width: 400, height: 400 },
      }),
    );

    const stack = getFrameNode(stacked.project, stacked.result);
    expect(stack.name).toBe("Stack");
    expect(stack.responsive.base.layout.mode).toBe("stack");
    expect(stack.responsive.base.layout.direction).toBe("vertical");

    const named = run(seeded, (draft) =>
      wrapNodes(draft, { pageId, nodeIds: ["a"], kind: "frame", name: "Card" }),
    );
    expect(getFrameNode(named.project, named.result).name).toBe("Card");
  });

  it("rebases responsive position overrides and keeps unrelated overrides", () => {
    const seeded = addToRoot(base, [
      createFrame({
        id: "a",
        props: {
          position: { x: 10, y: 20 },
          size: { width: { mode: "fixed", value: 100 }, height: { mode: "fixed", value: 50 } },
        },
      }),
    ]);
    const withOverride = run(seeded, (draft) => {
      const node = findNode(draft.pages[0]!.root, "a");
      if (!node) throw new Error("Missing node");
      node.responsive.overrides.bp_phone = {
        position: { x: 15, y: 25 },
        size: { width: { mode: "fixed", value: 200 } },
      };
    }).project;

    const { project, result } = run(withOverride, (draft) =>
      wrapNodes(draft, {
        pageId,
        nodeIds: ["a"],
        kind: "frame",
        bounds: { x: 10, y: 20, width: 100, height: 50 },
      }),
    );

    expect(result).toBeTruthy();
    const override = getFrameNode(project, "a").responsive.overrides.bp_phone;
    expect(override?.position).toMatchObject({ x: 5, y: 5 });
    expect(override?.size).toMatchObject({ width: { mode: "fixed", value: 200 } });
  });

  it("unwraps a frame and restores approximate positions", () => {
    const seeded = seedSiblings();
    const wrapped = run(seeded, (draft) =>
      wrapNodes(draft, {
        pageId,
        nodeIds: ["a", "b"],
        kind: "frame",
        bounds: { x: 5, y: 5, width: 300, height: 200 },
        positions: { a: { x: 6, y: 8 }, b: { x: 9, y: 10 } },
      }),
    );

    const { project, result } = run(wrapped.project, (draft) =>
      unwrapNode(draft, { pageId, nodeId: wrapped.result }),
    );

    expect(result).toEqual(["a", "b"]);
    const root = project.pages[0]!.root;
    expect(root.children.map((node) => node.id)).toEqual(["a", "b"]);
    expect(getFrameNode(project, "a").responsive.base.position).toMatchObject({ x: 11, y: 13 });
    expect(getFrameNode(project, "b").responsive.base.position).toMatchObject({ x: 14, y: 15 });
  });

  it("uses supplied child positions when unwrapping", () => {
    const seeded = seedSiblings();
    const wrapped = run(seeded, (draft) =>
      wrapNodes(draft, {
        pageId,
        nodeIds: ["a", "b"],
        kind: "frame",
        bounds: { x: 5, y: 5, width: 300, height: 200 },
      }),
    );

    const { project, result } = run(wrapped.project, (draft) =>
      unwrapNode(draft, {
        pageId,
        nodeId: wrapped.result,
        childPositions: { a: { x: 1, y: 2 } },
      }),
    );

    expect(result).toEqual(["a", "b"]);
    expect(getFrameNode(project, "a").responsive.base.position).toMatchObject({ x: 1, y: 2 });
    // b keeps the computed offset: frame origin (5, 5) + local (195, 55).
    expect(getFrameNode(project, "b").responsive.base.position).toMatchObject({ x: 200, y: 60 });
  });

  it("wraps and unwraps a single layer", () => {
    const seeded = addToRoot(base, [
      createFrame({
        id: "a",
        props: {
          position: { x: 10, y: 20 },
          size: { width: { mode: "fixed", value: 100 }, height: { mode: "fixed", value: 50 } },
        },
      }),
    ]);

    const wrapped = run(seeded, (draft) =>
      wrapNodes(draft, { pageId, nodeIds: ["a"], kind: "frame" }),
    );
    const frame = getFrameNode(wrapped.project, wrapped.result);
    expect(frame.responsive.base.position).toMatchObject({ x: 10, y: 20 });
    expect(getFrameNode(wrapped.project, "a").responsive.base.position).toMatchObject({
      x: 0,
      y: 0,
    });

    const { project, result } = run(wrapped.project, (draft) =>
      unwrapNode(draft, { pageId, nodeId: wrapped.result }),
    );
    expect(result).toEqual(["a"]);
    expect(project.pages[0]!.root.children.map((node) => node.id)).toEqual(["a"]);
    expect(getFrameNode(project, "a").responsive.base.position).toMatchObject({ x: 10, y: 20 });
  });

  it("wraps nodes in a component variant target", () => {
    const fixture = componentFixture();
    const variant = variantOf(fixture.project, fixture.componentId, fixture.variantId);
    const childId = variant.root.children[0]?.id;
    if (!childId) throw new Error("Variant has no child");

    const wrapped = run(fixture.project, (draft) =>
      wrapNodes(draft, {
        componentId: fixture.componentId,
        variantId: fixture.variantId,
        nodeIds: [childId],
        kind: "frame",
        bounds: { x: 0, y: 0, width: 120, height: 60 },
      }),
    );

    const wrappedVariant = variantOf(wrapped.project, fixture.componentId, fixture.variantId);
    expect(wrappedVariant.root.children.map((node) => node.id)).toEqual([wrapped.result]);
    expect(wrappedVariant.root.children[0]?.type).toBe("frame");

    const unwrapped = run(wrapped.project, (draft) =>
      unwrapNode(draft, {
        componentId: fixture.componentId,
        variantId: fixture.variantId,
        nodeId: wrapped.result,
      }),
    );
    const restored = variantOf(unwrapped.project, fixture.componentId, fixture.variantId);
    expect(unwrapped.result).toEqual([childId]);
    expect(restored.root.children.map((node) => node.id)).toEqual([childId]);
  });

  it("throws for empty, root, cross-parent and unknown selections", () => {
    const seeded = run(seedSiblings(), (draft) => {
      insertNode(draft, {
        pageId,
        parentId: "a",
        node: createFrame({ id: "nested", name: "Nested" }),
      });
    }).project;

    expect(() =>
      run(seeded, (draft) => wrapNodes(draft, { pageId, nodeIds: [], kind: "frame" })),
    ).toThrow(/at least one layer/);
    expect(() =>
      run(seeded, (draft) => wrapNodes(draft, { pageId, nodeIds: [rootId], kind: "frame" })),
    ).toThrow(/page root/);
    expect(() =>
      run(seeded, (draft) => wrapNodes(draft, { pageId, nodeIds: ["a", "nested"], kind: "frame" })),
    ).toThrow(/share the same parent/);
    expect(() =>
      run(seeded, (draft) => wrapNodes(draft, { pageId, nodeIds: ["missing"], kind: "frame" })),
    ).toThrow(/not found/);
  });

  it("throws when unwrapping the root, a missing node or a non-frame", () => {
    const seeded = run(seedSiblings(), (draft) => {
      insertNode(draft, {
        pageId,
        parentId: "a",
        node: createText({ id: "label", content: "Label" }),
      });
    }).project;

    expect(() => run(seeded, (draft) => unwrapNode(draft, { pageId, nodeId: rootId }))).toThrow(
      /page root/,
    );
    expect(() => run(seeded, (draft) => unwrapNode(draft, { pageId, nodeId: "missing" }))).toThrow(
      /not found/,
    );
    expect(() => run(seeded, (draft) => unwrapNode(draft, { pageId, nodeId: "label" }))).toThrow(
      /not a frame/,
    );
  });

  it("returns no children for an empty frame", () => {
    const seeded = addToRoot(base, [
      createFrame({ id: "empty", props: { position: { x: 30, y: 40 } } }),
    ]);
    const { project, result } = run(seeded, (draft) =>
      unwrapNode(draft, { pageId, nodeId: "empty" }),
    );
    expect(result).toEqual([]);
    expect(project.pages[0]!.root.children).toHaveLength(0);
  });

  it("undoes and redoes wrapping through history", () => {
    const seeded = seedSiblings();
    let history = createHistory(seeded);
    let frameId = "";

    history = applyOperation(history, "Add frame", (draft) => {
      frameId = wrapNodes(draft, {
        pageId,
        nodeIds: ["a", "b"],
        kind: "frame",
        bounds: { x: 5, y: 5, width: 300, height: 200 },
      });
    });
    expect(history.project.pages[0]!.root.children.map((node) => node.id)).toEqual([frameId]);

    const undone = undo(history);
    expect(undone.project.pages[0]!.root.children.map((node) => node.id)).toEqual(["a", "b"]);

    const redone = redo(undone);
    expect(redone.project.pages[0]!.root.children.map((node) => node.id)).toEqual([frameId]);

    const unwrapped = applyOperation(redone, "Remove frame", (draft) => {
      unwrapNode(draft, { pageId, nodeId: frameId });
    });
    expect(unwrapped.project.pages[0]!.root.children.map((node) => node.id)).toEqual(["a", "b"]);
  });
});

describe("instance style overrides", () => {
  function instanceOf(project: Project, nodeId: string) {
    const node = getNode(project, nodeId);
    if (node.type !== "componentInstance") throw new Error("Expected a component instance.");
    return node;
  }

  it("writes sparse overrides at the primary breakpoint and cascades smaller ones", () => {
    const fixture = componentFixture();
    const target = { pageId: fixture.pageId };
    const placement = instanceOf(fixture.project, fixture.instanceId).responsive.base;

    const desktop = run(fixture.project, (draft) =>
      updateInstanceStyle(draft, {
        ...target,
        nodeId: fixture.instanceId,
        breakpointId: "bp_desktop",
        patch: {
          fill: { type: "solid", color: "#ff0000", opacity: 1 },
          radius: { topLeft: 8 },
        },
      }),
    );
    const instance = instanceOf(desktop.project, fixture.instanceId);
    expect(instance.styleOverrides?.base).toMatchObject({
      fill: { type: "solid", color: "#ff0000", opacity: 1 },
      radius: { topLeft: 8 },
    });
    expect(instance.styleOverrides?.overrides).toEqual({});
    // The instance still owns position and size only.
    expect(instance.responsive.base.position).toEqual(placement.position);
    expect(instance.responsive.base.size).toEqual(placement.size);

    const tablet = run(desktop.project, (draft) =>
      updateInstanceStyle(draft, {
        ...target,
        nodeId: fixture.instanceId,
        breakpointId: "bp_tablet",
        patch: { opacity: 0.4 },
      }),
    );
    const layered = instanceOf(tablet.project, fixture.instanceId);
    expect(layered.styleOverrides?.overrides.bp_tablet).toMatchObject({ opacity: 0.4 });

    const resolved = resolveResponsive(
      layered.styleOverrides!,
      "bp_tablet",
      tablet.project.breakpoints,
    );
    expect(resolved).toMatchObject({
      fill: { type: "solid", color: "#ff0000" },
      radius: { topLeft: 8 },
      opacity: 0.4,
    });
  });

  it("clears only the selected breakpoint layer and removes the container when empty", () => {
    const fixture = componentFixture();
    const target = { pageId: fixture.pageId };
    const seeded = run(fixture.project, (draft) => {
      updateInstanceStyle(draft, {
        ...target,
        nodeId: fixture.instanceId,
        breakpointId: "bp_desktop",
        patch: { opacity: 0.5 },
      });
      updateInstanceStyle(draft, {
        ...target,
        nodeId: fixture.instanceId,
        breakpointId: "bp_tablet",
        patch: { opacity: 0.25 },
      });
    });

    const clearedDesktop = run(seeded.project, (draft) =>
      clearInstanceStyleOverrides(draft, {
        ...target,
        nodeId: fixture.instanceId,
        breakpointId: "bp_desktop",
      }),
    );
    const afterDesktop = instanceOf(clearedDesktop.project, fixture.instanceId);
    expect(afterDesktop.styleOverrides?.base).toEqual({});
    expect(afterDesktop.styleOverrides?.overrides.bp_tablet).toMatchObject({ opacity: 0.25 });

    const clearedTablet = run(clearedDesktop.project, (draft) =>
      clearInstanceStyleOverrides(draft, {
        ...target,
        nodeId: fixture.instanceId,
        breakpointId: "bp_tablet",
      }),
    );
    expect(instanceOf(clearedTablet.project, fixture.instanceId).styleOverrides).toBeUndefined();
  });

  it("requires a component instance and a known breakpoint", () => {
    const fixture = componentFixture();
    const target = { pageId: fixture.pageId };

    expect(() =>
      run(fixture.project, (draft) =>
        updateInstanceStyle(draft, {
          ...target,
          nodeId: fixture.rootId,
          breakpointId: "bp_desktop",
          patch: { opacity: 0.5 },
        }),
      ),
    ).toThrow(/component instance/);

    expect(() =>
      run(fixture.project, (draft) =>
        updateInstanceStyle(draft, {
          ...target,
          nodeId: fixture.instanceId,
          breakpointId: "bp_missing",
          patch: { opacity: 0.5 },
        }),
      ),
    ).toThrow(/Breakpoint/);

    expect(() =>
      run(fixture.project, (draft) =>
        clearInstanceStyleOverrides(draft, {
          ...target,
          nodeId: fixture.instanceId,
          breakpointId: "bp_missing",
        }),
      ),
    ).toThrow(/Breakpoint/);
  });
});

describe("instance override robustness", () => {
  it("removes instance style-override layers with their breakpoint", () => {
    const fixture = componentFixture();
    const seeded = run(fixture.project, (draft) => {
      addColorStyle(draft, { id: "style_a", name: "A", color: "#111111", opacity: 1 });
      updateInstanceStyle(draft, {
        pageId: fixture.pageId,
        nodeId: fixture.instanceId,
        breakpointId: "bp_tablet",
        patch: { fill: { type: "solid", color: "#111111", opacity: 1, styleId: "style_a" } },
      });
    }).project;
    expect(countColorStyleUsages(seeded, "style_a")).toBe(1);

    const removed = run(seeded, (draft) => removeBreakpoint(draft, "bp_tablet")).project;
    const instance = findNode(removed.pages[0]!.root, fixture.instanceId);
    if (instance?.type !== "componentInstance") throw new Error("Expected the instance");
    expect(instance.styleOverrides?.overrides.bp_tablet).toBeUndefined();
    expect(instance.styleOverrides).toBeUndefined();
    expect(countColorStyleUsages(removed, "style_a")).toBe(0);
  });

  it("ends the color-link chain at an explicit fill:null override", () => {
    const fixture = componentFixture();
    const seeded = run(fixture.project, (draft) => {
      addColorStyle(draft, { id: "style_a", name: "A", color: "#111111", opacity: 1 });
      updateInstanceStyle(draft, {
        pageId: fixture.pageId,
        nodeId: fixture.instanceId,
        breakpointId: "bp_desktop",
        patch: { fill: { type: "solid", color: "#111111", opacity: 1, styleId: "style_a" } },
      });
      updateInstanceStyle(draft, {
        pageId: fixture.pageId,
        nodeId: fixture.instanceId,
        breakpointId: "bp_tablet",
        patch: { fill: null },
      });
      updateInstanceStyle(draft, {
        pageId: fixture.pageId,
        nodeId: fixture.instanceId,
        breakpointId: "bp_phone",
        patch: { fill: { type: "solid", color: "#abcdef", opacity: 1 } },
      });
    }).project;

    const updated = run(seeded, (draft) =>
      updateColorStyle(draft, "style_a", { color: "#ff0000" }),
    ).project;
    const instance = findNode(updated.pages[0]!.root, fixture.instanceId);
    if (instance?.type !== "componentInstance") throw new Error("Expected the instance");
    const phoneFill = instance.styleOverrides?.overrides.bp_phone?.fill;
    if (phoneFill?.type !== "solid") throw new Error("Expected the phone fill");
    expect(phoneFill.color).toBe("#abcdef");
  });

  it("handles sparse linked fills in instance overrides", () => {
    const fixture = componentFixture();
    const seeded = run(fixture.project, (draft) => {
      addColorStyle(draft, { id: "style_a", name: "A", color: "#111111", opacity: 1 });
      updateInstanceStyle(draft, {
        pageId: fixture.pageId,
        nodeId: fixture.instanceId,
        breakpointId: "bp_desktop",
        patch: { fill: { styleId: "style_a" } },
      });
    }).project;
    expect(countColorStyleUsages(seeded, "style_a")).toBe(1);

    const recolored = run(seeded, (draft) =>
      updateColorStyle(draft, "style_a", { color: "#ff0000", opacity: 0.5 }),
    ).project;
    const instance = findNode(recolored.pages[0]!.root, fixture.instanceId);
    if (instance?.type !== "componentInstance") throw new Error("Expected the instance");
    const fill = instance.styleOverrides?.base.fill;
    if (!fill) throw new Error("Expected the sparse fill");
    expect(fill).toMatchObject({ color: "#ff0000", opacity: 0.5, styleId: "style_a" });

    const removed = run(recolored, (draft) => removeColorStyle(draft, "style_a")).project;
    const after = findNode(removed.pages[0]!.root, fixture.instanceId);
    if (after?.type !== "componentInstance") throw new Error("Expected the instance");
    expect(after.styleOverrides?.base.fill).toMatchObject({ styleId: null });
  });
});

describe("instance color-style overrides", () => {
  function instanceOf(project: Project, nodeId: string) {
    const node = getNode(project, nodeId);
    if (node.type !== "componentInstance") throw new Error("Expected a component instance.");
    return node;
  }

  /**
   * Links the variant root and the instance's desktop override to one style,
   * and optionally adds narrower instance layers.
   */
  function seed(
    extra?: (draft: Draft<Project>, target: { pageId: string; nodeId: string }) => void,
  ) {
    const fixture = componentFixture();
    const target = { pageId: fixture.pageId, nodeId: fixture.instanceId };
    const variant = variantOf(fixture.project, fixture.componentId, fixture.variantId);
    const seeded = run(fixture.project, (draft) => {
      const styleId = addColorStyle(draft, { name: "Brand", color: "#111111", opacity: 1 });
      updateBoxProps(draft, {
        componentId: fixture.componentId,
        variantId: fixture.variantId,
        nodeId: variant.root.id,
        breakpointId: "bp_desktop",
        patch: {
          style: {
            fill: { type: "solid", color: "#111111", opacity: 1, styleId },
          },
        },
      });
      updateInstanceStyle(draft, {
        ...target,
        breakpointId: "bp_desktop",
        patch: { fill: { type: "solid", color: "#111111", opacity: 1, styleId } },
      });
      extra?.(draft, target);
      return styleId;
    });
    return { ...fixture, ...seeded };
  }

  it("propagates edits into the instance override layer and counts the instance once", () => {
    const { project, result: styleId, instanceId } = seed();
    expect(countColorStyleUsages(project, styleId)).toBe(2);

    const updated = run(project, (draft) =>
      updateColorStyle(draft, styleId, { color: "#ff0000", opacity: 0.5 }),
    ).project;
    const fill = instanceOf(updated, instanceId).styleOverrides?.base.fill;
    expect(fill).toMatchObject({ type: "solid", color: "#ff0000", opacity: 0.5, styleId });
  });

  it("follows the override cascade and stops at a different style id", () => {
    const seeded = seed((draft, target) => {
      const otherId = addColorStyle(draft, { name: "Other", color: "#00ff00", opacity: 1 });
      updateInstanceStyle(draft, {
        ...target,
        breakpointId: "bp_tablet",
        patch: { fill: { type: "solid", color: "#00ff00", opacity: 1, styleId: otherId } },
      });
      // A narrower layer without its own id inherits whatever tablet linked.
      updateInstanceStyle(draft, {
        ...target,
        breakpointId: "bp_phone",
        patch: { fill: { type: "solid", color: "#abcdef", opacity: 1 } },
      });
    });

    const updated = run(seeded.project, (draft) =>
      updateColorStyle(draft, seeded.result, { color: "#0000ff" }),
    ).project;
    const overrides = instanceOf(updated, seeded.instanceId).styleOverrides!;
    expect(overrides.base.fill).toMatchObject({ color: "#0000ff" });
    expect(overrides.overrides.bp_tablet?.fill).toMatchObject({ color: "#00ff00" });
    expect(overrides.overrides.bp_phone?.fill).toMatchObject({ color: "#abcdef" });
  });

  it("stops the chain at a gradient override", () => {
    const seeded = seed((draft, target) => {
      updateInstanceStyle(draft, {
        ...target,
        breakpointId: "bp_tablet",
        patch: {
          fill: {
            type: "linear-gradient",
            angle: 90,
            stops: [
              { color: "#111111", position: 0 },
              { color: "#222222", position: 100 },
            ],
          },
        },
      });
      updateInstanceStyle(draft, {
        ...target,
        breakpointId: "bp_phone",
        patch: { fill: { type: "solid", color: "#abcdef", opacity: 1 } },
      });
    });

    const updated = run(seeded.project, (draft) =>
      updateColorStyle(draft, seeded.result, { color: "#0000ff" }),
    ).project;
    const overrides = instanceOf(updated, seeded.instanceId).styleOverrides!;
    expect(overrides.overrides.bp_phone?.fill).toMatchObject({ color: "#abcdef" });
  });

  it("detaches every instance override layer without recoloring", () => {
    const seeded = seed((draft, target) => {
      updateInstanceStyle(draft, {
        ...target,
        breakpointId: "bp_tablet",
        patch: {
          fill: { type: "solid", color: "#111111", opacity: 1, styleId: seededStyleId(draft) },
        },
      });
    });
    const removed = run(seeded.project, (draft) =>
      removeColorStyle(draft, seeded.result),
    ).project;
    const overrides = instanceOf(removed, seeded.instanceId).styleOverrides!;
    expect(overrides.base.fill).toMatchObject({ color: "#111111", styleId: null });
    expect(overrides.overrides.bp_tablet?.fill).toMatchObject({
      color: "#111111",
      styleId: null,
    });
    expect(countColorStyleUsages(removed, seeded.result)).toBe(0);
  });
});

/** The first color style's id while seeding, for tests that link two layers. */
function seededStyleId(draft: Draft<Project>): string {
  const style = draft.colorStyles[0];
  if (!style) throw new Error("Expected a seeded color style.");
  return style.id;
}

describe("color styles", () => {
  it("adds a trimmed, validated style and rejects duplicates and bad values", () => {
    const base = createProject();
    const { project, result: id } = run(base, (draft) =>
      addColorStyle(draft, { name: "  Brand  ", color: "#112233", opacity: 0.5 }),
    );

    expect(project.colorStyles).toHaveLength(1);
    expect(project.colorStyles[0]).toMatchObject({
      id,
      name: "Brand",
      color: "#112233",
      opacity: 0.5,
    });

    expect(() =>
      run(base, (draft) => addColorStyle(draft, { name: "", color: "#fff", opacity: 1 })),
    ).toThrow(/cannot be empty/);
    expect(() =>
      run(base, (draft) => addColorStyle(draft, { name: "X", color: "#fff", opacity: 2 })),
    ).toThrow(/0 to 1/);
    expect(() =>
      run(project, (draft) => addColorStyle(draft, { name: "brand", color: "#fff", opacity: 1 })),
    ).toThrow(/already exists/);
  });

  it("propagates color/opacity updates across pages and component variants", () => {
    const fixture = componentFixture();
    const componentRoot = fixture.project.components[0]!.variants[0]!.root;
    const cardNodeId = componentRoot.id;
    const labelNodeId = componentRoot.children.find((child) => child.type === "text")!.id;
    const withStyle = run(fixture.project, (draft) =>
      addColorStyle(draft, { name: "Brand", color: "#000000", opacity: 1 }),
    ).project;
    const styleId = withStyle.colorStyles[0]!.id;

    const withSecondPage = run(withStyle, (draft) =>
      addPage(draft, { name: "About", path: "/about" }),
    ).project;
    const secondPage = withSecondPage.pages[1]!;

    const seeded = run(withSecondPage, (draft) => {
      insertNode(draft, {
        pageId: fixture.pageId,
        parentId: fixture.rootId,
        node: createFrame({
          id: "page_frame",
          props: {
            style: { fill: { type: "solid", color: "#000000", opacity: 1, styleId } },
          },
        }),
      });
      insertNode(draft, {
        pageId: fixture.pageId,
        parentId: fixture.rootId,
        node: createFrame({
          id: "unlinked_frame",
          props: {
            style: { fill: { type: "solid", color: "#00ff00", opacity: 1 } },
          },
        }),
      });
      insertNode(draft, {
        pageId: secondPage.id,
        parentId: secondPage.root.id,
        node: createFrame({
          id: "second_frame",
          props: {
            style: { fill: { type: "solid", color: "#000000", opacity: 1, styleId } },
          },
        }),
      });
      updateBoxProps(draft, {
        componentId: fixture.componentId,
        variantId: fixture.variantId,
        nodeId: cardNodeId,
        breakpointId: "bp_desktop",
        patch: { style: { fill: { type: "solid", color: "#000000", opacity: 1, styleId } } },
      });
      updateTextProps(draft, {
        componentId: fixture.componentId,
        variantId: fixture.variantId,
        nodeId: labelNodeId,
        breakpointId: "bp_desktop",
        patch: { colorStyleId: styleId },
      });
      // A breakpoint-specific fill without its own styleId inherits the link
      // from the base fill and must update too.
      updateBoxProps(draft, {
        pageId: fixture.pageId,
        nodeId: "page_frame",
        breakpointId: "bp_phone",
        patch: { style: { fill: { type: "solid", color: "#000000", opacity: 1 } } },
      });
    }).project;

    expect(countColorStyleUsages(seeded, styleId)).toBe(4);

    const { project: updated } = run(seeded, (draft) =>
      updateColorStyle(draft, styleId, { name: "Brand 2", color: "#ff0000", opacity: 0.25 }),
    );

    expect(updated.colorStyles[0]).toMatchObject({
      name: "Brand 2",
      color: "#ff0000",
      opacity: 0.25,
    });

    const pageFill = getFrameNode(updated, "page_frame").responsive.base.style.fill;
    if (pageFill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(pageFill).toMatchObject({ color: "#ff0000", opacity: 0.25, styleId });

    const secondFill = (findNode(updated.pages[1]!.root, "second_frame") as FrameNode).responsive
      .base.style.fill;
    if (secondFill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(secondFill).toMatchObject({ color: "#ff0000", opacity: 0.25, styleId });

    const cardFill = updated.components[0]!.variants[0]!.root.responsive.base.style.fill;
    if (cardFill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(cardFill.color).toBe("#ff0000");

    const label = findNode(updated.components[0]!.variants[0]!.root, labelNodeId);
    if (label?.type !== "text") throw new Error("Expected the component label");
    expect(label.responsive.base.text.color).toBe("#ff0000");
    expect(label.responsive.base.colorStyleId).toBe(styleId);

    const phoneFill = getFrameNode(updated, "page_frame").responsive.overrides.bp_phone?.style
      ?.fill;
    if (phoneFill?.type !== "solid") throw new Error("Expected the override fill");
    expect(phoneFill).toMatchObject({ color: "#ff0000", opacity: 0.25 });

    // Unlinked fills are untouched.
    const unlinked = getFrameNode(updated, "unlinked_frame").responsive.base.style.fill;
    if (unlinked?.type !== "solid") throw new Error("Expected a solid fill");
    expect(unlinked).toMatchObject({ color: "#00ff00", opacity: 1 });
    expect(unlinked.styleId).toBeUndefined();
  });

  it("removes a style and clears references while keeping the last color", () => {
    const fixture = componentFixture();
    const componentRoot = fixture.project.components[0]!.variants[0]!.root;
    const cardNodeId = componentRoot.id;
    const labelNodeId = componentRoot.children.find((child) => child.type === "text")!.id;
    const seeded = run(fixture.project, (draft) => {
      const styleId = addColorStyle(draft, { name: "Brand", color: "#336699", opacity: 0.8 });
      updateBoxProps(draft, {
        componentId: fixture.componentId,
        variantId: fixture.variantId,
        nodeId: cardNodeId,
        breakpointId: "bp_desktop",
        patch: { style: { fill: { type: "solid", color: "#336699", opacity: 0.8, styleId } } },
      });
      updateTextProps(draft, {
        componentId: fixture.componentId,
        variantId: fixture.variantId,
        nodeId: labelNodeId,
        breakpointId: "bp_desktop",
        patch: { text: { color: "#336699" }, colorStyleId: styleId },
      });
      return styleId;
    });
    const styleId = seeded.result;

    const { project: removed } = run(seeded.project, (draft) => removeColorStyle(draft, styleId));

    expect(removed.colorStyles).toHaveLength(0);
    const variantRoot = removed.components[0]!.variants[0]!.root;
    const fill = variantRoot.responsive.base.style.fill;
    if (fill?.type !== "solid") throw new Error("Expected a solid fill");
    expect(fill).toMatchObject({ color: "#336699", opacity: 0.8 });
    expect(fill.styleId).toBeNull();

    const label = findNode(variantRoot, labelNodeId);
    if (label?.type !== "text") throw new Error("Expected a text node");
    expect(label.responsive.base.text.color).toBe("#336699");
    expect(label.responsive.base.colorStyleId).toBeNull();
  });

  it("follows the breakpoint cascade when links are introduced or detached mid-chain", () => {
    const base = createProject();
    const pageId = base.pages[0]!.id;
    const rootId = base.pages[0]!.root.id;

    const seeded = run(base, (draft) => {
      const styleId = addColorStyle(draft, { name: "Brand", color: "#000000", opacity: 1 });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createFrame({
          id: "cascade",
          props: { style: { fill: { type: "solid", color: "#111111", opacity: 1 } } },
        }),
      });
      // Tablet introduces the link, phone authored earlier stays unlinked.
      updateBoxProps(draft, {
        pageId,
        nodeId: "cascade",
        breakpointId: "bp_tablet",
        patch: { style: { fill: { type: "solid", color: "#111111", opacity: 1, styleId } } },
      });
      updateBoxProps(draft, {
        pageId,
        nodeId: "cascade",
        breakpointId: "bp_phone",
        patch: { style: { fill: { type: "solid", color: "#222222", opacity: 1 } } },
      });
      return styleId;
    });
    const styleId = seeded.result;

    const updated = run(seeded.project, (draft) =>
      updateColorStyle(draft, styleId, { color: "#ff0000" }),
    ).project;
    const cascade = getFrameNode(updated, "cascade");
    const tablet = cascade.responsive.overrides.bp_tablet?.style?.fill;
    const phone = cascade.responsive.overrides.bp_phone?.style?.fill;
    if (tablet?.type !== "solid" || phone?.type !== "solid") throw new Error("Expected fills");
    expect(tablet).toMatchObject({ color: "#ff0000", styleId });
    // The phone override inherits the tablet link through the cascade.
    expect(phone).toMatchObject({ color: "#ff0000" });
    const resolved = resolveNodeProps(cascade, "bp_phone", updated.breakpoints);
    expect(resolved.style.fill).toMatchObject({ type: "solid", color: "#ff0000", styleId });

    // A mid-chain detach must stop propagation into narrower breakpoints.
    const detached = run(seeded.project, (draft) => {
      updateBoxProps(draft, {
        pageId,
        nodeId: "cascade",
        breakpointId: "bp_tablet",
        patch: {
          style: { fill: { type: "solid", color: "#111111", opacity: 1, styleId: null } },
        },
      });
    }).project;
    const recolored = run(detached, (draft) =>
      updateColorStyle(draft, styleId, { color: "#0000ff" }),
    ).project;
    const detachedNode = getFrameNode(recolored, "cascade");
    const detachedTablet = detachedNode.responsive.overrides.bp_tablet?.style?.fill;
    const detachedPhone = detachedNode.responsive.overrides.bp_phone?.style?.fill;
    if (detachedTablet?.type !== "solid" || detachedPhone?.type !== "solid") {
      throw new Error("Expected fills");
    }
    expect(detachedTablet).toMatchObject({ color: "#111111", styleId: null });
    expect(detachedPhone).toMatchObject({ color: "#222222" });
    const detachedResolved = resolveNodeProps(detachedNode, "bp_phone", recolored.breakpoints);
    expect(detachedResolved.style.fill).toMatchObject({ type: "solid", color: "#222222" });
  });

  it("propagates text colors through intermediate breakpoint links", () => {
    const base = createProject();
    const pageId = base.pages[0]!.id;
    const rootId = base.pages[0]!.root.id;

    const seeded = run(base, (draft) => {
      const styleId = addColorStyle(draft, { name: "Brand", color: "#000000", opacity: 1 });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({ id: "cascade_text", content: "Cascade" }),
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "cascade_text",
        breakpointId: "bp_tablet",
        patch: { colorStyleId: styleId },
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "cascade_text",
        breakpointId: "bp_phone",
        patch: { text: { color: "#222222" } },
      });
      return styleId;
    });
    const styleId = seeded.result;

    const updated = run(seeded.project, (draft) =>
      updateColorStyle(draft, styleId, { color: "#ff0000" }),
    ).project;
    const text = findNode(updated.pages[0]!.root, "cascade_text");
    if (text?.type !== "text") throw new Error("Expected the text node");
    expect(text.responsive.base.text.color).toBe("#000000");
    expect(text.responsive.overrides.bp_tablet).toMatchObject({
      colorStyleId: styleId,
      text: { color: "#ff0000" },
    });
    expect(text.responsive.overrides.bp_phone).toMatchObject({
      text: { color: "#ff0000" },
    });
    expect(text.responsive.overrides.bp_phone?.colorStyleId).toBeUndefined();
    const resolved = resolveNodeProps(text, "bp_phone", updated.breakpoints);
    expect(resolved.text.color).toBe("#ff0000");
    expect(resolved.colorStyleId).toBe(styleId);
  });

  it("leaves breakpoints linked to a different color style untouched", () => {
    const base = createProject();
    const pageId = base.pages[0]!.id;
    const rootId = base.pages[0]!.root.id;

    const seeded = run(base, (draft) => {
      addColorStyle(draft, { id: "style_a", name: "A", color: "#111111", opacity: 1 });
      addColorStyle(draft, { id: "style_b", name: "B", color: "#222222", opacity: 1 });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createFrame({
          id: "other_style",
          props: {
            style: { fill: { type: "solid", color: "#111111", opacity: 1, styleId: "style_a" } },
          },
        }),
      });
      updateBoxProps(draft, {
        pageId,
        nodeId: "other_style",
        breakpointId: "bp_tablet",
        patch: {
          style: {
            fill: { type: "solid", color: "#222222", opacity: 1, styleId: "style_b" },
          },
        },
      });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({
          id: "other_text",
          content: "Other",
          props: { text: { color: "#111111" }, colorStyleId: "style_a" },
        }),
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "other_text",
        breakpointId: "bp_tablet",
        patch: { text: { color: "#222222" }, colorStyleId: "style_b" },
      });
    }).project;

    const updated = run(seeded, (draft) =>
      updateColorStyle(draft, "style_a", { color: "#0000ff" }),
    ).project;
    const frame = getFrameNode(updated, "other_style");
    const baseFill = frame.responsive.base.style.fill;
    const tabletFill = frame.responsive.overrides.bp_tablet?.style?.fill;
    if (baseFill?.type !== "solid" || tabletFill?.type !== "solid") {
      throw new Error("Expected fills");
    }
    expect(baseFill).toMatchObject({ color: "#0000ff", styleId: "style_a" });
    expect(tabletFill).toMatchObject({ color: "#222222", styleId: "style_b" });

    const text = findNode(updated.pages[0]!.root, "other_text");
    if (text?.type !== "text") throw new Error("Expected the text node");
    expect(text.responsive.base.text.color).toBe("#0000ff");
    expect(text.responsive.overrides.bp_tablet?.text).toMatchObject({ color: "#222222" });
    expect(text.responsive.overrides.bp_tablet?.colorStyleId).toBe("style_b");
  });

  it("throws for an unknown color style id", () => {
    const base = createProject();
    expect(() =>
      run(base, (draft) => updateColorStyle(draft, "missing", { color: "#fff" })),
    ).toThrow(/was not found/);
    expect(() => run(base, (draft) => removeColorStyle(draft, "missing"))).toThrow(/was not found/);
  });
});

describe("text styles", () => {
  const STYLE_VALUES: TextStyleValues = {
    fontFamily: "Inter",
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 24,
    letterSpacing: 0.5,
    color: "#112233",
    align: "left",
    textTransform: "none",
    textDecoration: "none",
    italic: false,
  };

  it("adds a trimmed, validated style and rejects duplicates and bad values", () => {
    const base = createProject();
    const { project, result: id } = run(base, (draft) =>
      addTextStyle(draft, { name: "  Heading  ", values: STYLE_VALUES }),
    );

    expect(project.textStyles).toHaveLength(1);
    expect(project.textStyles[0]).toMatchObject({
      id,
      name: "Heading",
      values: { fontFamily: "Inter", fontSize: 20, color: "#112233" },
    });

    expect(() =>
      run(base, (draft) => addTextStyle(draft, { name: " ", values: STYLE_VALUES })),
    ).toThrow(/cannot be empty/);
    expect(() =>
      run(base, (draft) =>
        addTextStyle(draft, {
          name: "Bad",
          values: { ...STYLE_VALUES, fontSize: Number.NaN },
        }),
      ),
    ).toThrow(/finite number/);
    expect(() =>
      run(base, (draft) =>
        addTextStyle(draft, { name: "Bad", values: { ...STYLE_VALUES, lineHeight: -1 } }),
      ),
    ).toThrow(/line height/i);
    expect(() =>
      run(base, (draft) => addTextStyle(draft, { name: "Bad", values: { ...STYLE_VALUES, color: "" } })),
    ).toThrow(/color cannot be empty/);
    expect(() =>
      run(project, (draft) =>
        addTextStyle(draft, { name: "heading", values: STYLE_VALUES }),
      ),
    ).toThrow(/already exists/);
  });

  it("propagates changed typography across pages and component variants", () => {
    const fixture = componentFixture();
    const variantRoot = fixture.project.components[0]!.variants[0]!.root;
    const labelNodeId = variantRoot.children.find((child) => child.type === "text")!.id;

    const seeded = run(fixture.project, (draft) => {
      const styleId = addTextStyle(draft, { name: "Heading", values: STYLE_VALUES });
      updateTextProps(draft, {
        componentId: fixture.componentId,
        variantId: fixture.variantId,
        nodeId: labelNodeId,
        breakpointId: "bp_desktop",
        patch: { text: { ...STYLE_VALUES }, textStyleId: styleId },
      });
      const variantId = addComponentVariant(draft, {
        componentId: fixture.componentId,
        name: "Large",
      });
      updateTextProps(draft, {
        componentId: fixture.componentId,
        variantId,
        nodeId: labelNodeId,
        breakpointId: "bp_desktop",
        patch: { textStyleId: styleId },
      });
      const page = addPage(draft, { name: "About", path: "/about" });
      const about = draft.pages.find((candidate) => candidate.id === page)!;
      insertNode(draft, {
        pageId: about.id,
        parentId: about.root.id,
        node: createText({ id: "about_title", content: "About" }),
      });
      updateTextProps(draft, {
        pageId: about.id,
        nodeId: "about_title",
        breakpointId: "bp_desktop",
        patch: { text: { ...STYLE_VALUES }, textStyleId: styleId },
      });
      insertNode(draft, {
        pageId: about.id,
        parentId: about.root.id,
        node: createText({ id: "unlinked_title", content: "Plain" }),
      });
      return styleId;
    });
    const styleId = seeded.result;

    const { project: updated } = run(seeded.project, (draft) =>
      updateTextStyle(draft, styleId, {
        name: "Display",
        values: { fontSize: 32, color: "#ff0000" },
      }),
    );

    expect(updated.textStyles[0]).toMatchObject({
      name: "Display",
      values: { fontSize: 32, color: "#ff0000", fontWeight: 600 },
    });

    for (const variant of updated.components[0]!.variants) {
      const label = findNode(variant.root, labelNodeId);
      if (label?.type !== "text") throw new Error("Expected the component label");
      expect(label.responsive.base.textStyleId).toBe(styleId);
      expect(label.responsive.base.text).toMatchObject({ fontSize: 32, color: "#ff0000" });
    }

    const aboutPage = updated.pages.find((page) => page.name === "About")!;
    const aboutTitle = findNode(aboutPage.root, "about_title");
    if (aboutTitle?.type !== "text") throw new Error("Expected the About title");
    expect(aboutTitle.responsive.base.text).toMatchObject({ fontSize: 32, color: "#ff0000" });

    const unlinked = findNode(aboutPage.root, "unlinked_title");
    if (unlinked?.type !== "text") throw new Error("Expected the unlinked title");
    expect(unlinked.responsive.base.text.fontSize).toBe(16);
    expect(unlinked.responsive.base.textStyleId).toBeUndefined();
  });

  it("follows the breakpoint cascade and lets a color style win for color", () => {
    const base = createProject();
    const pageId = base.pages[0]!.id;
    const rootId = base.pages[0]!.root.id;

    const seeded = run(base, (draft) => {
      const styleId = addTextStyle(draft, { name: "Heading", values: STYLE_VALUES });
      addColorStyle(draft, { id: "color_1", name: "Brand", color: "#00ff00", opacity: 1 });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({ id: "cascade_text", content: "Cascade" }),
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "cascade_text",
        breakpointId: "bp_desktop",
        patch: { text: { ...STYLE_VALUES }, textStyleId: styleId },
      });
      // Tablet keeps both links: the color style wins for color only.
      updateTextProps(draft, {
        pageId,
        nodeId: "cascade_text",
        breakpointId: "bp_tablet",
        patch: { textStyleId: styleId, colorStyleId: "color_1", text: { color: "#00ff00" } },
      });
      // Phone detaches the text style; it must not receive any values.
      updateTextProps(draft, {
        pageId,
        nodeId: "cascade_text",
        breakpointId: "bp_phone",
        patch: { textStyleId: null },
      });
      // A second node links only at tablet, through a textStyleId-only patch.
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({ id: "midlink_text", content: "Mid" }),
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "midlink_text",
        breakpointId: "bp_tablet",
        patch: { textStyleId: styleId },
      });
      return styleId;
    });
    const styleId = seeded.result;

    const updated = run(seeded.project, (draft) =>
      updateTextStyle(draft, styleId, { values: { fontSize: 28, color: "#ff0000" } }),
    ).project;

    const cascade = findNode(updated.pages[0]!.root, "cascade_text");
    if (cascade?.type !== "text") throw new Error("Expected the text node");
    expect(cascade.responsive.base.text).toMatchObject({ fontSize: 28, color: "#ff0000" });
    expect(cascade.responsive.overrides.bp_tablet).toMatchObject({
      textStyleId: styleId,
      colorStyleId: "color_1",
      text: { fontSize: 28, color: "#00ff00" },
    });
    expect(cascade.responsive.overrides.bp_phone).toMatchObject({
      textStyleId: null,
    });
    expect(cascade.responsive.overrides.bp_phone?.text?.fontSize).toBeUndefined();

    const midlink = findNode(updated.pages[0]!.root, "midlink_text");
    if (midlink?.type !== "text") throw new Error("Expected the mid-link text node");
    expect(midlink.responsive.base.text.fontSize).toBe(16);
    expect(midlink.responsive.overrides.bp_tablet).toMatchObject({
      textStyleId: styleId,
      text: { fontSize: 28, color: "#ff0000" },
    });
    // Phone inherits the tablet link and values through the cascade; no
    // override is needed there.
    const resolvedPhone = resolveNodeProps(midlink, "bp_phone", updated.breakpoints);
    expect(resolvedPhone.textStyleId).toBe(styleId);
    expect(resolvedPhone.text).toMatchObject({ fontSize: 28, color: "#ff0000" });
  });

  it("removes a style and clears references while keeping typography", () => {
    const base = createProject();
    const pageId = base.pages[0]!.id;
    const rootId = base.pages[0]!.root.id;

    const seeded = run(base, (draft) => {
      const styleId = addTextStyle(draft, { name: "Heading", values: STYLE_VALUES });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({ id: "remove_text", content: "Remove" }),
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "remove_text",
        breakpointId: "bp_desktop",
        patch: { text: { ...STYLE_VALUES }, textStyleId: styleId },
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "remove_text",
        breakpointId: "bp_tablet",
        patch: { textStyleId: styleId },
      });
      return styleId;
    });
    const styleId = seeded.result;

    const removed = run(seeded.project, (draft) => removeTextStyle(draft, styleId)).project;
    expect(removed.textStyles).toHaveLength(0);

    const text = findNode(removed.pages[0]!.root, "remove_text");
    if (text?.type !== "text") throw new Error("Expected the text node");
    expect(text.responsive.base.textStyleId).toBeNull();
    expect(text.responsive.overrides.bp_tablet?.textStyleId).toBeNull();
    expect(text.responsive.base.text).toMatchObject({
      fontFamily: "Inter",
      fontSize: 20,
      color: "#112233",
    });
  });

  it("counts a layer once across breakpoints and ignores unlinked layers", () => {
    const base = createProject();
    const pageId = base.pages[0]!.id;
    const rootId = base.pages[0]!.root.id;

    const seeded = run(base, (draft) => {
      const styleId = addTextStyle(draft, { name: "Heading", values: STYLE_VALUES });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({ id: "count_one", content: "One" }),
      });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({ id: "count_two", content: "Two" }),
      });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({ id: "count_plain", content: "Plain" }),
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "count_one",
        breakpointId: "bp_desktop",
        patch: { textStyleId: styleId },
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "count_one",
        breakpointId: "bp_phone",
        patch: { textStyleId: styleId },
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "count_two",
        breakpointId: "bp_tablet",
        patch: { textStyleId: styleId },
      });
      return styleId;
    });

    expect(countTextStyleUsages(seeded.project, seeded.result)).toBe(2);
    expect(countTextStyleUsages(seeded.project, "missing")).toBe(0);
  });

  it("does not overwrite breakpoints linked to a different text style", () => {
    const base = createProject();
    const pageId = base.pages[0]!.id;
    const rootId = base.pages[0]!.root.id;
    const valuesA = {
      fontFamily: "Inter",
      fontSize: 20,
      fontWeight: 400,
      lineHeight: "auto" as const,
      letterSpacing: 0,
      color: "#111111",
      align: "left" as const,
      textTransform: "none" as const,
      textDecoration: "none" as const,
      italic: false,
    };
    const valuesB = { ...valuesA, fontFamily: "Poppins", fontSize: 40, color: "#222222" };

    const seeded = run(base, (draft) => {
      addTextStyle(draft, { id: "text_a", name: "Heading", values: valuesA });
      addTextStyle(draft, { id: "text_b", name: "Body", values: valuesB });
      insertNode(draft, {
        pageId,
        parentId: rootId,
        node: createText({
          id: "mixed_style",
          content: "Mixed",
          props: { text: valuesA, textStyleId: "text_a" },
        }),
      });
      updateTextProps(draft, {
        pageId,
        nodeId: "mixed_style",
        breakpointId: "bp_tablet",
        patch: { text: valuesB, textStyleId: "text_b" },
      });
    }).project;

    const updated = run(seeded, (draft) =>
      updateTextStyle(draft, "text_a", { values: { fontSize: 24, color: "#999999" } }),
    ).project;
    const node = findNode(updated.pages[0]!.root, "mixed_style");
    if (node?.type !== "text") throw new Error("Expected the text node");
    expect(node.responsive.base.text).toMatchObject({ fontSize: 24, color: "#999999" });
    const tablet = node.responsive.overrides.bp_tablet;
    expect(tablet?.text).toMatchObject({
      fontFamily: "Poppins",
      fontSize: 40,
      color: "#222222",
    });
    expect(tablet?.textStyleId).toBe("text_b");
    const resolved = resolveNodeProps(node, "bp_tablet", updated.breakpoints);
    expect(resolved.text).toMatchObject({ fontFamily: "Poppins", fontSize: 40, color: "#222222" });
  });

  it("throws for an unknown text style id", () => {
    const base = createProject();
    expect(() =>
      run(base, (draft) => updateTextStyle(draft, "missing", { name: "X" })),
    ).toThrow(/was not found/);
    expect(() => run(base, (draft) => removeTextStyle(draft, "missing"))).toThrow(/was not found/);
  });
});
