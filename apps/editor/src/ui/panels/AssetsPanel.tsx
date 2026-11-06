/**
 * Assets tab.
 *
 * Lists the project's components above its image assets. Component cards insert
 * an instance (page mode only; the model is page-only for now) and offer an
 * Edit action that enters the main component. Image cards keep the upload
 * endpoint and `createImage` insertion, so undo and autosave cover both paths
 * like any other edit.
 */

import { type Asset, createImage, findComponentInstances } from "@webfm/model";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import "./AssetsPanel.css";

function isImage(asset: Asset): boolean {
  return asset.mimeType.startsWith("image/");
}

export function AssetsPanel() {
  const project = useProjectStore((state) => state.project);
  const editingComponent = useProjectStore((state) => state.editingComponent);
  const uploadAsset = useProjectStore((state) => state.uploadAsset);
  const insertNode = useProjectStore((state) => state.insertNode);
  const insertComponentInstance = useProjectStore((state) => state.insertComponentInstance);
  const enterComponent = useProjectStore((state) => state.enterComponent);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const assets = project?.assets ?? [];
  const components = project?.components ?? [];
  const componentMode = editingComponent !== null;

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

      {components.length === 0 && assets.length === 0 ? (
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
