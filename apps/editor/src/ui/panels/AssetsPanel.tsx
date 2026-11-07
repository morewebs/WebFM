/**
 * Assets tab.
 *
 * Lists the project's components, color styles and image assets. Component
 * cards insert an instance (page mode only; the model is page-only for now) and
 * offer an Edit action that enters the main component. Color cards apply a
 * saved style to the selection and edit it inline. Image cards keep the upload
 * endpoint and `createImage` insertion, so undo and autosave cover both paths
 * like any other edit.
 */

import {
  type Asset,
  type ColorStyle,
  countColorStyleUsages,
  countTextStyleUsages,
  createImage,
  findComponentInstances,
  type TextAlign,
  type TextDecoration,
  type TextStyle,
  type TextTransform,
} from "@webfm/model";
import { FONT_OPTIONS, resolveFillStyles } from "@webfm/render";
import { type ChangeEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "../../state/project-store";
import { ensureFontLoaded } from "../fonts";
import { Icon } from "../icons";
import "./AssetsPanel.css";

function isImage(asset: Asset): boolean {
  return asset.mimeType.startsWith("image/");
}

/** Native color input wants a six-digit hex value. */
function colorInputValue(color: string): string {
  const trimmed = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const digits = trimmed.slice(1);
    return `#${digits
      .split("")
      .map((digit) => digit + digit)
      .join("")}`.toLowerCase();
  }
  return "#000000";
}

const SYSTEM_FONT_OPTIONS = FONT_OPTIONS.filter((option) => !option.google);
const GOOGLE_FONT_OPTIONS = FONT_OPTIONS.filter((option) => option.google);
const KNOWN_FONT_FAMILIES = new Set(FONT_OPTIONS.map((option) => option.family));
const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const TEXT_ALIGN_OPTIONS: Array<{ value: TextAlign; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "justify", label: "Justify" },
];
const TEXT_TRANSFORM_OPTIONS: Array<{ value: TextTransform; label: string }> = [
  { value: "none", label: "None" },
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "capitalize", label: "Capitalize" },
];
const TEXT_DECORATION_OPTIONS: Array<{ value: TextDecoration; label: string }> = [
  { value: "none", label: "None" },
  { value: "underline", label: "Underline" },
  { value: "line-through", label: "Strikethrough" },
];

/** Inline-editor draft: numeric fields stay strings so empty input is invalid. */
interface TextStyleDraft {
  name: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  lineHeightAuto: boolean;
  lineHeight: string;
  letterSpacing: string;
  color: string;
  align: TextAlign;
  textTransform: TextTransform;
  textDecoration: TextDecoration;
  italic: boolean;
}

function draftFromStyle(style: TextStyle): TextStyleDraft {
  const values = style.values;
  return {
    name: style.name,
    fontFamily: values.fontFamily,
    fontSize: String(values.fontSize),
    fontWeight: values.fontWeight,
    lineHeightAuto: values.lineHeight === "auto",
    lineHeight: values.lineHeight === "auto" ? "" : String(values.lineHeight),
    letterSpacing: String(values.letterSpacing),
    color: colorInputValue(values.color),
    align: values.align,
    textTransform: values.textTransform,
    textDecoration: values.textDecoration,
    italic: values.italic,
  };
}

/** A CSS stack for the "Aa" preview in the card. */
function previewFontFamily(family: string): string {
  const clean = family.replace(/"/g, "").trim();
  return clean.length > 0 ? `"${clean}", sans-serif` : "sans-serif";
}

export function AssetsPanel() {
  const project = useProjectStore((state) => state.project);
  const editingComponent = useProjectStore((state) => state.editingComponent);
  const uploadAsset = useProjectStore((state) => state.uploadAsset);
  const insertNode = useProjectStore((state) => state.insertNode);
  const insertComponentInstance = useProjectStore((state) => state.insertComponentInstance);
  const enterComponent = useProjectStore((state) => state.enterComponent);
  const createColorStyle = useProjectStore((state) => state.createColorStyle);
  const updateColorStyle = useProjectStore((state) => state.updateColorStyle);
  const removeColorStyle = useProjectStore((state) => state.removeColorStyle);
  const applyColorStyle = useProjectStore((state) => state.applyColorStyle);
  const createTextStyle = useProjectStore((state) => state.createTextStyle);
  const updateTextStyle = useProjectStore((state) => state.updateTextStyle);
  const removeTextStyle = useProjectStore((state) => state.removeTextStyle);
  const applyTextStyle = useProjectStore((state) => state.applyTextStyle);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [editingColorName, setEditingColorName] = useState("");
  const [editingColorValue, setEditingColorValue] = useState("#000000");
  const [editingColorOpacity, setEditingColorOpacity] = useState("100");
  const [textError, setTextError] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextDraft, setEditingTextDraft] = useState<TextStyleDraft | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const assets = project?.assets ?? [];
  const components = project?.components ?? [];
  const colorStyles = project?.colorStyles ?? [];
  const textStyles = project?.textStyles ?? [];
  const componentMode = editingComponent !== null;

  // An open inline editor follows the saved style. Undo/redo or an external
  // change re-seeds the drafts; deleting the style closes the editor.
  const editingStyle = editingColorId
    ? colorStyles.find((style) => style.id === editingColorId)
    : undefined;
  const editingStyleName = editingStyle?.name;
  const editingStyleColor = editingStyle?.color;
  const editingStyleOpacity = editingStyle?.opacity;
  useEffect(() => {
    if (!editingColorId) return;
    if (
      editingStyleName === undefined ||
      editingStyleColor === undefined ||
      editingStyleOpacity === undefined
    ) {
      setEditingColorId(null);
      setColorError(null);
      return;
    }
    setEditingColorName(editingStyleName);
    setEditingColorValue(colorInputValue(editingStyleColor));
    setEditingColorOpacity(String(Math.round(editingStyleOpacity * 100)));
    setColorError(null);
  }, [editingColorId, editingStyleName, editingStyleColor, editingStyleOpacity]);

  // Usage counts scan every page and component variant, so derive once.
  const colorUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!project) return counts;
    for (const style of project.colorStyles) {
      counts.set(style.id, countColorStyleUsages(project, style.id));
    }
    return counts;
  }, [project]);

  const startEditColor = (style: ColorStyle): void => {
    setEditingColorId(style.id);
    setEditingColorName(style.name);
    setEditingColorValue(colorInputValue(style.color));
    setEditingColorOpacity(String(Math.round(style.opacity * 100)));
    setColorError(null);
  };

  const cancelEditColor = (): void => {
    setEditingColorId(null);
    setColorError(null);
  };

  const commitEditColor = (): void => {
    if (!editingColorId) return;
    const name = editingColorName.trim();
    if (name.length === 0) {
      setColorError("Color name cannot be empty.");
      return;
    }
    const rawOpacity = editingColorOpacity.trim();
    if (rawOpacity.length === 0) {
      setColorError("Opacity must be from 0 to 100.");
      return;
    }
    const opacityPercent = Number(rawOpacity);
    if (!Number.isFinite(opacityPercent) || opacityPercent < 0 || opacityPercent > 100) {
      setColorError("Opacity must be from 0 to 100.");
      return;
    }
    if (
      !updateColorStyle(editingColorId, {
        name,
        color: editingColorValue,
        opacity: opacityPercent / 100,
      })
    ) {
      setColorError(useProjectStore.getState().error ?? "Could not update the color style.");
      return;
    }
    setEditingColorId(null);
    setColorError(null);
  };

  // The text-style editor follows the saved style the same way. Re-seed on
  // undo/redo or external edits; close when the style is deleted.
  const editingTextStyle = editingTextId
    ? textStyles.find((style) => style.id === editingTextId)
    : undefined;
  // Depend on the saved values, not object identity: an autosave response
  // replaces every project object and must not wipe an unsaved draft.
  const editingTextSignature = editingTextStyle
    ? JSON.stringify([editingTextStyle.name, editingTextStyle.values])
    : null;
  useEffect(() => {
    if (!editingTextId) return;
    const style = useProjectStore
      .getState()
      .project?.textStyles.find((candidate) => candidate.id === editingTextId);
    if (!style) {
      setEditingTextId(null);
      setEditingTextDraft(null);
      setTextError(null);
      return;
    }
    setEditingTextDraft(draftFromStyle(style));
    setTextError(null);
  }, [editingTextId, editingTextSignature]);

  const textUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!project) return counts;
    for (const style of project.textStyles) {
      counts.set(style.id, countTextStyleUsages(project, style.id));
    }
    return counts;
  }, [project]);

  // Saved styles render in the Assets panel even when no layer uses them yet,
  // so their Google fonts must load on open too.
  const textStyleFontKey = textStyles
    .map((style) => style.values.fontFamily.trim().toLowerCase())
    .join("|");
  useEffect(() => {
    const styles = useProjectStore.getState().project?.textStyles ?? [];
    for (const style of styles) ensureFontLoaded(style.values.fontFamily);
  }, [textStyleFontKey]);

  const startEditText = (style: TextStyle): void => {
    ensureFontLoaded(style.values.fontFamily);
    setEditingTextId(style.id);
    setEditingTextDraft(draftFromStyle(style));
    setTextError(null);
  };

  const cancelEditText = (): void => {
    setEditingTextId(null);
    setEditingTextDraft(null);
    setTextError(null);
  };

  const commitEditText = (): void => {
    if (!editingTextId || !editingTextDraft) return;
    const draft = editingTextDraft;
    const name = draft.name.trim();
    if (name.length === 0) {
      setTextError("Text style name cannot be empty.");
      return;
    }
    const fontSize = Number(draft.fontSize.trim());
    if (draft.fontSize.trim().length === 0 || !Number.isFinite(fontSize) || fontSize <= 0) {
      setTextError("Font size must be a positive number.");
      return;
    }
    const lineHeight = draft.lineHeightAuto ? "auto" : Number(draft.lineHeight.trim());
    if (
      lineHeight !== "auto" &&
      (draft.lineHeight.trim().length === 0 || !Number.isFinite(lineHeight) || lineHeight < 0)
    ) {
      setTextError('Line height must be "auto" or a non-negative number.');
      return;
    }
    const letterSpacing = Number(draft.letterSpacing.trim());
    if (draft.letterSpacing.trim().length === 0 || !Number.isFinite(letterSpacing)) {
      setTextError("Letter spacing must be a number.");
      return;
    }
    if (
      !updateTextStyle(editingTextId, {
        name,
        values: {
          fontFamily: draft.fontFamily,
          fontSize,
          fontWeight: draft.fontWeight,
          lineHeight,
          letterSpacing,
          color: draft.color,
          align: draft.align,
          textTransform: draft.textTransform,
          textDecoration: draft.textDecoration,
          italic: draft.italic,
        },
      })
    ) {
      setTextError(useProjectStore.getState().error ?? "Could not update the text style.");
      return;
    }
    setEditingTextId(null);
    setEditingTextDraft(null);
    setTextError(null);
  };

  const updateDraft = (patch: Partial<TextStyleDraft>): void => {
    setEditingTextDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const handleEditorKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEditText();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEditText();
    }
  };

  // Instance counts scan the whole project, so derive them once per revision.
  const instanceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!project) return counts;
    for (const component of project.components) {
      counts.set(component.id, findComponentInstances(project, component.id).length);
    }
    return counts;
  }, [project]);

  const openPicker = (): void => {
    inputRef.current?.click();
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be uploaded.");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const asset = await uploadAsset(file);
      if (!asset) {
        setError(useProjectStore.getState().error ?? "Upload failed.");
      }
    } finally {
      setUploading(false);
    }
  };

  const insertAsset = (asset: Asset): void => {
    if (!isImage(asset)) return;
    insertNode(
      createImage({
        props: {
          image: {
            assetId: asset.id,
            src: asset.url,
            alt: asset.name,
          },
        },
      }),
    );
  };

  return (
    <div className="wfm-panel-control">
      <button
        type="button"
        className="wfm-assets__upload"
        onClick={openPicker}
        disabled={uploading}
        aria-busy={uploading}
      >
        <Icon name="plus" size={14} />
        {uploading ? "Uploading…" : "Upload"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Upload image"
        onChange={(event) => void handleFiles(event)}
      />

      {uploading ? (
        <div className="wfm-assets__progress" role="progressbar" aria-label="Uploading">
          <span />
        </div>
      ) : null}

      {error ? (
        <p className="wfm-assets__error" role="alert">
          {error}
        </p>
      ) : null}

      {components.length > 0 ? (
        <section className="wfm-assets__section" aria-label="Components">
          <div className="wfm-panel-section__header">
            <span>Components</span>
          </div>
          <div className="wfm-assets__components">
            {components.map((component) => {
              const instances = instanceCounts.get(component.id) ?? 0;
              return (
                <div
                  key={component.id}
                  className={`wfm-component-card${componentMode ? " is-disabled" : ""}`}
                >
                  <button
                    type="button"
                    className="wfm-component-card__main"
                    onClick={() =>
                      insertComponentInstance(component.id, component.defaultVariantId)
                    }
                    disabled={componentMode}
                    title={
                      componentMode ? "Nested components are next" : `Insert ${component.name}`
                    }
                  >
                    <span className="wfm-component-card__glyph">
                      <Icon name="component" size={16} />
                    </span>
                    <span className="wfm-component-card__meta">
                      <span className="wfm-component-card__name">{component.name}</span>
                      <span className="wfm-component-card__stats">
                        {component.variants.length}{" "}
                        {component.variants.length === 1 ? "variant" : "variants"} · {instances}{" "}
                        {instances === 1 ? "instance" : "instances"}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="wfm-component-card__edit"
                    onClick={() => enterComponent(component.id, component.defaultVariantId)}
                    title="Edit main component"
                    aria-label={`Edit ${component.name}`}
                  >
                    Edit
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="wfm-assets__section" aria-label="Colors">
        <div className="wfm-panel-section__header">
          <span>Colors</span>
          <button
            type="button"
            className="wfm-panel-add"
            title="New color style"
            aria-label="New color style"
            onClick={() => {
              setColorError(null);
              createColorStyle();
            }}
          >
            <Icon name="plus" size={12} />
          </button>
        </div>
        {colorStyles.length === 0 ? (
          <button
            type="button"
            className="wfm-assets__empty-add"
            onClick={() => {
              setColorError(null);
              createColorStyle();
            }}
          >
            <Icon name="plus" size={12} />
            New color style
          </button>
        ) : (
          <div className="wfm-assets__colors">
            {colorStyles.map((style) => {
              if (editingColorId === style.id) {
                return (
                  <div key={style.id} className="wfm-color-card is-editing">
                    <input
                      type="color"
                      className="wfm-color-card__swatch-input"
                      value={editingColorValue}
                      aria-label={`${style.name} color`}
                      onChange={(event) => setEditingColorValue(event.target.value)}
                    />
                    <input
                      type="text"
                      className="wfm-field wfm-color-card__name-input"
                      value={editingColorName}
                      aria-label="Color style name"
                      autoFocus
                      onChange={(event) => setEditingColorName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitEditColor();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEditColor();
                        }
                      }}
                    />
                    <input
                      type="number"
                      className="wfm-field wfm-color-card__opacity-input"
                      value={editingColorOpacity}
                      min={0}
                      max={100}
                      step={1}
                      aria-label="Color style opacity"
                      onChange={(event) => setEditingColorOpacity(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitEditColor();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEditColor();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="wfm-color-card__action"
                      onClick={commitEditColor}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="wfm-color-card__action"
                      title="Cancel"
                      aria-label="Cancel color style edit"
                      onClick={cancelEditColor}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                );
              }

              const usages = colorUsageCounts.get(style.id) ?? 0;
              return (
                <div key={style.id} className="wfm-color-card">
                  <button
                    type="button"
                    className="wfm-color-card__main"
                    onClick={() => {
                      if (applyColorStyle(style.id)) {
                        setColorError(null);
                      } else {
                        setColorError(
                          useProjectStore.getState().error ??
                            "Select a layer that can take this color.",
                        );
                      }
                    }}
                    title={`Apply ${style.name}`}
                  >
                    <span
                      className="wfm-color-card__swatch"
                      style={resolveFillStyles({
                        type: "solid",
                        color: style.color,
                        opacity: style.opacity,
                      })}
                    />
                    <span className="wfm-color-card__meta">
                      <span className="wfm-color-card__name">{style.name}</span>
                      <span className="wfm-color-card__stats">
                        {usages} {usages === 1 ? "layer" : "layers"}
                        {style.opacity < 1 ? ` · ${Math.round(style.opacity * 100)}%` : ""}
                      </span>
                    </span>
                  </button>
                  <div className="wfm-color-card__actions">
                    <button
                      type="button"
                      className="wfm-color-card__action"
                      title={`Edit ${style.name}`}
                      aria-label={`Edit ${style.name}`}
                      onClick={() => startEditColor(style)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="wfm-color-card__action wfm-color-card__delete"
                      title={`Delete ${style.name}`}
                      aria-label={`Delete ${style.name}`}
                      onClick={() => {
                        if (editingColorId === style.id) cancelEditColor();
                        removeColorStyle(style.id);
                      }}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {colorError ? (
          <p className="wfm-assets__error" role="alert">
            {colorError}
          </p>
        ) : null}
      </section>

      <section className="wfm-assets__section" aria-label="Text styles">
        <div className="wfm-panel-section__header">
          <span>Text styles</span>
          <button
            type="button"
            className="wfm-panel-add"
            title="New text style"
            aria-label="New text style"
            onClick={() => {
              setTextError(null);
              if (!createTextStyle()) {
                setTextError(
                  useProjectStore.getState().error ?? "Could not create the text style.",
                );
              }
            }}
          >
            <Icon name="plus" size={12} />
          </button>
        </div>
        {textStyles.length === 0 ? (
          <button
            type="button"
            className="wfm-assets__empty-add"
            onClick={() => {
              setTextError(null);
              if (!createTextStyle()) {
                setTextError(
                  useProjectStore.getState().error ?? "Could not create the text style.",
                );
              }
            }}
          >
            <Icon name="plus" size={12} />
            New text style
          </button>
        ) : (
          <div className="wfm-text-cards">
            {textStyles.map((style) => {
              if (editingTextId === style.id) {
                const draft = editingTextDraft ?? draftFromStyle(style);
                return (
                  <div key={style.id} className="wfm-text-card is-editing">
                    <div className="wfm-text-card__editor">
                      <label className="wfm-text-card__field">
                        <span>Name</span>
                        <input
                          type="text"
                          className="wfm-field"
                          value={draft.name}
                          aria-label="Text style name"
                          autoFocus
                          onChange={(event) => updateDraft({ name: event.target.value })}
                          onKeyDown={handleEditorKey}
                        />
                      </label>

                      <label className="wfm-text-card__field">
                        <span>Font</span>
                        <select
                          className="wfm-select"
                          value={draft.fontFamily}
                          aria-label="Text style font family"
                          onChange={(event) => {
                            ensureFontLoaded(event.target.value);
                            updateDraft({ fontFamily: event.target.value });
                          }}
                        >
                          {KNOWN_FONT_FAMILIES.has(draft.fontFamily) ? null : (
                            <option value={draft.fontFamily}>{draft.fontFamily}</option>
                          )}
                          <optgroup label="System">
                            {SYSTEM_FONT_OPTIONS.map((option) => (
                              <option key={option.family} value={option.family}>
                                {option.family}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Google Fonts">
                            {GOOGLE_FONT_OPTIONS.map((option) => (
                              <option key={option.family} value={option.family}>
                                {option.family}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </label>

                      <div className="wfm-text-card__grid">
                        <label className="wfm-text-card__field">
                          <span>Size</span>
                          <input
                            type="number"
                            className="wfm-field"
                            value={draft.fontSize}
                            min={1}
                            max={512}
                            aria-label="Text style font size"
                            onChange={(event) => updateDraft({ fontSize: event.target.value })}
                            onKeyDown={handleEditorKey}
                          />
                        </label>
                        <label className="wfm-text-card__field">
                          <span>Weight</span>
                          <select
                            className="wfm-select"
                            value={draft.fontWeight}
                            aria-label="Text style font weight"
                            onChange={(event) =>
                              updateDraft({ fontWeight: Number(event.target.value) })
                            }
                          >
                            {Array.from(new Set([...FONT_WEIGHTS, draft.fontWeight]))
                              .sort((a, b) => a - b)
                              .map((weight) => (
                                <option key={weight} value={weight}>
                                  {weight}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>

                      <div className="wfm-text-card__grid">
                        <label className="wfm-text-card__field">
                          <span>Line height</span>
                          <span className="wfm-text-card__inline">
                            <select
                              className="wfm-select"
                              value={draft.lineHeightAuto ? "auto" : "px"}
                              aria-label="Text style line height unit"
                              onChange={(event) =>
                                updateDraft({ lineHeightAuto: event.target.value === "auto" })
                              }
                            >
                              <option value="auto">Auto</option>
                              <option value="px">PX</option>
                            </select>
                            {draft.lineHeightAuto ? null : (
                              <input
                                type="number"
                                className="wfm-field"
                                value={draft.lineHeight}
                                min={0}
                                aria-label="Text style line height"
                                onChange={(event) =>
                                  updateDraft({ lineHeight: event.target.value })
                                }
                                onKeyDown={handleEditorKey}
                              />
                            )}
                          </span>
                        </label>
                        <label className="wfm-text-card__field">
                          <span>Letter spacing</span>
                          <input
                            type="number"
                            className="wfm-field"
                            value={draft.letterSpacing}
                            aria-label="Text style letter spacing"
                            onChange={(event) =>
                              updateDraft({ letterSpacing: event.target.value })
                            }
                            onKeyDown={handleEditorKey}
                          />
                        </label>
                      </div>

                      <div className="wfm-text-card__grid">
                        <label className="wfm-text-card__field">
                          <span>Color</span>
                          <input
                            type="color"
                            className="wfm-text-card__color"
                            value={draft.color}
                            aria-label="Text style color"
                            onChange={(event) => updateDraft({ color: event.target.value })}
                          />
                        </label>
                        <label className="wfm-text-card__field">
                          <span>Align</span>
                          <select
                            className="wfm-select"
                            value={draft.align}
                            aria-label="Text style alignment"
                            onChange={(event) =>
                              updateDraft({ align: event.target.value as TextAlign })
                            }
                          >
                            {TEXT_ALIGN_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="wfm-text-card__grid">
                        <label className="wfm-text-card__field">
                          <span>Case</span>
                          <select
                            className="wfm-select"
                            value={draft.textTransform}
                            aria-label="Text style transform"
                            onChange={(event) =>
                              updateDraft({
                                textTransform: event.target.value as TextTransform,
                              })
                            }
                          >
                            {TEXT_TRANSFORM_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="wfm-text-card__field">
                          <span>Decoration</span>
                          <select
                            className="wfm-select"
                            value={draft.textDecoration}
                            aria-label="Text style decoration"
                            onChange={(event) =>
                              updateDraft({
                                textDecoration: event.target.value as TextDecoration,
                              })
                            }
                          >
                            {TEXT_DECORATION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="wfm-text-card__check">
                        <input
                          type="checkbox"
                          checked={draft.italic}
                          aria-label="Text style italic"
                          onChange={(event) => updateDraft({ italic: event.target.checked })}
                        />
                        Italic
                      </label>
                    </div>

                    <div className="wfm-text-card__editor-actions">
                      <button
                        type="button"
                        className="wfm-color-card__action"
                        onClick={commitEditText}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="wfm-color-card__action"
                        title="Cancel"
                        aria-label="Cancel text style edit"
                        onClick={cancelEditText}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  </div>
                );
              }

              const usages = textUsageCounts.get(style.id) ?? 0;
              return (
                <div key={style.id} className="wfm-text-card">
                  <button
                    type="button"
                    className="wfm-text-card__main"
                    onClick={() => {
                      ensureFontLoaded(style.values.fontFamily);
                      if (applyTextStyle(style.id)) {
                        setTextError(null);
                      } else {
                        setTextError(
                          useProjectStore.getState().error ??
                            "Select text layers to apply a text style.",
                        );
                      }
                    }}
                    title={`Apply ${style.name}`}
                  >
                    <span
                      className="wfm-text-card__preview"
                      style={{
                        fontFamily: previewFontFamily(style.values.fontFamily),
                        fontWeight: style.values.fontWeight,
                        fontStyle: style.values.italic ? "italic" : "normal",
                        color: style.values.color,
                      }}
                    >
                      Aa
                    </span>
                    <span className="wfm-text-card__meta">
                      <span className="wfm-text-card__name">{style.name}</span>
                      <span className="wfm-text-card__stats">
                        {usages} {usages === 1 ? "layer" : "layers"} ·{" "}
                        {style.values.fontSize}px
                      </span>
                    </span>
                  </button>
                  <div className="wfm-text-card__actions">
                    <button
                      type="button"
                      className="wfm-color-card__action"
                      title={`Edit ${style.name}`}
                      aria-label={`Edit ${style.name}`}
                      onClick={() => startEditText(style)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="wfm-color-card__action wfm-color-card__delete"
                      title={`Delete ${style.name}`}
                      aria-label={`Delete ${style.name}`}
                      onClick={() => {
                        if (editingTextId === style.id) cancelEditText();
                        removeTextStyle(style.id);
                      }}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {textError ? (
          <p className="wfm-assets__error" role="alert">
            {textError}
          </p>
        ) : null}
      </section>

      {components.length === 0 &&
      assets.length === 0 &&
      colorStyles.length === 0 &&
      textStyles.length === 0 ? (
        <p className="wfm-empty">No assets yet.</p>
      ) : null}

      {assets.length > 0 ? (
        <div className="wfm-assets__grid">
          {assets.map((asset) => {
            const image = isImage(asset);
            const dimensions =
              asset.width !== undefined && asset.height !== undefined
                ? `${asset.width} × ${asset.height}`
                : null;
            return (
              <button
                key={asset.id}
                type="button"
                className={`wfm-asset${image ? "" : " is-static"}`}
                onClick={() => insertAsset(asset)}
                disabled={!image}
                title={image ? `Insert ${asset.name}` : asset.name}
              >
                <span className="wfm-asset__thumb">
                  {image && asset.url ? (
                    <img src={asset.url} alt="" loading="lazy" draggable={false} />
                  ) : (
                    <Icon name="image" size={16} />
                  )}
                </span>
                <span className="wfm-asset__meta">
                  <span className="wfm-asset__name">{asset.name}</span>
                  {dimensions ? <span className="wfm-asset__dims">{dimensions}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
