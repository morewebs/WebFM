import type { ProjectSummary } from "@webfm/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api/client";
import { installShortcuts } from "./keyboard/registry";
import { useProjectStore } from "./state/project-store";
import { Canvas } from "./ui/canvas/Canvas";
import { PublishDialog } from "./ui/dialogs/PublishDialog";
import { ensureProjectFonts } from "./ui/fonts";
import { ContextMenu } from "./ui/menus/ContextMenu";
import { unwrapSelection, wrapSelection } from "./ui/menus/context-actions";
import { Preview } from "./ui/preview/Preview";
import { BottomBar } from "./ui/shell/BottomBar";
import { LeftSidebar } from "./ui/shell/LeftSidebar";
import { RightSidebar } from "./ui/shell/RightSidebar";
import { TopBar } from "./ui/shell/TopBar";
import { useUIStore } from "./ui/ui-store";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const project = useProjectStore((state) => state.project);
  const loadState = useProjectStore((state) => state.loadState);
  const storeError = useProjectStore((state) => state.error);
  const openProject = useProjectStore((state) => state.openProject);
  const createProject = useProjectStore((state) => state.createProject);
  const saveNow = useProjectStore((state) => state.saveNow);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const deleteSelection = useProjectStore((state) => state.deleteSelection);
  const duplicateSelection = useProjectStore((state) => state.duplicateSelection);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const setZoom = useProjectStore((state) => state.setZoom);

  const publishOpen = useUIStore((state) => state.publishOpen);
  const previewOpen = useUIStore((state) => state.previewOpen);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const refreshProjects = useCallback(async (): Promise<ProjectSummary[]> => {
    const list = await api.listProjects();
    const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setProjects(sorted);
    return sorted;
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void (async () => {
      try {
        const list = await refreshProjects();
        if (list.length === 0) {
          await createProject("Untitled");
          await refreshProjects();
        } else {
          const first = list[0];
          if (first) await openProject(first.id);
        }
      } catch (error) {
        setBootError(messageOf(error));
      } finally {
        setBooting(false);
      }
    })();
  }, [createProject, openProject, refreshProjects]);

  const projectId = project?.id;
  useEffect(() => {
    if (!projectId) return;
    // The picker loads a family the moment it is chosen; a full project walk
    // only needs to run when a different project opens.
    const current = useProjectStore.getState().project;
    if (current) ensureProjectFonts(current);
  }, [projectId]);

  useEffect(
    () =>
      installShortcuts({
        undo,
        redo,
        deleteSelection,
        duplicateSelection,
        clearSelection,
        setZoom,
        toggleInsert: () => useUIStore.getState().setInsertOpen(!useUIStore.getState().insertOpen),
        setTool: (tool) => useUIStore.getState().setTool(tool),
        setLeftTab: (tab) => useUIStore.getState().setLeftTab(tab),
        showStyle: () => useUIStore.getState().setRightTab("style"),
        openPreview: () => useUIStore.getState().setPreviewOpen(true),
        openPublish: () => useUIStore.getState().setPublishOpen(true),
        createComponent: () => useProjectStore.getState().createComponentFromSelection(),
        backToPage: () => {
          const state = useProjectStore.getState();
          if (state.editingComponent) state.exitComponent();
        },
        group: () => wrapSelection("frame"),
        ungroup: () => unwrapSelection(),
        wrapFrame: () => wrapSelection("frame"),
        wrapStack: () => wrapSelection("stack"),
        unwrap: () => unwrapSelection(),
        align: (mode) =>
          window.dispatchEvent(new CustomEvent("wfm:align", { detail: mode })),
      }),
    [undo, redo, deleteSelection, duplicateSelection, clearSelection, setZoom],
  );

  useEffect(() => {
    // Keep the project list fresh after autosaves and publishes.
    const timer = window.setInterval(() => {
      void refreshProjects().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refreshProjects]);

  const handleOpenProject = async (id: string): Promise<void> => {
    if (!id || id === project?.id) return;
    if (project) await saveNow();
    await openProject(id);
    await refreshProjects();
  };

  const handleNewProject = async (): Promise<void> => {
    const name = window.prompt("Project name", "Untitled")?.trim();
    if (!name) return;
    if (project) await saveNow();
    await createProject(name);
    await refreshProjects();
  };

  const showCanvasError = !booting && (bootError !== null || loadState === "error");

  return (
    <div className="wfm-app">
      <TopBar
        projects={projects}
        onOpenProject={(id) => void handleOpenProject(id)}
        onNewProject={() => void handleNewProject()}
      />

      <div className="wfm-body">
        <LeftSidebar />

        <main className="wfm-canvas-area">
          {booting ? <div className="wfm-canvas-message">Loading projects…</div> : null}
          {showCanvasError ? (
            <div className="wfm-canvas-message is-error">
              <strong>Could not open the editor.</strong>
              <span>{bootError ?? storeError}</span>
            </div>
          ) : null}
          {!booting && !showCanvasError && project ? <Canvas /> : null}
          {!booting && !showCanvasError && !project ? (
            <div className="wfm-canvas-message">No project is open.</div>
          ) : null}
        </main>

        <RightSidebar />
      </div>

      <BottomBar />

      <ContextMenu />
      {publishOpen ? <PublishDialog /> : null}
      {previewOpen ? <Preview /> : null}
    </div>
  );
}
