import { buildPageCss, PageView } from "@webfm/render";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { activePageOf, useProjectStore } from "../../state/project-store";
import { useUIStore } from "../ui-store";
import "./Preview.css";

/**
 * Full-screen published-view overlay. It renders the active page through the
 * shared renderer in publish mode at the selected breakpoint width and never
 * mutates the project.
 */
export function Preview(): ReactElement {
  const setPreviewOpen = useUIStore((state) => state.setPreviewOpen);
  const project = useProjectStore((state) => state.project);
  const activePageId = useProjectStore((state) => state.activePageId);
  const activeBreakpointId = useProjectStore((state) => state.activeBreakpointId);
  const [breakpointId, setBreakpointId] = useState(activeBreakpointId);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Replicates the published scroll runtime inside the preview: the canvas
  // carries `.wfm-js`, and the stage is the scroll root. Reveal state is
  // deliberately not reset when the project identity changes (autosave) or the
  // breakpoint changes; IntersectionObserver recomputes on layout changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-observe only when the page changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = stageRef.current;
    const elements = Array.from(canvas.querySelectorAll<HTMLElement>("[data-wfm-scroll]"));

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("wfm-revealed");
            observer?.unobserve(entry.target);
          }
        },
        { threshold: 0.01, root: stage, rootMargin: "0px" },
      );
      for (const element of elements) observer.observe(element);
    } else {
      for (const element of elements) element.classList.add("wfm-revealed");
    }

    return () => {
      observer?.disconnect();
    };
  }, [activePageId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setPreviewOpen(false);
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [setPreviewOpen]);

  const page = activePageOf(project, activePageId);
  const breakpoint =
    project?.breakpoints.find((entry) => entry.id === breakpointId) ??
    project?.breakpoints[0] ??
    null;
  // Publish CSS uses viewport media queries; preview runs inside a container so
  // the selected breakpoint is judged against the page width, not the window.
  const css =
    project && page && breakpoint
      ? buildPageCss(project, page, {
          breakpointId: breakpoint.id,
          mode: "publish",
        }).replace(/@media \((max|min)-width:/g, "@container ($1-width:")
      : "";

  return (
    <div className="wfm-preview" role="dialog" aria-modal="true" aria-label="Preview">
      <header className="wfm-preview__bar">
        <span className="wfm-preview__name">{project?.name ?? "Preview"}</span>
        <span className="wfm-preview__spacer" />
        {project && project.breakpoints.length > 0 ? (
          <select
            className="wfm-select wfm-preview__breakpoint"
            value={breakpoint?.id ?? ""}
            onChange={(event) => setBreakpointId(event.target.value)}
            aria-label="Preview breakpoint"
          >
            {project.breakpoints.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {`${entry.name} · ${entry.width}`}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="wfm-dialog__button wfm-preview__close"
          onClick={() => setPreviewOpen(false)}
        >
          Close
        </button>
      </header>

      {css ? <style>{css}</style> : null}

      {project && page && breakpoint ? (
        <div className="wfm-preview__stage" ref={stageRef}>
          <div
            className="wfm-preview__canvas wfm-js"
            ref={canvasRef}
            style={{ width: breakpoint.width }}
          >
            <PageView
              project={project}
              page={page}
              options={{ breakpointId: breakpoint.id, mode: "publish" }}
            />
          </div>
        </div>
      ) : (
        <div className="wfm-preview__empty">No page to preview.</div>
      )}
    </div>
  );
}
