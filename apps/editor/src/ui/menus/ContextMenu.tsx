/**
 * Framer's editor context menus.
 *
 * One panel serves both the node menu (right-clicking a layer row or a canvas
 * node) and the empty-canvas menu. The node menu mirrors the live Framer
 * structure: a search field, grouped sections and the Select/Align/Copy/Paste/
 * Move/Add breakpoint/Overflow submenus. Actions run through `context-actions`,
 * which mutates the document through the project store.
 */

import {
  findNode,
  type Overflow,
  type Project,
  resolveNodeProps,
  type SceneNode,
} from "@webfm/model";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type ActiveScene, activeSceneOf, useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import { useUIStore } from "../ui-store";
import {
  addBreakpointPreset,
  alignSelection,
  autoRenameNode,
  clipboardHasFill,
  clipboardHasNodes,
  clipboardHasStyle,
  copyFill,
  copyNodeId,
  copySelection,
  copyStyle,
  copyText,
  createComponentAt,
  editMainComponent,
  filterMenuEntries,
  type MenuEntry,
  type MenuEntryItem,
  menuItem,
  menuSeparator,
  moveSelectedNode,
  pasteFill,
  pasteInPlace,
  pasteSelection,
  pasteStyle,
  requestCustomBreakpoint,
  requestRename,
  selectAvailability,
  selectRelated,
  setNodeOverflow,
  sortLayersAlphabetically,
  toggleNodeLock,
  toggleNodeVisibility,
  zoomTo100,
  zoomToFit,
} from "./context-actions";
import "./ContextMenu.css";

const MENU_MARGIN = 8;
const SUBMENU_GAP = 2;
const SUBMENU_ESTIMATED_WIDTH = 220;

interface SubmenuState {
  label: string;
  anchor: DOMRect;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function submenuPosition(anchor: DOMRect): { left: number; top: number } {
  let left = anchor.right + SUBMENU_GAP;
  if (left + SUBMENU_ESTIMATED_WIDTH > window.innerWidth - MENU_MARGIN) {
    left = anchor.left - SUBMENU_ESTIMATED_WIDTH - SUBMENU_GAP;
  }
  return {
    left: Math.max(MENU_MARGIN, left),
    top: Math.max(MENU_MARGIN, anchor.top - 6),
  };
}

/** A submenu in a portal so the scrollable root panel cannot clip it. */
function SubmenuPanel({ anchor, children }: { anchor: DOMRect; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => submenuPosition(anchor));

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const left = Math.max(
      MENU_MARGIN,
      Math.min(position.left, window.innerWidth - rect.width - MENU_MARGIN),
    );
    const top = Math.max(
      MENU_MARGIN,
      Math.min(position.top, window.innerHeight - rect.height - MENU_MARGIN),
    );
    if (Math.abs(left - position.left) > 0.5 || Math.abs(top - position.top) > 0.5) {
      setPosition({ left, top });
    }
  });

  return createPortal(
    <div
      ref={ref}
      className="wfm-ctx wfm-ctx-panel wfm-ctx__submenu"
      style={{ left: position.left, top: position.top }}
      role="menu"
    >
      <div className="wfm-ctx__list">{children}</div>
    </div>,
    document.body,
  );
}

export function ContextMenu() {
  const menu = useUIStore((state) => state.contextMenu);
  const closeContextMenu = useUIStore((state) => state.closeContextMenu);

  const project = useProjectStore((state) => state.project);
  const activePageId = useProjectStore((state) => state.activePageId);
  const activeBreakpointId = useProjectStore((state) => state.activeBreakpointId);
  const editingComponent = useProjectStore((state) => state.editingComponent);

  const scene = activeSceneOf(project, activePageId, editingComponent);
  const node = menu?.nodeId && scene ? findNode(scene.root, menu.nodeId) : null;

  const [query, setQuery] = useState("");
  const [submenu, setSubmenu] = useState<SubmenuState | null>(null);
  const [panelPosition, setPanelPosition] = useState({ x: menu?.x ?? 0, y: menu?.y ?? 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // A new menu starts with an empty search and no open submenu. `menu` is the
  // trigger; the setters are stable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when a menu opens
  useEffect(() => {
    setQuery("");
    setSubmenu(null);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    searchRef.current?.focus();
  }, [menu]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new search closes the submenu
  useEffect(() => {
    setSubmenu(null);
  }, [query]);

  // Outside presses and Escape dismiss the menu. The capture phase closes it
  // before the canvas handles the same press.
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest(".wfm-ctx")) return;
      closeContextMenu();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      // Capture phase, so the editor's global Escape shortcut (clear selection)
      // does not also fire while the menu is open.
      event.preventDefault();
      event.stopPropagation();
      closeContextMenu();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menu, closeContextMenu]);

  useLayoutEffect(() => {
    if (!menu) return;
    const element = panelRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    // Anchor the clamp to the original click so filtering (which re-renders the
    // panel) never drifts the menu away from the pointer.
    const x = clamp(menu.x, MENU_MARGIN, window.innerWidth - rect.width - MENU_MARGIN);
    const y = clamp(menu.y, MENU_MARGIN, window.innerHeight - rect.height - MENU_MARGIN);
    if (Math.abs(x - panelPosition.x) > 0.5 || Math.abs(y - panelPosition.y) > 0.5) {
      setPanelPosition({ x, y });
    }
  });

  if (!menu) return null;
  // The scene can change while the menu is open (page switch, undo); a node
  // menu whose node disappeared is stale rather than the canvas menu.
  if (menu.nodeId && !node) return null;

  const run = (action: () => void) => (): void => {
    try {
      action();
    } finally {
      closeContextMenu();
    }
  };

  const buildOverflowChildren = (current: Overflow, targetId: string): MenuEntry[] => [
    menuItem("Clip", {
      checked: current === "clip",
      run: run(() => setNodeOverflow(targetId, "clip")),
    }),
    menuItem("Visible", {
      checked: current === "visible",
      run: run(() => setNodeOverflow(targetId, "visible")),
    }),
    menuItem("Hidden", {
      checked: current === "hidden",
      run: run(() => setNodeOverflow(targetId, "hidden")),
    }),
    menuItem("Scroll", {
      disabled: true,
      note: "Scroll overflow is not in this build",
    }),
  ];

  const buildCopyChildren = (target: SceneNode): MenuEntry[] => [
    menuItem("Copy", { shortcut: "Ctrl+C", run: run(copySelection) }),
    menuItem("Copy style", { shortcut: "Ctrl+Alt+C", run: run(() => copyStyle(target.id)) }),
    menuItem("Copy fill", { shortcut: "Ctrl+Shift+C", run: run(() => copyFill(target.id)) }),
    menuItem("Copy link", { disabled: true, note: "Links are not in this build" }),
    menuItem("Copy CSS", { disabled: true, note: "CSS export is not in this build" }),
    menuItem("Copy SVG", { disabled: true, note: "SVG export is not in this build" }),
    menuItem("Copy text", {
      disabled: target.type !== "text",
      run: run(() => copyText(target.id)),
    }),
    menuItem("Copy guides", { disabled: true, note: "Guides are not in this build" }),
    menuItem("Copy effects", {
      disabled: true,
      note: "The effects clipboard is not in this build",
    }),
    menuItem("Copy cursor", { disabled: true, note: "Cursors are not in this build" }),
    menuItem("Copy node ID", { run: run(() => copyNodeId(target.id)) }),
  ];

  const buildPasteChildren = (target: SceneNode): MenuEntry[] => {
    const instance = target.type === "componentInstance";
    return [
      menuItem("Paste", {
        shortcut: "Ctrl+V",
        disabled: !clipboardHasNodes(),
        run: run(pasteSelection),
      }),
      menuItem("Paste style", {
        shortcut: "Ctrl+Alt+V",
        disabled: instance || !clipboardHasStyle(),
        note: instance ? "Instance style overrides are next" : undefined,
        run: run(pasteStyle),
      }),
      menuItem("Paste fill", {
        disabled: instance || !clipboardHasFill(),
        note: instance ? "Instance style overrides are next" : undefined,
        run: run(pasteFill),
      }),
      menuItem("Paste in place", {
        shortcut: "Ctrl+Shift+V",
        disabled: !clipboardHasNodes(),
        run: run(pasteInPlace),
      }),
    menuItem("Paste effects", {
      disabled: true,
      note: "The effects clipboard is not in this build",
    }),
    menuItem("Paste cursor", { disabled: true, note: "Cursors are not in this build" }),
    menuItem("Paste guides", { disabled: true, note: "Guides are not in this build" }),
    ];
  };

  const buildSelectChildren = (target: SceneNode, root: SceneNode): MenuEntry[] => {
    const availability = selectAvailability(target, root);
    return [
      menuItem("Top parent", { run: run(() => selectRelated(target.id, "top-parent")) }),
      menuItem("Parent", {
        shortcut: "ESC",
        disabled: !availability.parent,
        run: run(() => selectRelated(target.id, "parent")),
      }),
      menuItem("All", { shortcut: "Ctrl+A", run: run(() => selectRelated(target.id, "all")) }),
      menuItem("Siblings", {
        shortcut: "Ctrl+Shift+A",
        disabled: !availability.siblings,
        run: run(() => selectRelated(target.id, "siblings")),
      }),
      menuItem("Children", {
        disabled: !availability.children,
        run: run(() => selectRelated(target.id, "children")),
      }),
      menuItem("Text layers", {
        disabled: !availability.textLayers,
        run: run(() => selectRelated(target.id, "text-layers")),
      }),
      menuItem("Layers using this background", {
        disabled: true,
        note: "Layer background queries are next",
      }),
    ];
  };

  const buildAlignChildren = (disabled: boolean): MenuEntry[] => {
    const modes: ReadonlyArray<[string, string, string]> = [
      ["Align left", "Alt+A", "left"],
      ["Align horizontally", "Alt+H", "center-h"],
      ["Align right", "Alt+D", "right"],
      ["Align top", "Alt+W", "top"],
      ["Align vertically", "Alt+V", "center-v"],
      ["Align bottom", "Alt+S", "bottom"],
      ["Distribute horizontally", "Alt+Shift+H", "distribute-h"],
      ["Distribute vertically", "Alt+Shift+V", "distribute-v"],
    ];
    return [
      ...modes.map(([label, shortcut, mode]) =>
        menuItem(label, {
          shortcut,
          disabled,
          run: run(() => alignSelection(mode)),
        }),
      ),
      menuSeparator,
      menuItem("Align to selection", {
        disabled: true,
        note: "Alignment target options are next",
      }),
      menuItem("Align to parent", {
        disabled: true,
        note: "Alignment target options are next",
      }),
    ];
  };

  const buildMoveChildren = (target: SceneNode): MenuEntry[] => {
    const disabled = target.id === scene?.root.id;
    return [
      menuItem("Bring to front", {
        shortcut: "]",
        disabled,
        run: run(() => moveSelectedNode(target.id, "front")),
      }),
      menuItem("Bring forward", {
        shortcut: "Ctrl+Alt+↑",
        disabled,
        run: run(() => moveSelectedNode(target.id, "forward")),
      }),
      menuItem("Send backward", {
        shortcut: "Ctrl+Alt+↓",
        disabled,
        run: run(() => moveSelectedNode(target.id, "backward")),
      }),
      menuItem("Send to back", {
        shortcut: "[",
        disabled,
        run: run(() => moveSelectedNode(target.id, "back")),
      }),
    ];
  };

  const buildNodeEntries = (
    target: SceneNode,
    activeScene: ActiveScene,
    currentProject: Project,
  ): MenuEntry[] => {
    const isRoot = target.id === activeScene.root.id;
    const isInstance = target.type === "componentInstance";
    const props = resolveNodeProps(target, activeBreakpointId, currentProject.breakpoints);
    const entries: MenuEntry[] = [
      menuItem("Add to agent", { disabled: true, note: "Agent is not in this build" }),
      menuItem("Edit breakpoint…", {
        disabled: true,
        note: "Editing a breakpoint is not in this build",
      }),
      menuItem("Add breakpoint", {
        children: [
          menuItem("Tablet", {
            shortcut: "810",
            run: run(() => addBreakpointPreset("Tablet", 810)),
          }),
          menuItem("Phone", {
            shortcut: "390",
            run: run(() => addBreakpointPreset("Phone", 390)),
          }),
          menuItem("Custom…", { run: run(requestCustomBreakpoint) }),
        ],
      }),
      menuSeparator,
      menuItem("Select", { children: buildSelectChildren(target, activeScene.root) }),
      menuItem("Align", { children: buildAlignChildren(isRoot) }),
      menuSeparator,
      menuItem("Copy", { children: buildCopyChildren(target) }),
      menuItem("Paste", { children: buildPasteChildren(target) }),
      menuSeparator,
      menuItem("Move", { children: buildMoveChildren(target) }),
      menuItem("Duplicate", {
        shortcut: "Ctrl+D",
        disabled: isRoot,
        run: run(() => useProjectStore.getState().duplicateSelection()),
      }),
      menuItem("Delete", {
        shortcut: "Del",
        disabled: isRoot,
        run: run(() => useProjectStore.getState().deleteSelection()),
      }),
      menuSeparator,
      menuItem("Rename", { shortcut: "Ctrl+R", run: run(() => requestRename(target.id)) }),
      menuItem("Auto rename", {
        shortcut: "Alt+R",
        disabled: isRoot,
        run: run(() => autoRenameNode(target.id)),
      }),
      menuItem(target.locked ? "Unlock" : "Lock", {
        shortcut: "Ctrl+L",
        run: run(() => toggleNodeLock(target.id)),
      }),
      menuItem(target.visible ? "Hide" : "Show", {
        shortcut: "Ctrl+;",
        run: run(() => toggleNodeVisibility(target.id)),
      }),
      menuSeparator,
      menuItem("Overflow", {
        children: buildOverflowChildren(props.style.overflow, target.id),
        disabled: isInstance,
        note: isInstance ? "Instance style overrides are next" : undefined,
      }),
    ];

    // The Add frame section: the component action, when available, sits above
    // the wrapping/unwrapping entries exactly as Framer groups them.
    entries.push(menuSeparator);
    if (isInstance) {
      entries.push(
        menuItem("Edit Main Component", { run: run(() => editMainComponent(target.id)) }),
      );
    } else if (activeScene.kind === "page" && !isRoot) {
      entries.push(
        menuItem("Create Component", {
          shortcut: "Ctrl+Alt+K",
          run: run(() => createComponentAt(target.id)),
        }),
      );
    }

    entries.push(
      menuItem("Add frame", {
        shortcut: "Shift+F",
        disabled: true,
        note: "Wrapping in a frame is next",
      }),
      menuItem("Add stack", {
        shortcut: "Shift+A",
        disabled: true,
        note: "Wrapping in a stack is next",
      }),
      menuItem("Remove frame", {
        shortcut: "Ctrl+Del",
        disabled: true,
        note: "Unwrapping is next",
      }),
      menuItem("Set as default fill", {
        disabled: true,
        note: "Default fills are next",
      }),
    );

    return entries;
  };

  const buildCanvasEntries = (): MenuEntry[] => [
    menuItem("Paste", {
      shortcut: "Ctrl+V",
      disabled: !clipboardHasNodes(),
      run: run(pasteSelection),
    }),
    menuItem("Cursor chat", {
      shortcut: "/",
      disabled: true,
      note: "Comments are not in this build",
    }),
    menuItem("Quick actions…", {
      shortcut: "Ctrl+K",
      disabled: true,
      note: "Quick actions are not in this build",
    }),
    menuSeparator,
    menuItem("Zoom to 100%", { run: run(zoomTo100) }),
    menuItem("Zoom to fit", { run: run(zoomToFit) }),
    menuSeparator,
    menuItem("Sort layers alphabetically", { run: run(sortLayersAlphabetically) }),
  ];

  const entries: MenuEntry[] =
    !scene || !project ? [] : node ? buildNodeEntries(node, scene, project) : buildCanvasEntries();

  const filtered = filterMenuEntries(entries, query);
  const activeSubmenu =
    submenu && filtered.some((entry) => entry.kind === "item" && entry.label === submenu.label)
      ? (filtered.find(
          (entry): entry is MenuEntryItem => entry.kind === "item" && entry.label === submenu.label,
        ) ?? null)
      : null;

  const renderRow = (entry: MenuEntryItem, depth: "root" | "sub", key: string): ReactNode => {
    const hasChildren = (entry.children?.length ?? 0) > 0;
    const isOpen = submenu?.label === entry.label;
    const classes = ["wfm-ctx__item"];
    if (entry.disabled) classes.push("is-disabled");
    if (isOpen) classes.push("is-open");

    const activate = (element: HTMLElement): void => {
      if (entry.disabled) return;
      if (hasChildren) {
        if (isOpen) {
          setSubmenu(null);
        } else {
          setSubmenu({
            label: entry.label,
            anchor: element.getBoundingClientRect(),
          });
        }
        return;
      }
      entry.run?.();
    };

    return (
      <div
        key={key}
        role="menuitem"
        tabIndex={-1}
        aria-disabled={entry.disabled ? true : undefined}
        aria-haspopup={hasChildren ? "menu" : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
        className={classes.join(" ")}
        title={entry.note}
        onMouseEnter={(event) => {
          if (entry.disabled) return;
          if (hasChildren) {
            setSubmenu({
              label: entry.label,
              anchor: event.currentTarget.getBoundingClientRect(),
            });
          } else if (depth === "root") {
            setSubmenu(null);
          }
        }}
        onClick={(event) => activate(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          activate(event.currentTarget);
        }}
      >
        <span className="wfm-ctx__label">{entry.label}</span>
        {entry.shortcut ? <span className="wfm-ctx__shortcut">{entry.shortcut}</span> : null}
        {hasChildren ? (
          <Icon name="chevron-right" size={8} className="wfm-ctx__chevron" />
        ) : entry.checked ? (
          <Icon name="check" size={12} className="wfm-ctx__check" />
        ) : null}
      </div>
    );
  };

  const renderEntries = (list: readonly MenuEntry[], depth: "root" | "sub"): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let previous = "start";
    for (const entry of list) {
      if (entry.kind === "separator") {
        nodes.push(
          <hr
            key={`sep-${depth}-${previous}`}
            className="wfm-ctx__sep"
            aria-orientation="horizontal"
          />,
        );
        continue;
      }
      nodes.push(renderRow(entry, depth, `${depth}-${entry.label}`));
      previous = entry.label;
    }
    return nodes;
  };

  return (
    <>
      <div
        ref={panelRef}
        className="wfm-ctx wfm-ctx-panel"
        style={{ left: panelPosition.x, top: panelPosition.y }}
        role="menu"
        aria-label={node ? `${node.name} menu` : "Canvas menu"}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="wfm-ctx__search">
          <Icon name="search" size={12} />
          <input
            ref={searchRef}
            type="text"
            className="wfm-ctx__search-input"
            value={query}
            placeholder="Type to search…"
            aria-label="Search menu"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="wfm-ctx__list">
          {filtered.length > 0 ? (
            renderEntries(filtered, "root")
          ) : (
            <div className="wfm-ctx__empty">No matching actions</div>
          )}
        </div>
      </div>

      {activeSubmenu?.children && activeSubmenu.children.length > 0 && submenu ? (
        <SubmenuPanel key={submenu.label} anchor={submenu.anchor}>
          {renderEntries(activeSubmenu.children, "sub")}
        </SubmenuPanel>
      ) : null}
    </>
  );
}
