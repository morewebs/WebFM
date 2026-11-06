import type {
  ComponentDefinition,
  ComponentInstanceNode,
  FrameNode,
  Page,
  Project,
  SceneNode,
} from "@webfm/model";
import {
  createComponentDefinition,
  createComponentInstance,
  createFrame,
  createProject,
  createText,
  findNode,
} from "@webfm/model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  buildPageCss,
  nodeClassName,
  renderNode,
  resolveComponentInstance,
  resolveComponentScene,
} from "./index";
import { renderPageToHtml } from "./html";
import type { RenderOptions } from "./types";

const EDITOR: RenderOptions = { breakpointId: "bp_desktop", mode: "editor" };
const PUBLISH: RenderOptions = { breakpointId: "bp_desktop", mode: "publish" };

function createTestProject(children: SceneNode[] = []): { project: Project; page: Page } {
  const project = createProject({ name: "Components", now: "2026-01-01T00:00:00.000Z" });
  const page = project.pages[0]!;
  page.root = createFrame({
    id: "node_root",
    name: "Desktop",
    props: {
      layout: { mode: "none" },
      size: { width: { mode: "fixed", value: 1200 }, height: { mode: "fixed", value: 1000 } },
      style: { fill: null },
    },
    children,
  });
  return { project, page };
}

/** A card whose master label content is deliberately distinct from the default. */
function cardComponent(): ComponentDefinition {
  const root = createFrame({
    id: "node_component_root",
    name: "Card",
    props: {
      layout: { mode: "none" },
      size: { width: { mode: "fixed", value: 200 }, height: { mode: "fixed", value: 100 } },
      position: { x: 0, y: 0 },
      style: { fill: { type: "solid", color: "#123456", opacity: 1 } },
    },
    children: [createText({ id: "node_label", name: "Label", content: "Master label" })],
  });

  const component = createComponentDefinition({ id: "component_card", name: "Card", root });
  component.properties = [
    {
      id: "prop_label",
      name: "Label",
      type: "text",
      defaultValue: "Default label",
      control: "text",
    },
  ];
  component.bindings = [{ propertyId: "prop_label", nodeId: "node_label", path: "text.content" }];
  return component;
}

function addVariant(
  component: ComponentDefinition,
  id: string,
  name: string,
  content: string,
): FrameNode {
  const root = createFrame({
    id: `${id}_root`,
    name,
    props: {
      layout: { mode: "none" },
      size: { width: { mode: "fixed", value: 240 }, height: { mode: "hug" } },
      style: { fill: { type: "solid", color: "#abcdef", opacity: 1 } },
    },
    children: [createText({ id: `${id}_label`, content })],
  });
  component.variants.push({ id, name, root });
  return root;
}

function ruleFor(css: string, className: string): string {
  const start = css.indexOf(`.${className} {`);
  expect(start).toBeGreaterThan(-1);
  const end = css.indexOf("}", start);
  return css.slice(start, end + 1);
}

function renderEditorNode(node: SceneNode, project: Project): string {
  return renderToStaticMarkup(createElement("div", null, renderNode(node, project, EDITOR)));
}

function textContentOf(root: SceneNode, nodeId: string): string {
  const node = findNode(root, nodeId);
  if (!node || node.type !== "text") throw new Error(`Text node "${nodeId}" was not found.`);
  return node.responsive.base.text.content;
}

describe("resolveComponentInstance", () => {
  it("applies a property default when the instance has no value", () => {
    const { project, page } = createTestProject();
    project.components = [cardComponent()];
    const instance = createComponentInstance({
      id: "node_instance",
      componentId: "component_card",
    });
    page.root.children.push(instance);

    const resolved = resolveComponentInstance(project, instance);

    expect(resolved).not.toBeNull();
    expect(textContentOf(resolved!.root, "node_label")).toBe("Default label");
    expect(renderPageToHtml(project, page, EDITOR)).toContain("Default label");
  });

  it("lets an instance value override the property default", () => {
    const { project, page } = createTestProject();
    project.components = [cardComponent()];
    const instance = createComponentInstance({
      id: "node_instance",
      componentId: "component_card",
      propertyValues: { prop_label: "Instance label" },
    });
    page.root.children.push(instance);

    const resolved = resolveComponentInstance(project, instance);
    expect(textContentOf(resolved!.root, "node_label")).toBe("Instance label");

    const html = renderPageToHtml(project, page, EDITOR);
    expect(html).toContain("Instance label");
    expect(html).not.toContain("Default label");
    expect(html).not.toContain("Master label");
  });

  it("chooses the instance variant, then the default, then the first variant", () => {
    const { project } = createTestProject();
    const component = cardComponent();
    addVariant(component, "variant_alt", "Alt", "Alternate label");
    project.components = [component];

    const alt = createComponentInstance({
      id: "node_alt",
      componentId: "component_card",
      variantId: "variant_alt",
    });
    const fallback = createComponentInstance({
      id: "node_empty_variant",
      componentId: "component_card",
      variantId: "variant_missing",
    });
    const first = createComponentInstance({
      id: "node_first",
      componentId: "component_card",
    });

    expect(resolveComponentInstance(project, alt)?.variantId).toBe("variant_alt");
    expect(resolveComponentInstance(project, fallback)?.variantId).toBe(component.defaultVariantId);
    expect(resolveComponentInstance(project, first)?.variantId).toBe(component.defaultVariantId);
  });

  it("switching variant changes the rendered content", () => {
    const { project, page } = createTestProject();
    const component = cardComponent();
    addVariant(component, "variant_alt", "Alt", "Alternate label");
    project.components = [component];
    page.root.children.push(
      createComponentInstance({
        id: "node_instance",
        componentId: "component_card",
        variantId: "variant_alt",
      }),
    );

    const html = renderPageToHtml(project, page, EDITOR);

    expect(html).toContain("Alternate label");
    expect(html).not.toContain("Default label");
    expect(html).toContain(`class="${nodeClassName("variant_alt_label")}"`);
  });

  it("clones the variant root and never mutates the project", () => {
    const { project, page } = createTestProject();
    const component = cardComponent();
    project.components = [component];
    const instance = createComponentInstance({
      id: "node_instance",
      componentId: "component_card",
      propertyValues: { prop_label: "Instance label" },
    });
    page.root.children.push(instance);

    const before = JSON.stringify(project);
    const resolved = resolveComponentInstance(project, instance);
    renderPageToHtml(project, page, EDITOR);
    renderPageToHtml(project, page, PUBLISH);
    buildPageCss(project, page, PUBLISH);

    expect(resolved).not.toBeNull();
    expect(resolved!.root).not.toBe(component.variants[0]!.root);
    expect(JSON.stringify(project)).toBe(before);
    expect(textContentOf(component.variants[0]!.root, "node_label")).toBe("Master label");
    expect(instance.propertyValues).toEqual({ prop_label: "Instance label" });
  });

  it("returns null for a missing component", () => {
    const { project } = createTestProject();
    const instance = createComponentInstance({
      id: "node_missing",
      componentId: "component_missing",
    });

    expect(resolveComponentInstance(project, instance)).toBeNull();
  });
});

describe("component instance placement", () => {
  function instanceWithBox(): { project: Project; page: Page; instance: ComponentInstanceNode } {
    const { project, page } = createTestProject();
    project.components = [cardComponent()];
    const instance = createComponentInstance({
      id: "node_instance",
      componentId: "component_card",
      props: {
        size: { width: { mode: "fixed", value: 320 }, height: { mode: "fixed", value: 180 } },
        position: { x: 40, y: 60 },
      },
    });
    page.root.children.push(instance);
    return { project, page, instance };
  }

  it("uses the instance size and position in editor markup", () => {
    const { project, page } = instanceWithBox();

    const html = renderPageToHtml(project, page, EDITOR);

    expect(html).toContain("width:320px");
    expect(html).toContain("height:180px");
    expect(html).toContain("left:40px");
    expect(html).toContain("top:60px");
    expect(html).not.toContain("width:200px");
    expect(html).not.toContain("height:100px");
    // The variant root's appearance still comes through.
    expect(html).toContain("background-color:#123456");
  });

  it("uses the instance size and position in publish CSS", () => {
    const { project, page } = instanceWithBox();

    const html = renderPageToHtml(project, page, PUBLISH);
    const css = buildPageCss(project, page, PUBLISH);
    const instanceRule = ruleFor(css, nodeClassName("node_instance"));

    expect(html).toContain(`class="${nodeClassName("node_instance")}"`);
    expect(html).toContain("Default label");
    expect(html).not.toContain("style=");
    expect(instanceRule).toContain("width: 320px");
    expect(instanceRule).toContain("height: 180px");
    expect(instanceRule).toContain("left: 40px");
    expect(instanceRule).toContain("top: 60px");
    expect(instanceRule).toContain("background-color: #123456");
  });

  it("emits the wrapper and every rendered variant child class in publish CSS", () => {
    const { project, page } = instanceWithBox();

    const css = buildPageCss(project, page, PUBLISH);

    expect(css).toContain(`.${nodeClassName("node_instance")} {`);
    expect(css).toContain(`.${nodeClassName("node_label")} {`);
    expect(css).toContain(`.${nodeClassName("node_label")}-text {`);
  });

  it("keeps a dashed placeholder in the editor and nothing in publish for a missing component", () => {
    const { project, page } = createTestProject([
      createComponentInstance({
        id: "node_missing",
        name: "Missing card",
        componentId: "component_missing",
      }),
    ]);

    const editorHtml = renderPageToHtml(project, page, EDITOR);
    expect(editorHtml).toContain("Missing card");
    expect(editorHtml).toContain("border:1px dashed #9ca3af");

    const publishHtml = renderPageToHtml(project, page, PUBLISH);
    expect(publishHtml).not.toContain("Missing card");
    expect(publishHtml).not.toContain(nodeClassName("node_missing"));
    expect(buildPageCss(project, page, PUBLISH)).not.toContain(
      `.${nodeClassName("node_missing")} {`,
    );
  });
});

describe("nested components", () => {
  function nestedProject(): { project: Project; page: Page } {
    const innerRoot = createFrame({
      id: "node_inner_root",
      name: "Inner",
      props: {
        layout: { mode: "none" },
        size: { width: { mode: "hug" }, height: { mode: "hug" } },
        style: { fill: null },
      },
      children: [createText({ id: "node_inner_text", content: "Inner label" })],
    });
    const inner = createComponentDefinition({
      id: "component_inner",
      name: "Inner",
      root: innerRoot,
    });

    const outerRoot = createFrame({
      id: "node_outer_root",
      name: "Outer",
      props: {
        layout: { mode: "stack", direction: "vertical" },
        size: { width: { mode: "fixed", value: 300 }, height: { mode: "hug" } },
        style: { fill: null },
      },
      children: [
        createComponentInstance({ id: "node_inner_instance", componentId: "component_inner" }),
      ],
    });
    const outer = createComponentDefinition({
      id: "component_outer",
      name: "Outer",
      root: outerRoot,
    });

    const { project, page } = createTestProject();
    project.components = [inner, outer];
    page.root.children.push(
      createComponentInstance({ id: "node_outer_instance", componentId: "component_outer" }),
    );
    return { project, page };
  }

  it("renders a nested component's content in markup and CSS", () => {
    const { project, page } = nestedProject();

    const editorHtml = renderPageToHtml(project, page, EDITOR);
    const publishHtml = renderPageToHtml(project, page, PUBLISH);
    const css = buildPageCss(project, page, PUBLISH);

    expect(editorHtml).toContain("Inner label");
    expect(editorHtml).toContain(`class="${nodeClassName("node_inner_instance")}"`);
    expect(publishHtml).toContain("Inner label");
    expect(publishHtml).toContain(`class="${nodeClassName("node_inner_instance")}"`);
    expect(css).toContain(`.${nodeClassName("node_outer_instance")} {`);
    expect(css).toContain(`.${nodeClassName("node_inner_instance")} {`);
    expect(css).toContain(`.${nodeClassName("node_inner_text")}-text {`);
  });

  it("stops a self-referencing component instead of recursing forever", () => {
    const selfRoot = createFrame({
      id: "node_self_root",
      name: "Self",
      props: {
        layout: { mode: "none" },
        size: { width: { mode: "hug" }, height: { mode: "hug" } },
        style: { fill: null },
      },
      children: [
        createText({ id: "node_self_text", content: "Self label" }),
        createComponentInstance({ id: "node_self_instance", componentId: "component_self" }),
      ],
    });
    const self = createComponentDefinition({
      id: "component_self",
      name: "Self",
      root: selfRoot,
    });

    const { project, page } = createTestProject([
      createComponentInstance({ id: "node_page_self", componentId: "component_self" }),
    ]);
    project.components = [self];

    expect(() => renderPageToHtml(project, page, EDITOR)).not.toThrow();
    expect(() => renderPageToHtml(project, page, PUBLISH)).not.toThrow();
    expect(() => buildPageCss(project, page, PUBLISH)).not.toThrow();
    expect(renderPageToHtml(project, page, PUBLISH)).toContain("Self label");
  });
});

describe("resolveComponentScene", () => {
  it("resolves the default variant and its master root", () => {
    const { project } = createTestProject();
    const component = cardComponent();
    addVariant(component, "variant_alt", "Alt", "Alternate label");
    project.components = [component];

    const scene = resolveComponentScene(project, "component_card");

    expect(scene).not.toBeNull();
    expect(scene!.component).toBe(component);
    expect(scene!.variant.id).toBe(component.defaultVariantId);
    expect(scene!.root).toBe(component.variants[0]!.root);
  });

  it("resolves a requested variant and falls back to the default", () => {
    const { project } = createTestProject();
    const component = cardComponent();
    addVariant(component, "variant_alt", "Alt", "Alternate label");
    project.components = [component];

    expect(resolveComponentScene(project, "component_card", "variant_alt")?.variant.id).toBe(
      "variant_alt",
    );
    expect(resolveComponentScene(project, "component_card", "variant_missing")?.variant.id).toBe(
      component.defaultVariantId,
    );
  });

  it("returns null for a missing component or an empty variant list", () => {
    const { project } = createTestProject();
    const component = cardComponent();
    project.components = [component];

    expect(resolveComponentScene(project, "component_missing")).toBeNull();

    component.variants = [];
    expect(resolveComponentScene(project, "component_card")).toBeNull();
  });

  it("renders the master root through renderNode for component edit mode", () => {
    const { project } = createTestProject();
    const component = cardComponent();
    project.components = [component];

    const scene = resolveComponentScene(project, "component_card");
    const html = renderEditorNode(scene!.root, project);

    expect(html).toContain("Master label");
    expect(html).toContain(`class="${nodeClassName("node_component_root")}"`);
    expect(html).toContain(`class="${nodeClassName("node_label")}"`);
    expect(html).toContain('data-node-id="node_label"');
  });
});
