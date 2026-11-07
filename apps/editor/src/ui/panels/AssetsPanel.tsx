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
  createImage,
  findComponentInstances,
} from "@webfm/model";
import { resolveFillStyles } from "@webfm/render";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "../../state/project-store";
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

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorError, setColorError] = useState<string | null>(null);
  const [editingColorId, setEditingColorId] = useState<string | null>(null);
  const [editingColorName, setEditingColorName] = useState("");
  const [editingColorValue, setEditingColorValue] = useState("#000000");
  const [editingColorOpacity, setEditingColorOpacity] = useState("100");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const assets = project?.assets ?? [];
  const components = project?.components ?? [];
  const colorStyles = project?.colorStyles ?? [];
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

      {components.length === 0 && assets.length === 0 && colorStyles.length === 0 ? (
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
