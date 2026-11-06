import type {
  ComponentDefinition,
  ComponentInstanceNode,
  FrameNode,
  Project,
  VariantId,
} from "@webfm/model";
import { findNode } from "@webfm/model";

export interface ResolvedComponentInstance {
  component: ComponentDefinition;
  variantId: VariantId;
  /** Clone of the variant root with property bindings applied. */
  root: FrameNode;
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
 */
export function resolveComponentInstance(
  project: Project,
  instance: ComponentInstanceNode,
): ResolvedComponentInstance | null {
  const component = project.components.find((entry) => entry.id === instance.componentId);
  if (!component) return null;

  const requestedId = instance.variantId ?? component.defaultVariantId;
  const variant =
    component.variants.find((entry) => entry.id === requestedId) ??
    component.variants.find((entry) => entry.id === component.defaultVariantId) ??
    component.variants[0];
  if (!variant) return null;

  const root = structuredClone(variant.root);

  for (const binding of component.bindings) {
    const value = instance.propertyValues[binding.propertyId];
    if (value === undefined) continue;

    const node = findNode(root, binding.nodeId);
    if (!node) continue;

    // Bindings address resolved props, which live on the base responsive value.
    const props = node.responsive.base as unknown as Record<string, unknown>;
    setPath(props, binding.path, value);
  }

  return { component, variantId: variant.id, root };
}
