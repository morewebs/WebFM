import type { NodeId } from "@webfm/model";
import { create } from "zustand";

export type EditorTool =
  | "select"
  | "hand"
  | "frame"
  | "stack"
  | "text"
  | "image"
  | "oval"
  | "rectangle"
  | "rounded";
export type LeftTab = "pages" | "layers" | "assets";
export type RightTab = "agent" | "style";

/** An open context menu, anchored at viewport coordinates. */
export interface ContextMenuState {
  x: number;
  y: number;
  /** The node the menu was opened on; absent for the empty-canvas menu. */
  nodeId?: NodeId;
}

interface UIState {
  tool: EditorTool;
  leftTab: LeftTab;
  rightTab: RightTab;
  insertOpen: boolean;
  mainMenuOpen: boolean;
  layoutMenuOpen: boolean;
  projectMenuOpen: boolean;
  publishOpen: boolean;
  previewOpen: boolean;
  zoomMenuOpen: boolean;
  contextMenu: ContextMenuState | null;
  setTool(tool: EditorTool): void;
  setLeftTab(tab: LeftTab): void;
  setRightTab(tab: RightTab): void;
  setInsertOpen(open: boolean): void;
  setMainMenuOpen(open: boolean): void;
  setLayoutMenuOpen(open: boolean): void;
  setProjectMenuOpen(open: boolean): void;
  setPublishOpen(open: boolean): void;
  setPreviewOpen(open: boolean): void;
  setZoomMenuOpen(open: boolean): void;
  openContextMenu(menu: ContextMenuState): void;
  closeContextMenu(): void;
  closeMenus(): void;
}

export const useUIStore = create<UIState>()((set) => ({
  tool: "select",
  leftTab: "layers",
  rightTab: "style",
  insertOpen: false,
  mainMenuOpen: false,
  layoutMenuOpen: false,
  projectMenuOpen: false,
  publishOpen: false,
  previewOpen: false,
  zoomMenuOpen: false,
  contextMenu: null,
  setTool: (tool) => set({ tool }),
  setLeftTab: (leftTab) => set({ leftTab, insertOpen: false }),
  setRightTab: (rightTab) => set({ rightTab }),
  setInsertOpen: (insertOpen) => set({ insertOpen }),
  setMainMenuOpen: (mainMenuOpen) => set({ mainMenuOpen }),
  setLayoutMenuOpen: (layoutMenuOpen) => set({ layoutMenuOpen }),
  setProjectMenuOpen: (projectMenuOpen) => set({ projectMenuOpen }),
  setPublishOpen: (publishOpen) => set({ publishOpen }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setZoomMenuOpen: (zoomMenuOpen) => set({ zoomMenuOpen }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  closeMenus: () =>
    set({
      mainMenuOpen: false,
      layoutMenuOpen: false,
      projectMenuOpen: false,
      zoomMenuOpen: false,
      insertOpen: false,
    }),
}));
