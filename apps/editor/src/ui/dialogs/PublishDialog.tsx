import { type ReactElement, useEffect, useState } from "react";
import type { PublishResponse } from "../../api/client";
import { useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import { useUIStore } from "../ui-store";
import "./PublishDialog.css";

/**
 * Publish modal. It never publishes on mount: the user picks the adapter and
 * presses Publish. The store flushes pending edits before requesting the
 * artifact, so the published output matches what the editor shows.
 */
export function PublishDialog(): ReactElement {
  const setPublishOpen = useUIStore((state) => state.setPublishOpen);
  const project = useProjectStore((state) => state.project);
  const publish = useProjectStore((state) => state.publish);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<PublishResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = (): void => setPublishOpen(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setPublishOpen(false);
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [setPublishOpen]);

  const handlePublish = async (): Promise<void> => {
    if (publishing) return;
    setPublishing(true);
    setResult(null);
    setError(null);
    try {
      const response = await publish("static", {});
      if (response) {
        setResult(response);
      } else {
        setError(useProjectStore.getState().error ?? "Publishing failed.");
      }
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : String(publishError));
    } finally {
      setPublishing(false);
    }
  };

  const zipUrl = result && typeof result.zipUrl === "string" ? result.zipUrl : null;
  const artifactId = result && typeof result.artifactId === "string" ? result.artifactId : null;
  const fileCount = result && Array.isArray(result.files) ? result.files.length : 0;

  return (
    <div
      className="wfm-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="wfm-dialog" role="dialog" aria-modal="true" aria-label="Publish">
        <div className="wfm-dialog__header">
          <span>Publish</span>
          <button type="button" className="wfm-dialog__close" onClick={close} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="wfm-dialog__body">
          <p className="wfm-publish__summary">
            Exports every page and referenced asset as a static site.
          </p>

          <label className="wfm-publish__row">
            <span className="wfm-publish__label">Adapter</span>
            <select
              className="wfm-select wfm-publish__select"
              defaultValue="static"
              disabled={publishing}
              aria-label="Publish adapter"
            >
              <option value="static">Static site</option>
            </select>
          </label>

          <div className="wfm-publish__row">
            <span className="wfm-publish__label">Project</span>
            <span className="wfm-publish__value">{project?.name ?? "No project"}</span>
          </div>

          {error ? (
            <div className="wfm-publish__error" role="alert">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="wfm-publish__result">
              <div className="wfm-publish__result-title">
                {result.summary ?? "Published successfully."}
              </div>
              {fileCount > 0 ? (
                <div className="wfm-publish__meta">{fileCount} files written.</div>
              ) : null}
              {artifactId ? (
                <div className="wfm-publish__artifact">Artifact {artifactId}</div>
              ) : null}
              {zipUrl ? (
                <a
                  className="wfm-dialog__button is-primary wfm-publish__download"
                  href={zipUrl}
                  download
                >
                  Download zip
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="wfm-dialog__footer">
          <button type="button" className="wfm-dialog__button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="wfm-dialog__button is-primary"
            onClick={() => void handlePublish()}
            disabled={publishing || !project}
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
