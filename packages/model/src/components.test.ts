import { type Draft, produce } from "immer";
import { describe, expect, it } from "vitest";
import { createComponentInstance, createFrame, createProject, createText } from "./defaults";
import { applyOperation, createHistory, redo, undo } from "./history";
import {
  addComponentProperty,
  addComponentVariant,
  createComponentFromNode,
  deleteComponent,
  deleteComponentVariant,
  duplicateNode,
  getTargetNodeOrThrow,
  getTargetRoot,
  insertComponentInstance,
  insertNode,
  moveNode,
  removeComponentProperty,
  removeNode,
  renameComponent,
  renameComponentVariant,
  renameNode,
  setComponentBinding,
  setComponentDefaultVariant,
  setInstancePropertyValue,
  setInstanceVariant,
  setNodeLocked,
  setNodeVisible,
  updateBoxProps,
  updateNode,
  updateTextProps,
} from "./operations";
import { collectNodes, findComponentInstances, findNode } from "./tree";
import type {
  ComponentDefinition,
  ComponentInstanceNode,
  FrameNode,
  Project,
  SceneNode,
} from "./types";

/* ----------------------------------------------------------------- helpers */

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

function pageIdOf(project: Project): string {
  return project.pages[0]!.id;
}

function asInstance(node: SceneNode | null | undefined): ComponentInstanceNode {
  if (!node || node.type !== "componentInstance") {
    throw new Error("Expected a component instance node.");
  }
  return node;
}

function findTextByContent(root: SceneNode, content: string) {
  const node = collectNodes(root).find(
    (candidate) =>
      candidate.type === "text" && candidate.responsive.base.text.content === content,
  );
  if (!node || node.type !== "text") throw new Error(`Text "${content}" was not found.`);
  return node;
}

/** Seeds two siblings in the page root: a frame "card" (with text "Hello") and text "Outside". */
function seeded(): Project {
  const base = createProject();
  const pageId = pageIdOf(base);
  return run(base, (draft) => {
    const page = draft.pages[0]!;
    insertNode(draft, {
      pageId: page.id,
      parentId: page.root.id,
      node: createFrame({
        id: "card",
        name: "Card",
        props: {
          size: { width: { mode: "fixed", value: 200 }, height: { mode: "fixed", value: 100 } },
          position: { x: 40, y: 60 },
        },
      }),
    });
    insertNode(draft, {
      pageId: page.id,
      parentId: "card",
      node: createText({ id: "label", content: "Hello" }),
    });
    insertNode(draft, {
      pageId: page.id,
      parentId: page.root.id,
      node: createText({ id: "outside", content: "Outside" }),
    });
  }).project;
}

interface CreatedComponent {
  project: Project;
  pageId: string;
  componentId: string;
  variantId: string;
  instanceId: string;
  component: ComponentDefinition;
  variantRoot: FrameNode;
  instance: ComponentInstanceNode;
}

function createFrom(base: Project, nodeId: string, name?: string): CreatedComponent {
  const pageId = pageIdOf(base);
  const { project, result } = run(base, (draft) =>
    createComponentFromNode(draft, { pageId, nodeId, name }),
  );
  const component = project.components.find((candidate) => candidate.id === result.componentId);
  if (!component) throw new Error("Expected the component to exist.");
  const variant = component.variants.find((candidate) => candidate.id === result.variantId);
  if (!variant) throw new Error("Expected the variant to exist.");
  return {
    project,
    pageId,
    componentId: result.componentId,
    variantId: result.variantId,
    instanceId: result.instanceId,
    component,
    variantRoot: variant.root,
    instance: asInstance(findNode(project.pages[0]!.root, result.instanceId)),
  };
}

/* ---------------------------------------------------------------- targets */

describe("scene targets", () => {
  it("resolves page and component roots and names them in errors", () => {
    const created = createFrom(seeded(), "card");

    const pageRootId = run(created.project, (draft) =>
      getTargetRoot(draft, { pageId: created.pageId }).id,
    ).result;
    expect(pageRootId).toBe(created.project.pages[0]!.root.id);

    const byDefaultId = run(created.project, (draft) =>
      getTargetRoot(draft, { componentId: created.componentId }).id,
    ).result;
    expect(byDefaultId).toBe(created.variantRoot.id);

    const byVariantId = run(created.project, (draft) =>
      getTargetRoot(draft, {
        componentId: created.componentId,
        variantId: created.variantId,
      }).id,
    ).result;
    expect(byVariantId).toBe(created.variantRoot.id);

    expect(() =>
      run(created.project, (draft) => getTargetRoot(draft, { componentId: "missing" })),
    ).toThrow(/Component "missing"/);

    expect(() =>
      run(created.project, (draft) =>
        getTargetNodeOrThrow(draft, { componentId: created.componentId, variantId: "nope" }, "x"),
      ),
    ).toThrow(/Variant "nope" was not found in component/);

    expect(() =>
      run(created.project, (draft) =>
        getTargetNodeOrThrow(
          draft,
          { componentId: created.componentId, variantId: created.variantId },
          "missing-node",
        ),
      ),
    ).toThrow(/Node "missing-node" was not found in component .* variant/);
  });

  it("runs node operations inside a component variant", () => {
    const created = createFrom(seeded(), "card");
    const target = { componentId: created.componentId, variantId: created.variantId };
    const label = findTextByContent(created.variantRoot, "Hello");

    const { project } = run(created.project, (draft) => {
      insertNode(draft, {
        ...target,
        parentId: created.variantRoot.id,
        node: createFrame({
          id: "badge",
          name: "Badge",
          props: { size: { width: { mode: "fixed", value: 80 } } },
        }),
      });
      updateBoxProps(draft, {
        ...target,
        nodeId: "badge",
        breakpointId: "bp_desktop",
        patch: { size: { width: { mode: "fixed", value: 90 } } },
      });
      updateTextProps(draft, {
        ...target,
        nodeId: label.id,
        breakpointId: "bp_desktop",
        patch: { text: { content: "Renamed" } },
      });
      renameNode(draft, { ...target, nodeId: "badge" }, "Badge copy");
      updateNode(draft, { ...target, nodeId: "badge" }, (node) => {
        node.visible = false;
      });
      setNodeLocked(draft, { ...target, nodeId: "badge" }, true);
      setNodeVisible(draft, { ...target, nodeId: "badge" }, true);

      moveNode(draft, {
        ...target,
        nodeId: label.id,
        parentId: "badge",
        index: 0,
      });
      const duplicate = duplicateNode(draft, { ...target, nodeId: "badge" });
      removeNode(draft, { ...target, nodeId: duplicate });
    });

    const component = project.components.find((candidate) => candidate.id === created.componentId);
    const root = component!.variants[0]!.root;
    const badge = root.children.find((child) => child.id === "badge");
    expect(badge?.name).toBe("Badge copy");
    expect(badge?.locked).toBe(true);
    expect(badge?.visible).toBe(true);
    expect(badge?.responsive.base.size.width).toEqual({ mode: "fixed", value: 90 });
    if (!badge || badge.type !== "frame") throw new Error("Expected the badge frame.");
    expect(badge.children.map((child) => child.id)).toEqual([label.id]);

    const changed = findNode(root, label.id);
    if (!changed || changed.type !== "text") throw new Error("Expected the text node.");
    expect(changed.responsive.base.text.content).toBe("Renamed");

    // The page tree is untouched by component-target operations.
    const pageRoot = project.pages[0]!.root;
    expect(pageRoot.children.map((child) => child.id)).toEqual([
      created.instanceId,
      "outside",
    ]);
  });

  it("rejects removing or moving a component variant root", () => {
    const created = createFrom(seeded(), "card");
    const target = { componentId: created.componentId, variantId: created.variantId };

    expect(() =>
      run(created.project, (draft) =>
        removeNode(draft, { ...target, nodeId: created.variantRoot.id }),
      ),
    ).toThrow(/component variant root/);

    expect(() =>
      run(created.project, (draft) =>
        moveNode(draft, {
          ...target,
          nodeId: created.variantRoot.id,
          parentId: created.variantRoot.id,
        }),
      ),
    ).toThrow(/component variant root/);
  });
});

/* ------------------------------------------------------- createComponent */

describe("createComponentFromNode", () => {
  it("turns a frame into a component and leaves an instance in place", () => {
    const base = seeded();
    const created = createFrom(base, "card");

    const pageRoot = created.project.pages[0]!.root;
    expect(pageRoot.children.map((node) => node.id)).toEqual([created.instanceId, "outside"]);
    expect(pageRoot.children[0]!.type).toBe("componentInstance");

    expect(created.instance.name).toBe("Card");
    expect(created.instance.componentId).toBe(created.componentId);
    expect(created.instance.variantId).toBe(created.variantId);
    expect(created.instance.propertyValues).toEqual({});
    expect(created.instance.responsive.base.position).toEqual({ x: 40, y: 60 });
    expect(created.instance.responsive.base.size.width).toEqual({ mode: "fixed", value: 200 });

    expect(created.component.name).toBe("Card");
    expect(created.component.variants).toHaveLength(1);
    expect(created.component.variants[0]!.name).toBe("Default");
    expect(created.component.defaultVariantId).toBe(created.variantId);

    expect(created.variantRoot.name).toBe("Card");
    expect(created.variantRoot.responsive.base.position).toEqual({ x: 0, y: 0 });
    expect(created.variantRoot.responsive.base.size.width).toEqual({ mode: "fixed", value: 200 });
    expect(created.variantRoot.responsive.base.size.height).toEqual({ mode: "fixed", value: 100 });

    // Every id in the variant is fresh; the original ids stay out of it.
    const copied = collectNodes(created.variantRoot);
    expect(copied.map((node) => node.id)).not.toContain("card");
    expect(copied.map((node) => node.id)).not.toContain("label");
    for (const node of copied) expect(node.id.startsWith("node_")).toBe(true);
    expect(findTextByContent(created.variantRoot, "Hello").responsive.base.text.content).toBe(
      "Hello",
    );
  });

  it("wraps a text node in a hug-sized frame", () => {
    const created = createFrom(seeded(), "outside", "Badge");

    const wrapper = created.variantRoot;
    expect(wrapper.name).toBe("Badge");
    expect(wrapper.responsive.base.layout.mode).toBe("none");
    expect(wrapper.responsive.base.size.width).toEqual({ mode: "hug" });
    expect(wrapper.responsive.base.size.height).toEqual({ mode: "hug" });
    expect(wrapper.responsive.base.style.fill).toBeNull();
    expect(wrapper.responsive.base.position).toEqual({ x: 0, y: 0 });

    const inner = wrapper.children[0]!;
    expect(inner.type).toBe("text");
    if (inner.type !== "text") throw new Error("Expected the inner text node.");
    expect(inner.responsive.base.text.content).toBe("Outside");
    expect(inner.responsive.base.position).toEqual({ x: 0, y: 0 });
    expect(inner.id).not.toBe("outside");

    // The instance keeps the original text node's box (including hug sizing)
    // and has no text props of its own.
    expect(created.instance.responsive.base.size.width).toEqual({ mode: "hug" });
    expect("text" in created.instance.responsive.base).toBe(false);
  });

  it("throws for the page root", () => {
    const base = seeded();
    const pageId = pageIdOf(base);
    const rootId = base.pages[0]!.root.id;
    expect(() =>
      run(base, (draft) => createComponentFromNode(draft, { pageId, nodeId: rootId })),
    ).toThrow(/page root/);
  });

  it("honors a name argument and renames the component", () => {
    const created = createFrom(seeded(), "card", "Primary card");
    expect(created.component.name).toBe("Primary card");
    expect(created.instance.name).toBe("Primary card");

    const { project } = run(created.project, (draft) =>
      renameComponent(draft, { componentId: created.componentId, name: "Card A" }),
    );
    expect(project.components[0]!.name).toBe("Card A");
    expect(() =>
      run(created.project, (draft) =>
        renameComponent(draft, { componentId: created.componentId, name: "  " }),
      ),
    ).toThrow(/cannot be empty/);
  });
});

/* ------------------------------------------------ insertComponentInstance */

describe("insertComponentInstance", () => {
  it("inserts the default variant at the page root with the variant's size", () => {
    const created = createFrom(seeded(), "card");
    const { project, result } = run(created.project, (draft) =>
      insertComponentInstance(draft, {
        pageId: created.pageId,
        parentId: draft.pages[0]!.root.id,
        componentId: created.componentId,
      }),
    );

    const instance = asInstance(findNode(project.pages[0]!.root, result));
    expect(instance.name).toBe("Card");
    expect(instance.variantId).toBe(created.variantId);
    expect(instance.propertyValues).toEqual({});
    expect(instance.responsive.base.position).toEqual({ x: 0, y: 0 });
    expect(instance.responsive.base.size.width).toEqual({ mode: "fixed", value: 200 });
    expect(instance.responsive.base.size.height).toEqual({ mode: "fixed", value: 100 });
  });

  it("inserts nested with a position and index", () => {
    const created = createFrom(seeded(), "card");
    const { project, result } = run(created.project, (draft) => {
      const page = draft.pages[0]!;
      insertNode(draft, {
        pageId: page.id,
        parentId: page.root.id,
        node: createFrame({ id: "container", name: "Container" }),
      });
      insertNode(draft, {
        pageId: page.id,
        parentId: "container",
        node: createFrame({ id: "before", name: "Before" }),
      });
      return insertComponentInstance(draft, {
        pageId: page.id,
        parentId: "container",
        componentId: created.componentId,
        position: { x: 12, y: 34 },
        index: 0,
      });
    });

    const container = findNode(project.pages[0]!.root, "container");
    if (!container || container.type !== "frame") throw new Error("Expected the container.");
    expect(container.children.map((node) => node.id)).toEqual([result, "before"]);
    const instance = asInstance(container.children[0]);
    expect(instance.responsive.base.position).toEqual({ x: 12, y: 34 });
  });

  it("uses an explicit variant and validates component and variant", () => {
    const created = createFrom(seeded(), "card");
    const withVariant = run(created.project, (draft) =>
      addComponentVariant(draft, { componentId: created.componentId, name: "Hover" }),
    );
    const variantId = withVariant.result;

    const { project, result } = run(withVariant.project, (draft) =>
      insertComponentInstance(draft, {
        pageId: created.pageId,
        parentId: draft.pages[0]!.root.id,
        componentId: created.componentId,
        variantId,
      }),
    );
    expect(asInstance(findNode(project.pages[0]!.root, result)).variantId).toBe(variantId);

    expect(() =>
      run(created.project, (draft) =>
        insertComponentInstance(draft, {
          pageId: created.pageId,
          parentId: draft.pages[0]!.root.id,
          componentId: "missing",
        }),
      ),
    ).toThrow(/Component "missing"/);

    expect(() =>
      run(created.project, (draft) =>
        insertComponentInstance(draft, {
          pageId: created.pageId,
          parentId: draft.pages[0]!.root.id,
          componentId: created.componentId,
          variantId: "missing",
        }),
      ),
    ).toThrow(/Variant "missing" was not found/);
  });
});

/* --------------------------------------------------------------- variants */

describe("component variants", () => {
  it("clones with shared node ids and unique variant names", () => {
    const created = createFrom(seeded(), "card");
    const first = run(created.project, (draft) =>
      addComponentVariant(draft, { componentId: created.componentId }),
    );
    const second = run(first.project, (draft) =>
      addComponentVariant(draft, { componentId: created.componentId }),
    );

    const component = second.project.components[0]!;
    expect(component.variants).toHaveLength(3);
    expect(component.variants[1]!.name).toBe("Variant 2");
    expect(component.variants[2]!.name).toBe("Variant 3");
    expect(component.variants[1]!.id).toBe(first.result);
    expect(component.variants[2]!.id).toBe(second.result);

    const defaultIds = collectNodes(component.variants[0]!.root).map((node) => node.id);
    const cloneIds = collectNodes(component.variants[1]!.root).map((node) => node.id);
    expect(cloneIds).toEqual(defaultIds);

    // Shared identities keep component-wide bindings valid across variants.
    const property = run(first.project, (draft) =>
      addComponentProperty(draft, {
        componentId: created.componentId,
        property: { name: "Visible", type: "boolean", defaultValue: true },
      }),
    );
    expect(() =>
      run(property.project, (draft) =>
        setComponentBinding(draft, {
          componentId: created.componentId,
          binding: {
            propertyId: property.result,
            nodeId: component.variants[0]!.root.id,
            path: "visible",
          },
        }),
      ),
    ).not.toThrow();

    const namedFirst = run(created.project, (draft) =>
      addComponentVariant(draft, { componentId: created.componentId, name: "Variant 2" }),
    ).project;
    const namedSecond = run(namedFirst, (draft) =>
      addComponentVariant(draft, { componentId: created.componentId, name: "Variant 2" }),
    ).project;
    expect(namedSecond.components[0]!.variants[2]!.name).toBe("Variant 2 2");
  });

  it("renames, sets the default, and deletes variants", () => {
    const created = createFrom(seeded(), "card");
    const added = run(created.project, (draft) =>
      addComponentVariant(draft, { componentId: created.componentId }),
    );
    const variantId = added.result;

    const renamed = run(added.project, (draft) =>
      renameComponentVariant(draft, {
        componentId: created.componentId,
        variantId,
        name: "Hover",
      }),
    );
    expect(renamed.project.components[0]!.variants[1]!.name).toBe("Hover");

    expect(() =>
      run(renamed.project, (draft) =>
        renameComponentVariant(draft, {
          componentId: created.componentId,
          variantId,
          name: "Default",
        }),
      ),
    ).toThrow(/already exists/);
    expect(() =>
      run(renamed.project, (draft) =>
        renameComponentVariant(draft, {
          componentId: created.componentId,
          variantId,
          name: "   ",
        }),
      ),
    ).toThrow(/cannot be empty/);

    const defaulted = run(renamed.project, (draft) =>
      setComponentDefaultVariant(draft, { componentId: created.componentId, variantId }),
    );
    expect(defaulted.project.components[0]!.defaultVariantId).toBe(variantId);

    // Deleting the default variant reassigns to the first remaining one.
    const deleted = run(defaulted.project, (draft) =>
      deleteComponentVariant(draft, { componentId: created.componentId, variantId }),
    );
    expect(deleted.project.components[0]!.variants).toHaveLength(1);
    expect(deleted.project.components[0]!.defaultVariantId).toBe(
      deleted.project.components[0]!.variants[0]!.id,
    );

    // The last variant cannot be removed.
    expect(() =>
      run(deleted.project, (draft) =>
        deleteComponentVariant(draft, {
          componentId: created.componentId,
          variantId: deleted.project.components[0]!.variants[0]!.id,
        }),
      ),
    ).toThrow(/last variant/);
  });
});

/* -------------------------------------------------------------- instances */

describe("component instances", () => {
  it("switches variants and keeps property values", () => {
    const created = createFrom(seeded(), "card");
    const withVariant = run(created.project, (draft) =>
      addComponentVariant(draft, { componentId: created.componentId }),
    );
    const variantId = withVariant.result;
    const withProperty = run(withVariant.project, (draft) =>
      addComponentProperty(draft, {
        componentId: created.componentId,
        property: { name: "Label", type: "text", defaultValue: "Hi", control: "text" },
      }),
    );
    const propertyId = withProperty.result;

    const { project } = run(withProperty.project, (draft) => {
      setInstancePropertyValue(
        draft,
        { pageId: created.pageId, nodeId: created.instanceId },
        propertyId,
        "Custom",
      );
      setInstanceVariant(
        draft,
        { pageId: created.pageId, nodeId: created.instanceId },
        variantId,
      );
    });

    const instance = asInstance(findNode(project.pages[0]!.root, created.instanceId));
    expect(instance.variantId).toBe(variantId);
    expect(instance.propertyValues[propertyId]).toBe("Custom");

    expect(() =>
      run(created.project, (draft) =>
        setInstanceVariant(
          draft,
          { pageId: created.pageId, nodeId: created.instanceId },
          "missing",
        ),
      ),
    ).toThrow(/Variant "missing" was not found/);

    expect(() =>
      run(created.project, (draft) =>
        setInstanceVariant(draft, { pageId: created.pageId, nodeId: "outside" }, variantId),
      ),
    ).toThrow(/expected a component instance/);
  });
});

/* -------------------------------------------------------------- properties */

describe("component properties and bindings", () => {
  it("adds and validates properties", () => {
    const created = createFrom(seeded(), "card");
    const { project, result } = run(created.project, (draft) =>
      addComponentProperty(draft, {
        componentId: created.componentId,
        property: { name: "Label", type: "text", defaultValue: "Hi", control: "text" },
      }),
    );

    const property = project.components[0]!.properties[0]!;
    expect(result).toBe(property.id);
    expect(property).toMatchObject({
      name: "Label",
      type: "text",
      defaultValue: "Hi",
      control: "text",
    });
    expect(property.id.startsWith("prop_")).toBe(true);

    const withId = run(created.project, (draft) =>
      addComponentProperty(draft, {
        componentId: created.componentId,
        property: { id: "prop_fixed", name: "Visible", type: "boolean", defaultValue: true },
      }),
    );
    expect(withId.result).toBe("prop_fixed");

    expect(() =>
      run(project, (draft) =>
        addComponentProperty(draft, {
          componentId: created.componentId,
          property: { name: "Label", type: "boolean", defaultValue: false },
        }),
      ),
    ).toThrow(/already exists/);
    expect(() =>
      run(created.project, (draft) =>
        addComponentProperty(draft, {
          componentId: created.componentId,
          property: { name: "", type: "boolean", defaultValue: false },
        }),
      ),
    ).toThrow(/cannot be empty/);
  });

  it("validates instance property values against the component", () => {
    const created = createFrom(seeded(), "card");
    const withProperty = run(created.project, (draft) =>
      addComponentProperty(draft, {
        componentId: created.componentId,
        property: { name: "Visible", type: "boolean", defaultValue: true },
      }),
    );
    const propertyId = withProperty.result;

    const { project } = run(withProperty.project, (draft) =>
      setInstancePropertyValue(
        draft,
        { pageId: created.pageId, nodeId: created.instanceId },
        propertyId,
        false,
      ),
    );
    expect(
      asInstance(findNode(project.pages[0]!.root, created.instanceId)).propertyValues[propertyId],
    ).toBe(false);

    expect(() =>
      run(created.project, (draft) =>
        setInstancePropertyValue(
          draft,
          { pageId: created.pageId, nodeId: created.instanceId },
          "missing",
          true,
        ),
      ),
    ).toThrow(/Property "missing" was not found/);

    expect(() =>
      run(created.project, (draft) =>
        setInstancePropertyValue(
          draft,
          { pageId: created.pageId, nodeId: "outside" },
          propertyId,
          true,
        ),
      ),
    ).toThrow(/expected a component instance/);
  });

  it("replaces one binding per property and validates its node", () => {
    const created = createFrom(seeded(), "card");
    const label = findTextByContent(created.variantRoot, "Hello");
    const withProperty = run(created.project, (draft) =>
      addComponentProperty(draft, {
        componentId: created.componentId,
        property: { name: "Label", type: "text", defaultValue: "Hi", control: "text" },
      }),
    );
    const propertyId = withProperty.result;

    const bound = run(withProperty.project, (draft) =>
      setComponentBinding(draft, {
        componentId: created.componentId,
        binding: { propertyId, nodeId: label.id, path: "text.content" },
      }),
    );
    let bindings = bound.project.components[0]!.bindings;
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toEqual({ propertyId, nodeId: label.id, path: "text.content" });

    const replaced = run(bound.project, (draft) =>
      setComponentBinding(draft, {
        componentId: created.componentId,
        binding: { propertyId, nodeId: label.id, path: "text.fontSize" },
      }),
    );
    bindings = replaced.project.components[0]!.bindings;
    expect(bindings).toHaveLength(1);
    expect(bindings[0]!.path).toBe("text.fontSize");

    expect(() =>
      run(created.project, (draft) =>
        setComponentBinding(draft, {
          componentId: created.componentId,
          binding: { propertyId: "missing", nodeId: label.id, path: "text.content" },
        }),
      ),
    ).toThrow(/Property "missing" was not found/);

    expect(() =>
      run(withProperty.project, (draft) =>
        setComponentBinding(draft, {
          componentId: created.componentId,
          binding: { propertyId, nodeId: "missing-node", path: "text.content" },
        }),
      ),
    ).toThrow(/was not found in variant/);
  });

  it("rejects a component-wide binding when the node is missing from a variant", () => {
    const created = createFrom(seeded(), "card");
    const label = findTextByContent(created.variantRoot, "Hello");
    const withProperty = run(created.project, (draft) =>
      addComponentProperty(draft, {
        componentId: created.componentId,
        property: { name: "Label", type: "text", defaultValue: "Hi", control: "text" },
      }),
    );
    const propertyId = withProperty.result;
    const added = run(withProperty.project, (draft) =>
      addComponentVariant(draft, { componentId: created.componentId }),
    );
    const variantId = added.result;
    // Variants share ids; remove the corresponding node from the new variant to
    // model a structurally diverged variant.
    const withVariant = run(added.project, (draft) =>
      removeNode(draft, { componentId: created.componentId, variantId, nodeId: label.id }),
    ).project;

    expect(() =>
      run(withVariant, (draft) =>
        setComponentBinding(draft, {
          componentId: created.componentId,
          binding: { propertyId, nodeId: label.id, path: "text.content" },
        }),
      ),
    ).toThrow(/was not found in variant/);
  });

  it("removes bindings and instance values with the property", () => {
    const created = createFrom(seeded(), "card");
    const label = findTextByContent(created.variantRoot, "Hello");
    const withProperty = run(created.project, (draft) =>
      addComponentProperty(draft, {
        componentId: created.componentId,
        property: { name: "Label", type: "text", defaultValue: "Hi", control: "text" },
      }),
    );
    const propertyId = withProperty.result;

    const prepared = run(withProperty.project, (draft) => {
      setComponentBinding(draft, {
        componentId: created.componentId,
        binding: { propertyId, nodeId: label.id, path: "text.content" },
      });
      setInstancePropertyValue(
        draft,
        { pageId: created.pageId, nodeId: created.instanceId },
        propertyId,
        "Bound",
      );
    }).project;

    const { project } = run(prepared, (draft) =>
      removeComponentProperty(draft, { componentId: created.componentId, propertyId }),
    );

    expect(project.components[0]!.properties).toHaveLength(0);
    expect(project.components[0]!.bindings).toHaveLength(0);
    const instance = asInstance(findNode(project.pages[0]!.root, created.instanceId));
    expect(propertyId in instance.propertyValues).toBe(false);

    expect(() =>
      run(prepared, (draft) =>
        removeComponentProperty(draft, {
          componentId: created.componentId,
          propertyId: "missing",
        }),
      ),
    ).toThrow(/Property "missing" was not found/);
  });
});

/* ------------------------------------------------------------ references */

describe("component references", () => {
  it("finds instances across pages and component variants", () => {
    const a = createFrom(seeded(), "card", "Card A");
    const b = createFrom(a.project, "outside", "Card B");

    const { project } = run(b.project, (draft) => {
      insertNode(draft, {
        componentId: b.componentId,
        variantId: b.variantId,
        parentId: b.variantRoot.id,
        node: createComponentInstance({
          componentId: a.componentId,
          variantId: a.variantId,
        }),
      });
    });

    expect(findComponentInstances(project, a.componentId)).toHaveLength(2);
    expect(findComponentInstances(project.pages[0]!, a.componentId)).toHaveLength(1);
    expect(findComponentInstances(project.components[0]!.variants[0]!.root, a.componentId)).toHaveLength(
      0,
    );
    const bRoot = project.components.find((candidate) => candidate.id === b.componentId)!
      .variants[0]!.root;
    expect(findComponentInstances(bRoot, a.componentId)).toHaveLength(1);
  });

  it("refuses to delete a referenced component and deletes an unreferenced one", () => {
    const created = createFrom(seeded(), "card");

    expect(() =>
      run(created.project, (draft) =>
        deleteComponent(draft, { componentId: created.componentId }),
      ),
    ).toThrow(/instance\(s\) still reference it/);

    const withoutInstance = run(created.project, (draft) =>
      removeNode(draft, { pageId: created.pageId, nodeId: created.instanceId }),
    ).project;
    const { project } = run(withoutInstance, (draft) =>
      deleteComponent(draft, { componentId: created.componentId }),
    );
    expect(project.components).toHaveLength(0);
  });

  it("refuses to delete a component referenced from another component's variant", () => {
    const a = createFrom(seeded(), "card", "Card A");
    const b = createFrom(a.project, "outside", "Card B");
    const withNested = run(b.project, (draft) => {
      insertNode(draft, {
        componentId: b.componentId,
        variantId: b.variantId,
        parentId: b.variantRoot.id,
        node: createComponentInstance({
          componentId: a.componentId,
          variantId: a.variantId,
        }),
      });
      // Remove A's page instance so only the nested reference remains.
      removeNode(draft, { pageId: a.pageId, nodeId: a.instanceId });
    }).project;

    expect(() =>
      run(withNested, (draft) => deleteComponent(draft, { componentId: a.componentId })),
    ).toThrow(/1 instance\(s\) still reference it/);
  });
});

/* --------------------------------------------------------------- history */

describe("component history", () => {
  it("undoes and redoes component creation", () => {
    const base = seeded();
    const pageId = pageIdOf(base);
    const history = createHistory(base);

    const applied = applyOperation(history, "Create component", (draft) => {
      createComponentFromNode(draft, { pageId, nodeId: "card" });
    });
    expect(applied.project.components).toHaveLength(1);
    expect(findNode(applied.project.pages[0]!.root, "card")).toBeNull();

    const back = undo(applied);
    expect(back.project.components).toHaveLength(0);
    expect(findNode(back.project.pages[0]!.root, "card")?.id).toBe("card");
    expect(back.project.pages[0]!.root.children.map((node) => node.id)).toEqual([
      "card",
      "outside",
    ]);

    const forward = redo(back);
    expect(forward.project.components).toHaveLength(1);
    expect(findNode(forward.project.pages[0]!.root, "card")).toBeNull();
  });

  it("undoes and redoes an edit inside a component variant", () => {
    const created = createFrom(seeded(), "card");
    const target = { componentId: created.componentId, variantId: created.variantId };
    const history = createHistory(created.project);

    const edited = applyOperation(history, "Resize variant root", (draft) => {
      updateBoxProps(draft, {
        ...target,
        nodeId: created.variantRoot.id,
        breakpointId: "bp_desktop",
        patch: { size: { width: { mode: "fixed", value: 500 } } },
      });
    });
    expect(edited.project.components[0]!.variants[0]!.root.responsive.base.size.width).toEqual({
      mode: "fixed",
      value: 500,
    });

    const back = undo(edited);
    expect(back.project.components[0]!.variants[0]!.root.responsive.base.size.width).toEqual({
      mode: "fixed",
      value: 200,
    });

    const forward = redo(back);
    expect(forward.project.components[0]!.variants[0]!.root.responsive.base.size.width).toEqual({
      mode: "fixed",
      value: 500,
    });
  });
});
