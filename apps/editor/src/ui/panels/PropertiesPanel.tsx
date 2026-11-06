/**
 * The Style tab property panel.
 *
 * Matches the verified Framer inspector: one section per property group for a
 * single selected layer, a layer count for a multi-selection, and the page fill
 * when nothing is selected. Every write goes through the project store so
 * autosave and undo see it; display values are resolved for the active
 * breakpoint with `resolveNodeProps`.
 */

import {
  type Border,
  type BoxProps,
  type Breakpoint,
  type BreakpointId,
  type ComponentDefinition,
  type ComponentInstanceNode,
  type ComponentVariant,
  type DeepPartial,
  type Fill,
  findComponentInstances,
  findNode,
  type ImageNode,
  type ImageProps,
  type LayoutProps,
  type NodeId,
  type Project,
  resolveNodeProps,
  type SceneNode,
  type Shadow,
  type SizeMode,
  type SizeProps,
  type SizeValue,
  type StyleProps,
  type TextAlign,
  type TextProps,
  type VariantId,
} from "@webfm/model";
import { resolveFillStyles } from "@webfm/render";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { activeSceneOf, useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import "./PropertiesPanel.css";

/* ------------------------------------------------------------------ helpers */

const FONT_FAMILIES = ["Inter", "Arial", "Georgia", "Times New Roman", "Courier New"];
const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const SIZING_OPTIONS: Array<{ value: SizeMode | "viewport"; label: string; disabled?: boolean }> = [
  { value: "fixed", label: "Fixed" },
  { value: "relative", label: "Relative" },
  { value: "fill", label: "Fill" },
  { value: "hug", label: "Fit Content" },
  { value: "viewport", label: "Viewport", disabled: true },
];

const OVERFLOW_OPTIONS = [
  { value: "clip", label: "Clip" },
  { value: "hidden", label: "Hidden" },
  { value: "visible", label: "Visible" },
] as const;

const BORDER_STYLE_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
] as const;

const ALIGN_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "stretch", label: "Stretch" },
] as const;

const JUSTIFY_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "space-between", label: "Space Between" },
  { value: "space-around", label: "Space Around" },
  { value: "space-evenly", label: "Space Evenly" },
] as const;

const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "justify", label: "Justify" },
] as const;

const IMAGE_FIT_OPTIONS = [
  { value: "fill", label: "Fill" },
  { value: "fit", label: "Fit" },
  { value: "crop", label: "Crop" },
] as const;

const STYLE_PROPERTIES = [
  { id: "fill", label: "Fill" },
  { id: "border", label: "Border" },
  { id: "radius", label: "Radius" },
  { id: "shadow", label: "Shadow" },
  { id: "opacity", label: "Opacity" },
  { id: "overflow", label: "Overflow" },
  { id: "userSelect", label: "User Select" },
] as const;

type StyleProperty = (typeof STYLE_PROPERTIES)[number]["id"];

const DEFAULT_STYLE_PROPERTIES: StyleProperty[] = ["fill", "overflow"];

const DEFAULT_BORDER: Border = { width: 1, color: "#ffffff", style: "solid" };
const DEFAULT_SHADOW: Shadow = { x: 0, y: 4, blur: 12, spread: 0, color: "#000000", inset: false };

function clampNumber(value: number, min?: number, max?: number): number {
  let out = value;
  if (min !== undefined) out = Math.max(min, out);
  if (max !== undefined) out = Math.min(max, out);
  return out;
}

function formatNumber(value: number | null): string {
  return value === null ? "" : String(value);
}

function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    const expanded = raw
      .split("")
      .map((character) => `${character}${character}`)
      .join("");
    return `#${expanded.toLowerCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

function displayHex(value: string): string {
  return (normalizeHex(value) ?? value).replace(/^#/, "").toUpperCase();
}

function colorInputValue(value: string): string {
  return normalizeHex(value) ?? "#000000";
}

function fillLabel(fill: Fill): string {
  switch (fill.type) {
    case "linear-gradient":
      return "Linear gradient";
    case "radial-gradient":
      return "Radial gradient";
    case "image":
      return "Image";
    default:
      return "Solid";
  }
}

function shadowKey(shadow: Shadow): string {
  return `${shadow.x}:${shadow.y}:${shadow.blur}:${shadow.spread}:${shadow.color}:${
    shadow.inset ? "inset" : "outset"
  }`;
}

function shadowSummary(shadow: Shadow): string {
  return `${shadow.x} ${shadow.y} ${shadow.blur} ${shadow.spread}${shadow.inset ? " Inset" : ""}`;
}

function withCurrent<T>(options: readonly T[], current: T): T[] {
  return options.includes(current) ? [...options] : [current, ...options];
}

function numericSize(size: SizeValue): number | null {
  return size.mode === "fixed" || size.mode === "relative" ? (size.value ?? 0) : null;
}

/* ----------------------------------------------------------------- sections */

interface SectionProps {
  title: string;
  children?: ReactNode;
  placeholder?: boolean;
  add?: ReactNode;
  showAdd?: boolean;
}

function Section({ title, children, placeholder = false, add, showAdd = true }: SectionProps) {
  return (
    <section className="wfm-section">
      <div className="wfm-section__header">
        <span className="wfm-section__title">{title}</span>
        {add ??
          (showAdd ? (
            <button
              type="button"
              className="wfm-section__add"
              disabled
              title={
                placeholder
                  ? `${title} is not in this build`
                  : `Add property to ${title} — not in this build`
              }
              aria-label={
                placeholder
                  ? `${title} is not in this build`
                  : `Add property to ${title} — not in this build`
              }
            >
              <Icon name="plus" size={12} />
            </button>
          ) : null)}
      </div>
      {children ? <div className="wfm-section__body">{children}</div> : null}
    </section>
  );
}

/* ------------------------------------------------------------------- inputs */

interface NumberFieldProps {
  value: number | null;
  onCommit: (value: number) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
}

function NumberField({
  value,
  onCommit,
  ariaLabel,
  className,
  disabled = false,
  min,
  max,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(() => formatNumber(value));
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(formatNumber(value));
  }, [value]);

  const reset = () => setDraft(formatNumber(value));

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      reset();
      return;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      reset();
      return;
    }
    const next = clampNumber(parsed, min, max);
    setDraft(formatNumber(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`wfm-field wfm-field--number${className ? ` ${className}` : ""}`}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false;
        if (cancelled.current) {
          cancelled.current = false;
          reset();
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface TextCommitFieldProps {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

function TextCommitField({ value, onCommit, ariaLabel, className }: TextCommitFieldProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const reset = () => setDraft(value);

  return (
    <input
      type="text"
      className={`wfm-field${className ? ` ${className}` : ""}`}
      value={draft}
      aria-label={ariaLabel}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false;
        if (cancelled.current) {
          cancelled.current = false;
          reset();
          return;
        }
        const next = draft.trim();
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface HexFieldProps {
  color: string;
  onCommit: (color: string) => void;
  ariaLabel: string;
}

function HexField({ color, onCommit, ariaLabel }: HexFieldProps) {
  const [draft, setDraft] = useState(() => displayHex(color));
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(displayHex(color));
  }, [color]);

  const reset = () => setDraft(displayHex(color));

  const commit = () => {
    const next = normalizeHex(draft);
    if (!next) {
      reset();
      return;
    }
    if (next !== normalizeHex(color)) onCommit(next);
  };

  return (
    <input
      type="text"
      className="wfm-pp__hex"
      value={draft}
      aria-label={ariaLabel}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false;
        if (cancelled.current) {
          cancelled.current = false;
          reset();
          return;
        }
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

interface QuadFieldsProps {
  labels: readonly [string, string, string, string];
  values: readonly [number, number, number, number];
  onCommit: (index: number, value: number) => void;
  prefix: string;
}

function QuadFields({ labels, values, onCommit, prefix }: QuadFieldsProps) {
  return (
    <div className="wfm-pp__quad">
      {labels.map((label, index) => (
        <NumberField
          key={label}
          value={values[index] ?? 0}
          min={0}
          onCommit={(next) => onCommit(index, next)}
          ariaLabel={`${prefix} ${label}`}
          className="wfm-pp__quad-field"
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------- fill */

interface FillRowProps {
  fill: Fill | null;
  onSet: (fill: Fill) => void;
  onClear: () => void;
  resolveAssetUrl?: (assetId: string) => string | null;
  ariaLabel?: string;
}

function FillRow({ fill, onSet, onClear, resolveAssetUrl, ariaLabel = "Fill" }: FillRowProps) {
  const solid = fill?.type === "solid" ? fill : null;

  if (solid) {
    return (
      <div className="wfm-row">
        <span className="wfm-row__label">Fill</span>
        <span className="wfm-style-value">
          <input
            type="color"
            className="wfm-pp__swatch"
            value={colorInputValue(solid.color)}
            style={{ opacity: solid.opacity }}
            aria-label={`${ariaLabel} color`}
            onChange={(event) => onSet({ ...solid, color: event.target.value })}
          />
          <HexField
            color={solid.color}
            onCommit={(color) => onSet({ ...solid, color })}
            ariaLabel={`${ariaLabel} hex`}
          />
          <button
            type="button"
            className="wfm-remove"
            title="Remove fill"
            aria-label="Remove fill"
            onClick={onClear}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      </div>
    );
  }

  if (fill) {
    return (
      <div className="wfm-row">
        <span className="wfm-row__label">Fill</span>
        <span className="wfm-style-value">
          <span className="wfm-swatch" style={resolveFillStyles(fill, resolveAssetUrl)} />
          <span className="wfm-pp__value-text">{fillLabel(fill)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="wfm-row">
      <span className="wfm-row__label">Fill</span>
      <span className="wfm-style-value">
        <span className="wfm-swatch wfm-pp__swatch-empty" />
        <span className="wfm-pp__value-text">None</span>
        <button
          type="button"
          className="wfm-remove"
          title="Add fill"
          aria-label="Add fill"
          onClick={() => onSet({ type: "solid", color: "#ffffff", opacity: 1 })}
        >
          <Icon name="plus" size={12} />
        </button>
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- breakpoint */

interface BreakpointSectionProps {
  nodeId: NodeId;
  box: BoxProps;
}

function BreakpointSection({ nodeId, box }: BreakpointSectionProps) {
  const updateBox = useProjectStore((state) => state.updateBox);
  const [linked, setLinked] = useState(false);

  const widthNumber = numericSize(box.size.width);
  const heightNumber = numericSize(box.size.height);
  const ratio =
    widthNumber !== null && heightNumber !== null && widthNumber > 0 && heightNumber > 0
      ? widthNumber / heightNumber
      : null;

  const writeSize = (axis: "width" | "height", value: number) => {
    const current = box.size[axis];
    const next: SizeValue = { mode: current.mode, value };
    const patch: DeepPartial<SizeProps> = {};
    if (linked && ratio !== null) {
      if (axis === "width") {
        patch.width = next;
        patch.height = { mode: box.size.height.mode, value: Math.round(value / ratio) };
      } else {
        patch.width = { mode: box.size.width.mode, value: Math.round(value * ratio) };
        patch.height = next;
      }
    } else {
      patch[axis] = next;
    }
    updateBox(nodeId, { size: patch });
  };

  const writeMode = (axis: "width" | "height", mode: SizeMode) => {
    const current = box.size[axis];
    const usesValue = mode === "fixed" || mode === "relative";
    const next: SizeValue = usesValue
      ? { mode, value: current.value ?? (mode === "relative" ? 100 : 0) }
      : { mode };
    updateBox(nodeId, axis === "width" ? { size: { width: next } } : { size: { height: next } });
  };

  return (
    <Section title="Breakpoint">
      <div className="wfm-row">
        <span className="wfm-row__label">Position</span>
        <NumberField
          value={box.position.x}
          onCommit={(value) => updateBox(nodeId, { position: { x: value } })}
          ariaLabel="Position X"
        />
        <span className="wfm-pp__unit">X</span>
        <NumberField
          value={box.position.y}
          onCommit={(value) => updateBox(nodeId, { position: { y: value } })}
          ariaLabel="Position Y"
        />
        <span className="wfm-pp__unit">Y</span>
      </div>

      <div className="wfm-pp__size-group">
        <div className="wfm-row">
          <span className="wfm-row__label">Width</span>
          <NumberField
            value={widthNumber}
            disabled={widthNumber === null}
            min={0}
            onCommit={(value) => writeSize("width", value)}
            ariaLabel="Width"
            className="wfm-pp__size-value"
          />
          <select
            className="wfm-select wfm-pp__size-select"
            value={box.size.width.mode}
            aria-label="Width sizing"
            onChange={(event) => writeMode("width", event.target.value as SizeMode)}
          >
            {SIZING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="wfm-pp__link-row">
          <button
            type="button"
            className={`wfm-link-btn${linked ? " is-active" : ""}`}
            aria-pressed={linked}
            aria-label={linked ? "Unlink width and height" : "Link width and height"}
            title={linked ? "Unlink width and height" : "Link width and height"}
            disabled={ratio === null}
            onClick={() => setLinked((value) => !value)}
          >
            <Icon name="link" size={14} />
          </button>
        </div>

        <div className="wfm-row">
          <span className="wfm-row__label">Height</span>
          <NumberField
            value={heightNumber}
            disabled={heightNumber === null}
            min={0}
            onCommit={(value) => writeSize("height", value)}
            ariaLabel="Height"
            className="wfm-pp__size-value"
          />
          <select
            className="wfm-select wfm-pp__size-select"
            value={box.size.height.mode}
            aria-label="Height sizing"
            onChange={(event) => writeMode("height", event.target.value as SizeMode)}
          >
            {SIZING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- layout */

interface LayoutSectionProps {
  nodeId: NodeId;
  layout: LayoutProps;
}

function LayoutSection({ nodeId, layout }: LayoutSectionProps) {
  const updateBox = useProjectStore((state) => state.updateBox);
  const write = (patch: DeepPartial<LayoutProps>) => updateBox(nodeId, { layout: patch });

  return (
    <Section title="Layout">
      <div className="wfm-row">
        <span className="wfm-row__label">Layout</span>
        <select
          className="wfm-select wfm-row__grow"
          value={layout.mode}
          aria-label="Layout mode"
          onChange={(event) => write({ mode: event.target.value as LayoutProps["mode"] })}
        >
          <option value="none">None</option>
          <option value="stack">Stack</option>
          <option value="grid">Grid</option>
        </select>
      </div>

      {layout.mode === "stack" ? (
        <>
          <div className="wfm-row">
            <span className="wfm-row__label">Direction</span>
            <select
              className="wfm-select wfm-row__grow"
              value={layout.direction}
              aria-label="Stack direction"
              onChange={(event) =>
                write({ direction: event.target.value as LayoutProps["direction"] })
              }
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>

          <div className="wfm-row">
            <span className="wfm-row__label">Gap</span>
            <NumberField
              value={layout.gap}
              min={0}
              onCommit={(value) => write({ gap: value })}
              ariaLabel="Gap"
              className="wfm-row__grow"
            />
            <span className="wfm-pp__unit">PX</span>
          </div>

          <div className="wfm-row">
            <span className="wfm-row__label">Padding</span>
            <QuadFields
              labels={["top", "right", "bottom", "left"]}
              values={[
                layout.padding.top,
                layout.padding.right,
                layout.padding.bottom,
                layout.padding.left,
              ]}
              prefix="Padding"
              onCommit={(index, value) => {
                const keys = ["top", "right", "bottom", "left"] as const;
                const key = keys[index];
                if (key) write({ padding: { [key]: value } });
              }}
            />
          </div>

          <div className="wfm-row">
            <span className="wfm-row__label">Align</span>
            <select
              className="wfm-select wfm-row__grow"
              value={layout.align}
              aria-label="Align"
              onChange={(event) => write({ align: event.target.value as LayoutProps["align"] })}
            >
              {ALIGN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="wfm-row">
            <span className="wfm-row__label">Justify</span>
            <select
              className="wfm-select wfm-row__grow"
              value={layout.justify}
              aria-label="Justify"
              onChange={(event) => write({ justify: event.target.value as LayoutProps["justify"] })}
            >
              {JUSTIFY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="wfm-row">
            <span className="wfm-row__label">Wrap</span>
            <button
              type="button"
              className={`wfm-pp__switch${layout.wrap ? " is-on" : ""}`}
              aria-pressed={layout.wrap}
              aria-label="Wrap"
              title="Wrap"
              onClick={() => write({ wrap: !layout.wrap })}
            />
          </div>
        </>
      ) : null}

      {layout.mode === "grid" ? (
        <>
          <div className="wfm-row">
            <span className="wfm-row__label">Columns</span>
            <NumberField
              value={layout.grid.columns}
              min={1}
              onCommit={(value) => write({ grid: { columns: Math.round(value) } })}
              ariaLabel="Grid columns"
              className="wfm-row__grow"
            />
          </div>

          <div className="wfm-row">
            <span className="wfm-row__label">Rows</span>
            <NumberField
              value={layout.grid.rows}
              min={1}
              onCommit={(value) => write({ grid: { rows: Math.round(value) } })}
              ariaLabel="Grid rows"
              className="wfm-row__grow"
            />
          </div>

          <div className="wfm-row">
            <span className="wfm-row__label">Column gap</span>
            <NumberField
              value={layout.grid.columnGap}
              min={0}
              onCommit={(value) => write({ grid: { columnGap: value } })}
              ariaLabel="Column gap"
              className="wfm-row__grow"
            />
            <span className="wfm-pp__unit">PX</span>
          </div>

          <div className="wfm-row">
            <span className="wfm-row__label">Row gap</span>
            <NumberField
              value={layout.grid.rowGap}
              min={0}
              onCommit={(value) => write({ grid: { rowGap: value } })}
              ariaLabel="Row gap"
              className="wfm-row__grow"
            />
            <span className="wfm-pp__unit">PX</span>
          </div>
        </>
      ) : null}
    </Section>
  );
}

/* --------------------------------------------------------------- typography */

interface TypographySectionProps {
  node: SceneNode;
  breakpointId: BreakpointId;
  breakpoints: Breakpoint[];
}

function TypographySection({ node, breakpointId, breakpoints }: TypographySectionProps) {
  const updateText = useProjectStore((state) => state.updateText);

  if (node.type !== "text") {
    return (
      <Section title="Typography">
        <div className="wfm-row">
          <span className="wfm-row__label">Base</span>
          <input
            type="text"
            className="wfm-field wfm-field--number"
            value="16"
            disabled
            aria-label="Base font size — not editable for frames"
          />
          <span className="wfm-pp__unit">PX</span>
          <div className="wfm-stepper">
            <button
              type="button"
              className="wfm-stepper__button"
              disabled
              aria-label="Decrease font size — not in this build"
            >
              <Icon name="minus" size={14} />
            </button>
            <button
              type="button"
              className="wfm-stepper__button"
              disabled
              aria-label="Increase font size — not in this build"
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
        </div>
      </Section>
    );
  }

  const props = resolveNodeProps<BoxProps & TextProps>(node, breakpointId, breakpoints);
  const text = props.text;
  const lineHeightAuto = text.lineHeight === "auto";
  const lineHeightValue = text.lineHeight === "auto" ? null : text.lineHeight;

  return (
    <Section title="Typography">
      <div className="wfm-row">
        <span className="wfm-row__label">Font</span>
        <select
          className="wfm-select wfm-row__grow"
          value={text.fontFamily}
          aria-label="Font family"
          onChange={(event) => updateText(node.id, { text: { fontFamily: event.target.value } })}
        >
          {withCurrent(FONT_FAMILIES, text.fontFamily).map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </select>
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Base</span>
        <NumberField
          value={text.fontSize}
          min={1}
          max={512}
          onCommit={(value) => updateText(node.id, { text: { fontSize: value } })}
          ariaLabel="Font size"
        />
        <span className="wfm-pp__unit">PX</span>
        <div className="wfm-stepper">
          <button
            type="button"
            className="wfm-stepper__button"
            aria-label="Decrease font size"
            onClick={() =>
              updateText(node.id, { text: { fontSize: Math.max(1, text.fontSize - 1) } })
            }
          >
            <Icon name="minus" size={14} />
          </button>
          <button
            type="button"
            className="wfm-stepper__button"
            aria-label="Increase font size"
            onClick={() => updateText(node.id, { text: { fontSize: text.fontSize + 1 } })}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Weight</span>
        <select
          className="wfm-select wfm-row__grow"
          value={text.fontWeight}
          aria-label="Font weight"
          onChange={(event) =>
            updateText(node.id, { text: { fontWeight: Number(event.target.value) } })
          }
        >
          {withCurrent(FONT_WEIGHTS, text.fontWeight).map((weight) => (
            <option key={weight} value={weight}>
              {weight}
            </option>
          ))}
        </select>
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Line height</span>
        <select
          className="wfm-select wfm-pp__unit-select"
          value={lineHeightAuto ? "auto" : "px"}
          aria-label="Line height unit"
          onChange={(event) => {
            if (event.target.value === "auto") {
              updateText(node.id, { text: { lineHeight: "auto" } });
            } else {
              updateText(node.id, {
                text: { lineHeight: lineHeightValue ?? Math.round(text.fontSize * 1.5) },
              });
            }
          }}
        >
          <option value="auto">Auto</option>
          <option value="px">PX</option>
        </select>
        {lineHeightAuto ? null : (
          <NumberField
            value={lineHeightValue}
            min={1}
            onCommit={(value) => updateText(node.id, { text: { lineHeight: value } })}
            ariaLabel="Line height"
            className="wfm-row__grow"
          />
        )}
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Letter spacing</span>
        <NumberField
          value={text.letterSpacing}
          onCommit={(value) => updateText(node.id, { text: { letterSpacing: value } })}
          ariaLabel="Letter spacing"
          className="wfm-row__grow"
        />
        <span className="wfm-pp__unit">PX</span>
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Color</span>
        <span className="wfm-style-value">
          <input
            type="color"
            className="wfm-pp__swatch"
            value={colorInputValue(text.color)}
            aria-label="Text color"
            onChange={(event) => updateText(node.id, { text: { color: event.target.value } })}
          />
          <HexField
            color={text.color}
            onCommit={(color) => updateText(node.id, { text: { color } })}
            ariaLabel="Text color hex"
          />
        </span>
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Align</span>
        <select
          className="wfm-select wfm-row__grow"
          value={text.align}
          aria-label="Text alignment"
          onChange={(event) =>
            updateText(node.id, { text: { align: event.target.value as TextAlign } })
          }
        >
          {TEXT_ALIGN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Style</span>
        <div className="wfm-pp__toggles">
          <button
            type="button"
            className={`wfm-pp__text-toggle${text.italic ? " is-active" : ""}`}
            aria-pressed={text.italic}
            aria-label="Italic"
            title="Italic"
            onClick={() => updateText(node.id, { text: { italic: !text.italic } })}
          >
            I
          </button>
          <button
            type="button"
            className={`wfm-pp__text-toggle${
              text.textDecoration === "underline" ? " is-active" : ""
            }`}
            aria-pressed={text.textDecoration === "underline"}
            aria-label="Underline"
            title="Underline"
            onClick={() =>
              updateText(node.id, {
                text: {
                  textDecoration: text.textDecoration === "underline" ? "none" : "underline",
                },
              })
            }
          >
            U
          </button>
          <button
            type="button"
            className={`wfm-pp__text-toggle${
              text.textTransform === "uppercase" ? " is-active" : ""
            }`}
            aria-pressed={text.textTransform === "uppercase"}
            aria-label="Uppercase"
            title="Uppercase"
            onClick={() =>
              updateText(node.id, {
                text: {
                  textTransform: text.textTransform === "uppercase" ? "none" : "uppercase",
                },
              })
            }
          >
            AA
          </button>
        </div>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------- image */

interface ImageSectionProps {
  node: ImageNode;
  project: Project;
  breakpointId: BreakpointId;
}

function ImageSection({ node, project, breakpointId }: ImageSectionProps) {
  const updateImage = useProjectStore((state) => state.updateImage);
  const uploadAsset = useProjectStore((state) => state.uploadAsset);
  const fileRef = useRef<HTMLInputElement>(null);

  const props = resolveNodeProps<BoxProps & ImageProps>(node, breakpointId, project.breakpoints);
  const image = props.image;
  const asset = image.assetId
    ? project.assets.find((candidate) => candidate.id === image.assetId)
    : undefined;
  const src = asset?.url ?? image.src;

  const replaceImage = async (file: File) => {
    const uploaded = await uploadAsset(file);
    if (uploaded) {
      updateImage(node.id, { image: { assetId: uploaded.id, src: uploaded.url } });
    }
  };

  return (
    <Section title="Image">
      <div className="wfm-pp__image-preview">
        {src ? <img src={src} alt={image.alt || node.name} /> : <span>No image</span>}
      </div>

      <button type="button" className="wfm-path-button" onClick={() => fileRef.current?.click()}>
        <Icon name="image" size={14} />
        <span>Replace</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        aria-label="Replace image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void replaceImage(file);
        }}
      />

      <div className="wfm-row">
        <span className="wfm-row__label">Alt</span>
        <TextCommitField
          value={image.alt}
          onCommit={(alt) => updateImage(node.id, { image: { alt } })}
          ariaLabel="Image alt text"
          className="wfm-row__grow"
        />
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Fit</span>
        <select
          className="wfm-select wfm-row__grow"
          value={image.fit}
          aria-label="Image fit"
          onChange={(event) =>
            updateImage(node.id, {
              image: { fit: event.target.value as ImageProps["image"]["fit"] },
            })
          }
        >
          {IMAGE_FIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Position</span>
        <NumberField
          value={image.positionX}
          min={0}
          max={100}
          onCommit={(value) => updateImage(node.id, { image: { positionX: value } })}
          ariaLabel="Image position X"
        />
        <span className="wfm-pp__unit">X</span>
        <NumberField
          value={image.positionY}
          min={0}
          max={100}
          onCommit={(value) => updateImage(node.id, { image: { positionY: value } })}
          ariaLabel="Image position Y"
        />
        <span className="wfm-pp__unit">Y</span>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- styles */

interface StylePropertiesMenuProps {
  visible: StyleProperty[];
  onToggle: (property: StyleProperty) => void;
}

function StylePropertiesMenu({ visible, onToggle }: StylePropertiesMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        wrapper.current &&
        event.target instanceof Node &&
        !wrapper.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span className="wfm-pp__menu-wrap" ref={wrapper}>
      <button
        type="button"
        className="wfm-section__add"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Add property"
        title="Add property"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="plus" size={14} />
      </button>
      {open ? (
        <div className="wfm-pp__prop-menu" role="menu">
          {STYLE_PROPERTIES.map((property) => (
            <button
              key={property.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={visible.includes(property.id)}
              className="wfm-pp__prop-item"
              onClick={() => {
                onToggle(property.id);
                setOpen(false);
              }}
            >
              <span className="wfm-pp__prop-check">
                {visible.includes(property.id) ? <Icon name="check" size={12} /> : null}
              </span>
              {property.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

interface OpacityControlProps {
  opacity: number;
  onChange: (opacity: number) => void;
}

function OpacityControl({ opacity, onChange }: OpacityControlProps) {
  const percent = Math.round(opacity * 100);
  const [draft, setDraft] = useState(percent);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(percent);
  }, [percent]);

  const commit = (value: number) => {
    const next = clampNumber(Math.round(value), 0, 100);
    setDraft(next);
    if (next !== percent) onChange(next / 100);
  };

  return (
    <div className="wfm-row">
      <span className="wfm-row__label">Opacity</span>
      <input
        type="range"
        className="wfm-pp__slider"
        min={0}
        max={100}
        value={draft}
        aria-label="Opacity"
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        onBlur={() => {
          focused.current = false;
          commit(draft);
        }}
      />
      <NumberField
        value={draft}
        min={0}
        max={100}
        onCommit={commit}
        ariaLabel="Opacity percent"
        className="wfm-pp__opacity-number"
      />
      <span className="wfm-pp__unit">%</span>
    </div>
  );
}

interface BorderControlProps {
  border: Border | null;
  onChange: (border: Border) => void;
}

function BorderControl({ border, onChange }: BorderControlProps) {
  const value = border ?? DEFAULT_BORDER;

  return (
    <>
      <div className="wfm-row">
        <span className="wfm-row__label">Border</span>
        <NumberField
          value={value.width}
          min={0}
          onCommit={(width) => onChange({ ...value, width })}
          ariaLabel="Border width"
          className="wfm-row__grow"
        />
        <select
          className="wfm-select wfm-pp__unit-select"
          value={value.style}
          aria-label="Border style"
          onChange={(event) => onChange({ ...value, style: event.target.value as Border["style"] })}
        >
          {BORDER_STYLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="wfm-row">
        <span className="wfm-row__label">Color</span>
        <span className="wfm-style-value">
          <input
            type="color"
            className="wfm-pp__swatch"
            value={colorInputValue(value.color)}
            aria-label="Border color"
            onChange={(event) => onChange({ ...value, color: event.target.value })}
          />
          <HexField
            color={value.color}
            onCommit={(color) => onChange({ ...value, color })}
            ariaLabel="Border color hex"
          />
        </span>
      </div>
    </>
  );
}

interface RadiusControlProps {
  radius: StyleProps["radius"];
  onCommit: (index: number, value: number) => void;
}

function RadiusControl({ radius, onCommit }: RadiusControlProps) {
  return (
    <div className="wfm-row">
      <span className="wfm-row__label">Radius</span>
      <QuadFields
        labels={["top left", "top right", "bottom right", "bottom left"]}
        values={[radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft]}
        prefix="Radius"
        onCommit={onCommit}
      />
    </div>
  );
}

interface ShadowControlProps {
  shadows: Shadow[];
  onAdd: () => void;
  onRemove: (index: number) => void;
}

function ShadowControl({ shadows, onAdd, onRemove }: ShadowControlProps) {
  return (
    <>
      {shadows.map((shadow, index) => (
        <div className="wfm-pp__shadow-row" key={shadowKey(shadow)}>
          <span className="wfm-style-value">
            <span className="wfm-swatch" style={{ background: shadow.color }} />
            <span className="wfm-pp__value-text">{shadowSummary(shadow)}</span>
          </span>
          <button
            type="button"
            className="wfm-remove"
            title="Remove shadow"
            aria-label="Remove shadow"
            onClick={() => onRemove(index)}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
      <button type="button" className="wfm-pp__add-button" onClick={onAdd}>
        <Icon name="plus" size={12} />
        Add shadow
      </button>
    </>
  );
}

interface StylesSectionProps {
  nodeId: NodeId;
  style: StyleProps;
  project: Project;
}

function StylesSection({ nodeId, style, project }: StylesSectionProps) {
  const updateBox = useProjectStore((state) => state.updateBox);
  const [visibility, setVisibility] = useState<Record<string, StyleProperty[]>>({});
  const visible = visibility[nodeId] ?? DEFAULT_STYLE_PROPERTIES;

  const write = (patch: DeepPartial<StyleProps>) => updateBox(nodeId, { style: patch });
  const resolveAssetUrl = (assetId: string) =>
    project.assets.find((asset) => asset.id === assetId)?.url ?? null;

  const toggleProperty = (property: StyleProperty) => {
    setVisibility((current) => {
      const currentVisible = current[nodeId] ?? DEFAULT_STYLE_PROPERTIES;
      const next = currentVisible.includes(property)
        ? currentVisible.filter((candidate) => candidate !== property)
        : [...currentVisible, property];
      return { ...current, [nodeId]: next };
    });
  };

  return (
    <Section
      title="Styles"
      add={<StylePropertiesMenu visible={visible} onToggle={toggleProperty} />}
    >
      {visible.includes("fill") ? (
        <FillRow
          fill={style.fill}
          onSet={(fill) => write({ fill })}
          onClear={() => write({ fill: null })}
          resolveAssetUrl={resolveAssetUrl}
        />
      ) : null}

      {visible.includes("border") ? (
        <BorderControl border={style.border} onChange={(border) => write({ border })} />
      ) : null}

      {visible.includes("radius") ? (
        <RadiusControl
          radius={style.radius}
          onCommit={(index, value) => {
            const keys = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
            const key = keys[index];
            if (key) write({ radius: { [key]: value } });
          }}
        />
      ) : null}

      {visible.includes("shadow") ? (
        <ShadowControl
          shadows={style.shadows}
          onAdd={() => write({ shadows: [...style.shadows, DEFAULT_SHADOW] })}
          onRemove={(index) =>
            write({ shadows: style.shadows.filter((_shadow, position) => position !== index) })
          }
        />
      ) : null}

      {visible.includes("opacity") ? (
        <OpacityControl opacity={style.opacity} onChange={(opacity) => write({ opacity })} />
      ) : null}

      {visible.includes("overflow") ? (
        <div className="wfm-row">
          <span className="wfm-row__label">Overflow</span>
          <select
            className="wfm-select wfm-row__grow"
            value={style.overflow}
            aria-label="Overflow"
            onChange={(event) => write({ overflow: event.target.value as StyleProps["overflow"] })}
          >
            {OVERFLOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {visible.includes("userSelect") ? (
        <div className="wfm-row">
          <span className="wfm-row__label">User Select</span>
          <span className="wfm-style-value">
            <span className="wfm-pp__value-text wfm-pp__muted">Not in this build</span>
          </span>
        </div>
      ) : null}
    </Section>
  );
}

/* -------------------------------------------------------------- page level */

/** Verified: with nothing selected, Framer shows page Typography then Template. */
function PageDefaultsPanel() {
  return (
    <>
      <Section title="Typography">
        <div className="wfm-row">
          <span className="wfm-row__label">Base</span>
          <span className="wfm-style-value" style={{ width: 61, flex: "none" }}>
            <span className="wfm-pp__value-text">16</span>
            <span className="wfm-pp__unit">PX</span>
          </span>
          <span className="wfm-stepper">
            <button
              type="button"
              className="wfm-stepper__button"
              disabled
              title="Page typography is not in this build"
            >
              <Icon name="minus" size={12} />
            </button>
            <button
              type="button"
              className="wfm-stepper__button"
              disabled
              title="Page typography is not in this build"
            >
              <Icon name="plus" size={12} />
            </button>
          </span>
        </div>
      </Section>
      <Section title="Template" placeholder />
    </>
  );
}

/* -------------------------------------------------------------- components */

/**
 * Inspector for a selected component instance. An instance inherits its
 * master's appearance, so only placement and the variant choice are editable
 * here; showing the style controls would be dishonest.
 */
interface InstanceInspectorProps {
  node: ComponentInstanceNode;
  project: Project;
  breakpointId: BreakpointId;
}

function InstanceInspector({ node, project, breakpointId }: InstanceInspectorProps) {
  const setInstanceVariant = useProjectStore((state) => state.setInstanceVariant);
  const enterComponent = useProjectStore((state) => state.enterComponent);

  const component =
    project.components.find((candidate) => candidate.id === node.componentId) ?? null;
  const missing = component === null;
  const variantId: VariantId | null = component
    ? (component.variants.find((variant) => variant.id === node.variantId)?.id ??
      component.variants.find((variant) => variant.id === component.defaultVariantId)?.id ??
      component.variants[0]?.id ??
      null)
    : null;
  const box = resolveNodeProps<BoxProps>(node, breakpointId, project.breakpoints);

  const editMain = () => {
    if (!component) return;
    enterComponent(component.id, variantId ?? component.defaultVariantId, node.id);
  };

  return (
    <>
      <Section title="Component">
        <div className="wfm-row">
          <span className="wfm-row__label">Main</span>
          <span className="wfm-style-value">
            <span className="wfm-pp__value-text">
              {component ? component.name : "Missing component"}
            </span>
          </span>
        </div>
        <div className="wfm-row">
          <span className="wfm-row__label">Variant</span>
          <select
            className="wfm-select wfm-row__grow"
            value={variantId ?? ""}
            aria-label="Instance variant"
            disabled={missing || variantId === null}
            onChange={(event) => setInstanceVariant(node.id, event.target.value)}
          >
            {component?.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="wfm-pp__add-button" disabled={missing} onClick={editMain}>
          Edit main component
        </button>
      </Section>
      <Section title="Template" placeholder />
      <BreakpointSection nodeId={node.id} box={box} />
      <Section title="Overrides">
        <p className="wfm-pp__note">Style and content overrides on instances are the next slice.</p>
      </Section>
    </>
  );
}

/**
 * Inspector shown with nothing selected while editing a component. Page
 * typography and template do not apply to a component variant.
 */
interface ComponentModePanelProps {
  component: ComponentDefinition;
  variant: ComponentVariant;
  project: Project;
}

function ComponentModePanel({ component, variant, project }: ComponentModePanelProps) {
  const setEditingVariant = useProjectStore((state) => state.setEditingVariant);
  const addComponentVariant = useProjectStore((state) => state.addComponentVariant);
  const instanceCount = findComponentInstances(project, component.id).length;

  return (
    <Section title="Component">
      <div className="wfm-row">
        <span className="wfm-row__label">Main</span>
        <span className="wfm-style-value">
          <span className="wfm-pp__value-text">{component.name}</span>
        </span>
      </div>
      <div className="wfm-row">
        <span className="wfm-row__label">Variant</span>
        <select
          className="wfm-select wfm-row__grow"
          value={variant.id}
          aria-label="Editing variant"
          onChange={(event) => setEditingVariant(event.target.value)}
        >
          {component.variants.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="wfm-pp__add-button" onClick={() => addComponentVariant()}>
        Add variant
      </button>
      <div className="wfm-row">
        <span className="wfm-row__label">Instances</span>
        <span className="wfm-style-value">
          <span className="wfm-pp__value-text">{instanceCount}</span>
        </span>
      </div>
      <div className="wfm-pp__variant-list">
        {component.variants.map((candidate) => (
          <div
            key={candidate.id}
            className={`wfm-pp__variant-item${candidate.id === variant.id ? " is-active" : ""}`}
          >
            <span className="wfm-pp__variant-dot" aria-hidden="true" />
            <span className="wfm-pp__variant-name">{candidate.name}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- panel */

function MultipleSelectionPanel({ count }: { count: number }) {
  return (
    <section className="wfm-section">
      <div className="wfm-section__header">
        <span className="wfm-section__title">{count} layers selected</span>
      </div>
    </section>
  );
}

interface NodeInspectorProps {
  node: SceneNode;
  project: Project;
  breakpointId: BreakpointId;
}

function NodeInspector({ node, project, breakpointId }: NodeInspectorProps) {
  const box = resolveNodeProps<BoxProps>(node, breakpointId, project.breakpoints);

  return (
    <>
      <Section title="Template" placeholder />
      <BreakpointSection nodeId={node.id} box={box} />
      {node.type === "image" ? (
        <ImageSection node={node} project={project} breakpointId={breakpointId} />
      ) : null}
      <LayoutSection nodeId={node.id} layout={box.layout} />
      <TypographySection
        node={node}
        breakpointId={breakpointId}
        breakpoints={project.breakpoints}
      />
      <Section title="Overlays" placeholder />
      <Section title="Cursor" placeholder />
      <Section title="Effects" placeholder />
      <StylesSection nodeId={node.id} style={box.style} project={project} />
      <Section title="Code overrides" placeholder />
    </>
  );
}

export function PropertiesPanel() {
  const project = useProjectStore((state) => state.project);
  const activePageId = useProjectStore((state) => state.activePageId);
  const activeBreakpointId = useProjectStore((state) => state.activeBreakpointId);
  const editingComponent = useProjectStore((state) => state.editingComponent);
  const selection = useProjectStore((state) => state.selection);

  const scene = activeSceneOf(project, activePageId, editingComponent);
  if (!project || !scene) return null;

  if (selection.length > 1) {
    return <MultipleSelectionPanel count={selection.length} />;
  }

  const selectedId = selection[0];
  const node = selectedId ? findNode(scene.root, selectedId) : null;

  if (!node) {
    if (scene.kind === "component" && scene.component && scene.variant) {
      return (
        <ComponentModePanel component={scene.component} variant={scene.variant} project={project} />
      );
    }
    return <PageDefaultsPanel />;
  }

  if (node.type === "componentInstance") {
    return <InstanceInspector node={node} project={project} breakpointId={activeBreakpointId} />;
  }

  return <NodeInspector node={node} project={project} breakpointId={activeBreakpointId} />;
}
