/**
 * The floating bar at the top of the canvas while a component variant is being
 * edited. It names the component and variant, switches the edited variant and
 * adds a new one. Leaving the bar returns to the page with the opening instance
 * selected (the store restores that selection).
 */

import type { ComponentDefinition, ComponentVariant } from "@webfm/model";
import { useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import "./ComponentBar.css";

interface ComponentBarProps {
  component: ComponentDefinition;
  variant: ComponentVariant;
}

function ChevronLeftIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  );
}

export function ComponentBar({ component, variant }: ComponentBarProps) {
  const exitComponent = useProjectStore((state) => state.exitComponent);
  const setEditingVariant = useProjectStore((state) => state.setEditingVariant);
  const addComponentVariant = useProjectStore((state) => state.addComponentVariant);

  return (
    <div
      className="wfm-component-bar"
      role="toolbar"
      aria-label="Component"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button type="button" className="wfm-component-bar__back" onClick={() => exitComponent()}>
        <ChevronLeftIcon />
        <span>Back to page</span>
      </button>

      <span className="wfm-component-bar__separator" aria-hidden="true" />

      <Icon name="component" size={14} className="wfm-component-bar__glyph" />
      <span className="wfm-component-bar__name" title={component.name}>
        {component.name}
      </span>

      <select
        className="wfm-component-bar__select"
        aria-label="Variant"
        value={variant.id}
        onChange={(event) => setEditingVariant(event.target.value)}
      >
        {component.variants.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="wfm-component-bar__add"
        title="Add variant"
        onClick={() => addComponentVariant()}
      >
        <Icon name="plus" size={12} />
        <span>Add variant</span>
      </button>
    </div>
  );
}
