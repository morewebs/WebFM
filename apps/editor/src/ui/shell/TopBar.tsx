import type { ProjectSummary } from "@webfm/model";
import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import { LayoutToolsMenu } from "../menus/LayoutToolsMenu";
import { MainMenu } from "../menus/MainMenu";
import { ProjectMenu } from "../menus/ProjectMenu";
import { type EditorTool, useUIStore } from "../ui-store";

interface TopBarProps {
  projects: ProjectSummary[];
  onOpenProject(id: string): void;
  onNewProject(): void;
}

const SHAPE_TOOLS = [
  { tool: "rectangle", label: "Rectangle", shortcut: "R", icon: "frame" },
  { tool: "rounded", label: "Rounded", shortcut: "U", icon: "frame" },
  { tool: "oval", label: "Oval", shortcut: "O", icon: "oval" },
] as const;

function isShapeTool(tool: EditorTool): boolean {
  return tool === "rectangle" || tool === "rounded" || tool === "oval";
}

interface ShapeToolsMenuProps {
  onClose(): void;
}

/** Shape picker flyout, rendered inside the tool button's wrapper. */
function ShapeToolsMenu({ onClose }: ShapeToolsMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tool = useUIStore((state) => state.tool);
  const setTool = useUIStore((state) => state.setTool);

  useEffect(() => {
    const handlePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const node = rootRef.current;
      if (!node) return;
      if (node.contains(target)) return;
      // The trigger button lives in the menu's wrapper; let it toggle the menu.
      if (node.parentElement?.contains(target)) return;
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

  return (
    <div
      ref={rootRef}
      className="wfm-menu"
      style={{ top: 34, left: -8, width: 176, minWidth: 176 }}
      role="menu"
      aria-label="Shapes"
    >
      {SHAPE_TOOLS.map((item) => (
        <button
          key={item.tool}
          type="button"
          className={`wfm-menu__item ${tool === item.tool ? "is-active" : ""}`}
          role="menuitem"
          onClick={() => {
            setTool(item.tool);
            onClose();
          }}
        >
          <Icon name={item.icon} size={14} />
          <span>{item.label}</span>
          <span className="wfm-menu__shortcut">{item.shortcut}</span>
        </button>
      ))}
    </div>
  );
}

export function TopBar({ projects, onOpenProject, onNewProject }: TopBarProps) {
  const project = useProjectStore((state) => state.project);
  const setTool = useUIStore((state) => state.setTool);
  const tool = useUIStore((state) => state.tool);
  const insertOpen = useUIStore((state) => state.insertOpen);
  const setInsertOpen = useUIStore((state) => state.setInsertOpen);
  const mainMenuOpen = useUIStore((state) => state.mainMenuOpen);
  const setMainMenuOpen = useUIStore((state) => state.setMainMenuOpen);
  const layoutMenuOpen = useUIStore((state) => state.layoutMenuOpen);
  const setLayoutMenuOpen = useUIStore((state) => state.setLayoutMenuOpen);
  const projectMenuOpen = useUIStore((state) => state.projectMenuOpen);
  const setProjectMenuOpen = useUIStore((state) => state.setProjectMenuOpen);
  const setPublishOpen = useUIStore((state) => state.setPublishOpen);
  const setPreviewOpen = useUIStore((state) => state.setPreviewOpen);

  const [layoutAnchor, setLayoutAnchor] = useState<"frame">("frame");
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);

  return (
    <header className="wfm-topbar">
      <div className="wfm-topbar__left">
        <button
          type="button"
          className="wfm-view-switch"
          title="Menu"
          onClick={() => {
            setMainMenuOpen(!mainMenuOpen);
            setProjectMenuOpen(false);
          }}
        >
          <Icon name="framer" size={15} />
          Canvas
          <Icon name="chevron-down" size={8} />
        </button>

        <div className="wfm-tools">
          <button
            type="button"
            className={`wfm-tool ${insertOpen ? "is-active" : ""}`}
            title="Insert (I)"
            onClick={() => setInsertOpen(!insertOpen)}
          >
            <Icon name="plus" size={14} />
          </button>

          <div className="wfm-tool-wrap">
            <button
              type="button"
              className={`wfm-tool ${layoutMenuOpen ? "is-active" : ""}`}
              title="Frame (F)"
              onClick={() => {
                setLayoutAnchor("frame");
                setLayoutMenuOpen(!layoutMenuOpen);
              }}
            >
              <Icon name="layout" size={14} />
            </button>
            {layoutMenuOpen ? (
              <LayoutToolsMenu
                anchor={layoutAnchor}
                onClose={() => setLayoutMenuOpen(false)}
              />
            ) : null}
          </div>

          <div className="wfm-tool-wrap">
            <button
              type="button"
              className={`wfm-tool ${isShapeTool(tool) ? "is-active" : ""}`}
              title="Shape (R)"
              onClick={() => setShapeMenuOpen(!shapeMenuOpen)}
            >
              <Icon name="oval" size={14} />
            </button>
            {shapeMenuOpen ? <ShapeToolsMenu onClose={() => setShapeMenuOpen(false)} /> : null}
          </div>

          <button
            type="button"
            className={`wfm-tool ${tool === "text" ? "is-active" : ""}`}
            title="Text (T)"
            onClick={() => setTool(tool === "text" ? "select" : "text")}
          >
            <Icon name="text" size={14} />
          </button>

          <button
            type="button"
            className="wfm-tool"
            title="Vector (not in this build)"
            onClick={() => setTool("select")}
          >
            <Icon name="vector" size={14} />
          </button>
        </div>
      </div>

      <div className="wfm-topbar__center">
        <button
          type="button"
          className="wfm-project-title"
          onClick={() => setProjectMenuOpen(!projectMenuOpen)}
          title={project?.name ?? "No project"}
        >
          {project?.name ?? "No project"}
        </button>
        <span className="wfm-branch-pill" title="Branching is not part of this build">
          <Icon name="branch" size={12} />
          main
        </span>
      </div>

      <div className="wfm-topbar__right">
        <span className="wfm-avatar" title="Single-user build">
          WF
        </span>
        <button
          type="button"
          className="wfm-icon-btn"
          title="Preview (Mod+P)"
          onClick={() => setPreviewOpen(true)}
        >
          <Icon name="play" size={14} />
        </button>
        <button
          type="button"
          className="wfm-topbar-button"
          title="Invite — single-user build"
          disabled
          style={{ opacity: 0.45 }}
        >
          Invite
        </button>
        <button
          type="button"
          className="wfm-topbar-button is-primary"
          onClick={() => setPublishOpen(true)}
        >
          Publish
        </button>
      </div>

      {mainMenuOpen ? (
        <MainMenu style={{ top: 44, left: 10 }} onClose={() => setMainMenuOpen(false)} />
      ) : null}

      {projectMenuOpen ? (
        <ProjectMenu
          style={{ top: 44, left: "50%", transform: "translateX(-50%)" }}
          projects={projects}
          onOpenProject={onOpenProject}
          onNewProject={onNewProject}
          onClose={() => setProjectMenuOpen(false)}
        />
      ) : null}
    </header>
  );
}
