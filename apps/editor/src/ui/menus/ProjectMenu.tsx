import type { ProjectSummary } from "@webfm/model";
import { type CSSProperties, type ReactElement, useEffect, useRef } from "react";
import { useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import "./ProjectMenu.css";

interface ProjectMenuProps {
  style?: CSSProperties;
  projects: ProjectSummary[];
  onOpenProject(id: string): void;
  onNewProject(): void;
  onClose(): void;
}

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return TIME_FORMAT.format(date);
}

/**
 * Project switcher opened from the project name in the top bar. The list is
 * supplied by App; save status and the server version come from the project
 * store.
 */
export function ProjectMenu({
  style,
  projects,
  onOpenProject,
  onNewProject,
  onClose,
}: ProjectMenuProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((state) => state.project);
  const saving = useProjectStore((state) => state.saving);
  const dirty = useProjectStore((state) => state.dirty);
  const conflict = useProjectStore((state) => state.conflict);

  useEffect(() => {
    const handlePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      // The project title toggles this menu; let its click handler close it.
      if (target.closest(".wfm-project-title")) return;
      onClose();
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", handlePointer, true);
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [onClose]);

  const saveState = conflict
    ? { label: "Save conflict", className: "is-danger" }
    : saving
      ? { label: "Saving…", className: "is-busy" }
      : dirty
        ? { label: "Unsaved changes", className: "is-warn" }
        : project
          ? { label: "Saved", className: "is-ok" }
          : { label: "No project open", className: "" };

  return (
    <div
      ref={rootRef}
      className="wfm-menu wfm-project-menu"
      style={style}
      role="menu"
      aria-label="Projects"
    >
      <div className="wfm-project-menu__header">Projects</div>

      <div className="wfm-project-menu__list">
        {projects.length === 0 ? (
          <div className="wfm-project-menu__empty">No projects yet.</div>
        ) : (
          projects.map((entry) => {
            const active = entry.id === project?.id;
            return (
              <button
                key={entry.id}
                type="button"
                className={`wfm-menu__item wfm-project-menu__item${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  onClose();
                  onOpenProject(entry.id);
                }}
              >
                <span className="wfm-project-menu__check">
                  {active ? <Icon name="check" size={12} /> : null}
                </span>
                <span className="wfm-project-menu__name">{entry.name}</span>
                <span className="wfm-project-menu__time">{formatUpdated(entry.updatedAt)}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="wfm-menu__sep" />

      <button
        type="button"
        className="wfm-menu__item wfm-project-menu__item"
        onClick={() => {
          onClose();
          onNewProject();
        }}
      >
        <span className="wfm-project-menu__check">
          <Icon name="plus" size={12} />
        </span>
        <span className="wfm-project-menu__name">New project</span>
      </button>

      <div className="wfm-project-menu__footer">
        <span className={`wfm-save-state ${saveState.className}`.trim()}>{saveState.label}</span>
        <span className="wfm-project-menu__version">
          {project ? `Version ${project.version}` : "Version —"}
        </span>
      </div>
    </div>
  );
}
