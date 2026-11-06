import type {
  ComponentDefinition,
  ComponentId,
  ComponentInstanceNode,
  ComponentPropertyValue,
  ComponentVariant,
  FrameNode,
  Project,
  PropertyId,
  VariantId,
} from "@webfm/model";
import { findNode } from "@webfm/model";

export interface ResolvedComponentInstance {
  component: ComponentDefinition;
  variantId: VariantId;
  /** Clone of the variant root with property bindings applied. */
  root: FrameNode;
}

/** The master scene the editor renders while editing a component. */
export interface ResolvedComponentScene {
  component: ComponentDefinition;
  variant: ComponentVariant;
  /** The variant's own root. Not cloned: editor edits must reach the master. */
  root: FrameNode;
}

/** Picks the requested variant, then the default, then the first one. */
function pickVariant(
  component: ComponentDefinition,
  variantId: VariantId | null | undefined,
): ComponentVariant | undefined {
  const requestedId = variantId ?? component.defaultVariantId;
  return (
    component.variants.find((entry) => entry.id === requestedId) ??
    component.variants.find((entry) => entry.id === component.defaultVariantId) ??
    component.variants[0]
  );
}

/**
 * The value a binding should use: the instance's own value when it has one,
 * otherwise the property's declared default.
 */
function propertyValueFor(
  component: ComponentDefinition,
  instance: ComponentInstanceNode,
  propertyId: PropertyId,
): ComponentPropertyValue | undefined {
  const instanceValue = instance.propertyValues[propertyId];
  if (instanceValue !== undefined) return instanceValue;

  const property = component.properties.find((entry) => entry.id === propertyId);
  return property?.defaultValue;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return;

  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]!;
    const next = cursor[key];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]!] = value;
}

/**
 * Resolves a component instance to a cloned variant root. Instance property
 * values are written through the component's bindings into the node's base
 * props, so the result is a normal frame tree the renderer already understands.
 * Missing instance values fall back to each property's declared default.
 */
export function resolveComponentInstance(
  project: Project,
  instance: ComponentInstanceNode,
): ResolvedComponentInstance | null {
  const component = project.components.find((entry) => entry.id === instance.componentId);
  if (!component) return null;

  const variant = pickVariant(component, instance.variantId);
  if (!variant) return null;

  const root = structuredClone(variant.root);

  for (const binding of component.bindings) {
    const value = propertyValueFor(component, instance, binding.propertyId);
    if (value === undefined) continue;

    const node = findNode(root, binding.nodeId);
    if (!node) continue;

    // Top-level node fields are not inside responsive.base.
    if (binding.path === "visible") {
      node.visible = Boolean(value);
      continue;
    }
    if (binding.path === "locked") {
      node.locked = Boolean(value);
      continue;
    }
    if (binding.path === "name") {
      node.name = String(value);
      continue;
    }

    // Bindings address resolved props, which live on the base responsive value.
    const props = node.responsive.base as unknown as Record<string, unknown>;
    setPath(props, binding.path, value);
  }

  return { component, variantId: variant.id, root };
}

/**
 * Resolves the master scene for component edit mode. Unlike an instance, this
 * exposes the variant root itself so the editor renders (and edits) the master.
 */
export function resolveComponentScene(
  project: Project,
  componentId: ComponentId,
  variantId?: VariantId,
): ResolvedComponentScene | null {
  const component = project.components.find((entry) => entry.id === componentId);
  if (!component) return null;

  const variant = pickVariant(component, variantId);
  if (!variant) return null;

  return { component, variant, root: variant.root };
}
