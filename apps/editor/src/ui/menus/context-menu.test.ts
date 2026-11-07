import {
  createFrame,
  createImage,
  createProject,
  createText,
  type FrameNode,
  findNode,
  type SceneNode,
} from "@webfm/model";
import { describe, expect, it } from "vitest";
import { activeSceneOf } from "../../state/project-store";
import {
  automaticName,
  cloneNodeWithFreshIds,
  filterMenuEntries,
  type MenuEntry,
  menuItem,
  menuSeparator,
  selectAvailability,
  sortSceneAlphabetically,
  stripSeparators,
  topLevelNodeIds,
  uniqueBreakpointName,
} from "./context-actions";

function idsOf(node: SceneNode): string[] {
  const ids = [node.id];
  if (node.type === "frame") {
    for (const child of node.children) ids.push(...idsOf(child));
  }
  return ids;
}

describe("context menu helpers", () => {
  it("clones a subtree with fresh ids at every level", () => {
    const frame = createFrame({
      id: "node_parent",
      name: "Card",
      children: [
        createFrame({ id: "node_child", name: "Header" }),
        createText({ id: "node_label", content: "Hello" }),
      ],
    });

    const clone = cloneNodeWithFreshIds(frame);
    const originalIds = idsOf(frame);
    const cloneIds = idsOf(clone);

    expect(cloneIds).toHaveLength(originalIds.length);
    expect(cloneIds.some((id) => originalIds.includes(id))).toBe(false);
    expect(new Set(cloneIds).size).toBe(cloneIds.length);
    expect(clone.name).toBe("Card");
    expect((clone as FrameNode).children[1]?.name).toBe("Hello");
  });

  it("keeps only the highest selected nodes that still exist", () => {
    const root = createFrame({
      id: "node_root",
      children: [
        createFrame({
          id: "node_parent",
          children: [createFrame({ id: "node_child" })],
        }),
        createFrame({ id: "node_other" }),
      ],
    });

    expect(topLevelNodeIds(root, ["node_child", "node_parent", "node_other"])).toEqual([
      "node_parent",
      "node_other",
    ]);
    expect(topLevelNodeIds(root, ["node_root", "node_missing"])).toEqual([]);
  });

  it("sorts every frame's children by name and keeps the root in place", () => {
    const root = createFrame({
      id: "node_root",
      name: "Desktop",
      children: [
        createFrame({
          id: "node_b",
          name: "Beta",
          children: [
            createFrame({ id: "node_z", name: "Zebra" }),
            createFrame({ id: "node_a", name: "Alpha" }),
          ],
        }),
        createFrame({ id: "node_a2", name: "alpha" }),
        createFrame({ id: "node_c", name: "Charlie" }),
      ],
    });

    sortSceneAlphabetically(root);

    expect(root.id).toBe("node_root");
    expect(root.children.map((child) => child.name)).toEqual(["alpha", "Beta", "Charlie"]);
    const nested = findNode(root, "node_b");
    expect(nested?.type === "frame" ? nested.children.map((child) => child.name) : []).toEqual([
      "Alpha",
      "Zebra",
    ]);
  });

  it("numbers duplicate breakpoint names", () => {
    expect(uniqueBreakpointName(["Desktop"], "Tablet")).toBe("Tablet");
    expect(uniqueBreakpointName(["Tablet"], "Tablet")).toBe("Tablet 2");
    expect(uniqueBreakpointName(["Tablet", "Tablet 2", "Tablet 3"], "Tablet")).toBe("Tablet 4");
  });

  it("strips leading, trailing and doubled separators", () => {
    const entries: MenuEntry[] = [
      menuSeparator,
      menuItem("Copy"),
      menuSeparator,
      menuSeparator,
      menuItem("Paste"),
      menuSeparator,
    ];

    expect(stripSeparators(entries).map((entry) => entry.kind)).toEqual([
      "item",
      "separator",
      "item",
    ]);
  });

  it("filters top-level and submenu labels and keeps the parent", () => {
    const entries: MenuEntry[] = [
      menuItem("Add to agent", { disabled: true }),
      menuItem("Copy", {
        children: [
          menuItem("Copy"),
          menuItem("Copy style", { shortcut: "Ctrl+Alt+C" }),
          menuItem("Copy fill"),
        ],
      }),
      menuSeparator,
      menuItem("Delete"),
    ];

    const style = filterMenuEntries(entries, "style");
    expect(style).toHaveLength(1);
    const copy = style[0];
    expect(copy?.kind === "item" ? copy.label : null).toBe("Copy");
    const childLabels =
      copy?.kind === "item"
        ? (copy.children ?? []).flatMap((child) => (child.kind === "item" ? [child.label] : []))
        : [];
    expect(childLabels).toEqual(["Copy style"]);

    // Matching the parent keeps every child.
    const parent = filterMenuEntries(entries, "copy");
    expect(parent).toHaveLength(1);
    expect(parent[0]?.kind === "item" ? parent[0].children?.length : 0).toBe(3);

    // Empty results and separators disappear.
    expect(filterMenuEntries(entries, "zzz")).toEqual([]);
    expect(filterMenuEntries(entries, "delete").map((entry) => entry.kind)).toEqual(["item"]);
  });

  it("reports what each Select entry can select", () => {
    const root = createFrame({
      id: "node_root",
      children: [createFrame({ id: "node_frame", children: [createText({ id: "node_text" })] })],
    });

    const frame = findNode(root, "node_frame");
    if (!frame) throw new Error("fixture frame missing");

    expect(selectAvailability(root, root)).toEqual({
      parent: false,
      siblings: false,
      children: true,
      textLayers: true,
    });
    expect(selectAvailability(frame, root)).toEqual({
      parent: true,
      siblings: true,
      children: true,
      textLayers: true,
    });
  });

  it("derives automatic names from content, type and layout", () => {
    const project = createProject({ name: "Demo", now: "2026-01-01T00:00:00.000Z" });
    const page = project.pages[0];
    const breakpoint = project.breakpoints[0];
    if (!page || !breakpoint) throw new Error("fixture project is incomplete");
    const scene = activeSceneOf(project, page.id, null);
    if (!scene) throw new Error("fixture scene is missing");
    const context = { project, breakpointId: breakpoint.id, scene };

    const text = createText({ content: "A fairly long heading for a card" });
    expect(automaticName(context, text)).toBe("A fairly long heading fo");

    expect(automaticName(context, createFrame({ props: { layout: { mode: "stack" } } }))).toBe(
      "Stack",
    );
    expect(automaticName(context, createFrame({ props: { layout: { mode: "grid" } } }))).toBe(
      "Grid",
    );
    expect(automaticName(context, createFrame())).toBe("Frame");
    expect(automaticName(context, createImage())).toBe("Image");
  });
});
