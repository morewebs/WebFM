/**
 * Assets tab.
 *
 * Lists the project's assets as image cards. Upload uses the project store's
 * asset endpoint (which persists the file and adopts the server revision) and
 * accepts images only; clicking a card inserts an image layer wired to that
 * asset with `createImage`, so undo and autosave cover it like any other edit.
 */

import { type Asset, createImage } from "@webfm/model";
import { type ChangeEvent, useRef, useState } from "react";
import { useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import "./AssetsPanel.css";

function isImage(asset: Asset): boolean {
  return asset.mimeType.startsWith("image/");
}

export function AssetsPanel() {
  const project = useProjectStore((state) => state.project);
  const uploadAsset = useProjectStore((state) => state.uploadAsset);
  const insertNode = useProjectStore((state) => state.insertNode);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const assets = project?.assets ?? [];

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

      {assets.length === 0 ? (
        <p className="wfm-empty">No assets yet.</p>
      ) : (
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
      )}
    </div>
  );
}
