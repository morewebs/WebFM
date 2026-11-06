import { describe, expect, it } from "vitest";
import {
  DEFAULT_BREAKPOINTS,
  createFrame,
  createProject,
  createText,
  mergeDeep,
  resolveNodeProps,
} from "./defaults";
import { findNode, findParent, indexOfNode, isSelfOrDescendant, nodePath } from "./tree";
import { SCHEMA_VERSION, type Fill } from "./types";

function solid(fill: Fill | null): string | null {
  return fill && fill.type === "solid" ? fill.color : null;
}

describe("createProject", () => {
  it("creates one page with a full-width root frame and the default breakpoints", () => {
    const project = createProject({ name: "Test", now: "2026-01-01T00:00:00.000Z" });

    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.name).toBe("Test");
    expect(project.version).toBe(1);
    expect(project.breakpoints).toEqual(DEFAULT_BREAKPOINTS);
    expect(project.pages).toHaveLength(1);

    const page = project.pages[0]!;
    expect(page.path).toBe("/");
    expect(page.root.type).toBe("frame");
    expect(page.root.responsive.base.size.width).toEqual({ mode: "fill" });
  });
});

describe("responsive resolution", () => {
  it("cascades base, tablet then phone overrides", () => {
    const node = createFrame({
      props: { style: { fill: { type: "solid", color: "#111111", opacity: 1 } } },
    });
    node.responsive.overrides.bp_tablet = { size: { width: { mode: "fixed", value: 600 } } };
    node.responsive.overrides.bp_phone = {
      style: { fill: { type: "solid", color: "#222222", opacity: 1 } },
    };

    const desktop = resolveNodeProps(node, "bp_desktop", DEFAULT_BREAKPOINTS);
    const tablet = resolveNodeProps(node, "bp_tablet", DEFAULT_BREAKPOINTS);
    const phone = resolveNodeProps(node, "bp_phone", DEFAULT_BREAKPOINTS);

    expect(desktop.size.width).toEqual({ mode: "fixed", value: 400 });
    expect(tablet.size.width).toEqual({ mode: "fixed", value: 600 });
    expect(phone.size.width).toEqual({ mode: "fixed", value: 600 });
    expect(solid(desktop.style.fill)).toBe("#111111");
    expect(solid(tablet.style.fill)).toBe("#111111");
    expect(solid(phone.style.fill)).toBe("#222222");
  });

  it("replaces arrays instead of concatenating them", () => {
    const merged = mergeDeep(
      { shadows: [{ x: 0, y: 0, blur: 1, spread: 0, color: "#000", inset: false }] },
      { shadows: [{ x: 1, y: 2, blur: 3, spread: 4, color: "#fff", inset: true }] },
    );
    expect(merged.shadows).toHaveLength(1);
    expect(merged.shadows[0]!.color).toBe("#fff");
  });

  it("replaces a sizing value when the sizing mode changes", () => {
    const project = createProject();
    const root = project.pages[0]!.root;
    root.responsive.overrides.bp_tablet = { size: { width: { mode: "hug" } } };

    const resolved = resolveNodeProps(root, "bp_tablet", project.breakpoints);
    expect(resolved.size.width).toEqual({ mode: "hug" });
  });
});

describe("tree helpers", () => {
  const text = createText({ id: "text-1", content: "Hello" });
  const inner = createFrame({ id: "inner", name: "Inner", children: [text] });
  const outer = createFrame({ id: "outer", name: "Outer", children: [inner] });

  it("finds nodes and their parents", () => {
    expect(findNode(outer, "text-1")?.id).toBe("text-1");
    expect(findParent(outer, "text-1")?.id).toBe("inner");
    expect(findParent(outer, "outer")).toBeNull();
    expect(findNode(outer, "missing")).toBeNull();
  });

  it("builds root-to-node paths and checks ancestry", () => {
    expect(nodePath(outer, "text-1").map((node) => node.id)).toEqual(["outer", "inner", "text-1"]);
    expect(isSelfOrDescendant(outer, "inner", "text-1")).toBe(true);
    expect(isSelfOrDescendant(outer, "text-1", "inner")).toBe(false);
    expect(indexOfNode(inner, "text-1")).toBe(0);
  });
});
