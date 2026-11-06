/**
 * Layers tab.
 *
 * A store-driven tree of the active page: the page root frame ("Desktop") with
 * a Primary badge, frames/text/images/component instances beneath it. Rows
 * support select, inline rename, a context menu, visibility/lock toggles and
 * drag reorder/reparent through the project store so undo/redo sees one entry
 * per gesture. Collapse state is local; Alt+L collapses every group.
 */

import {
  duplicateNode,
  findNode,
  findParent,
  indexOfNode,
  isSelfOrDescendant,
  moveNode,
  type NodeId,
  removeNode,
  renameNode,
  type SceneNode,
  setNodeLocked,
  setNodeVisible,
  walkNodes,
} from "@webfm/model";
import {
  Fragment,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { activePageOf, useProjectStore } from "../../state/project-store";
import { Icon, type IconName } from "../icons";
import "./LayersPanel.css";

type DropPosition = "before" | "after" | "inside";

interface DropTarget {
  nodeId: NodeId;
  position: DropPosition;
}

interface EditingName {
  id: NodeId;
  value: string;
}

const MENU_WIDTH = 200;
const MENU_HEIGHT = 190;

function glyphFor(node: SceneNode): IconName {
  if (node.type === "text") return "text";
  if (node.type === "image") return "image";
  if (node.type === "componentInstance") return "component";
  if (node.type === "frame") {
    const mode = node.responsive.base.layout?.mode;
    if (mode === "stack") return "stack";
    if (mode === "grid") return "grid";
  }
  return "frame";
}

function isExpandable(node: SceneNode): boolean {
  return node.type === "frame" && node.children.length > 0;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function LayersPanel() {
  const project = useProjectStore((state) => state.project);
  const activePageId = useProjectStore((state) => state.activePageId);
  const selection = useProjectStore((state) => state.selection);
  const select = useProjectStore((state) => state.select);
  const selectMany = useProjectStore((state) => state.selectMany);
  const applyRecipe = useProjectStore((state) => state.applyRecipe);

  const page = activePageOf(project, activePageId);
  const root = page?.root ?? null;

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<NodeId>>(() => new Set());
  const [editing, setEditing] = useState<EditingName | null>(null);
  const [menu, setMenu] = useState<{ id: NodeId; x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<NodeId | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const draggedRef = useRef<NodeId | null>(null);
  const cancelRenameRef = useRef<NodeId | null>(null);

  const selectionSet = useMemo(() => new Set(selection), [selection]);

  // Stable ref callback: focus and select the text the moment rename mounts.
  const focusRename = useCallback((element: HTMLInputElement | null) => {
    if (!element) return;
    element.focus();
    element.select();
  }, []);

  /** Search keeps matches and all of their ancestors; null means no filter. */
  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!root || needle.length === 0) return null;
    const hits = new Set<NodeId>();
    const visit = (node: SceneNode): boolean => {
      let hit = node.name.toLowerCase().includes(needle);
      if (node.type === "frame") {
        for (const child of node.children) {
          if (visit(child)) hit = true;
        }
      }
      if (hit) hits.add(node.id);
      return hit;
    };
    visit(root);
    return hits;
  }, [root, query]);

  // Alt+L collapses every group (the shortcut registry leaves inputs alone).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey || event.metaKey || event.ctrlKey || event.code !== "KeyL") return;
      if (isEditableTarget(event.target) || !root) return;
      event.preventDefault();
      const ids = new Set<NodeId>();
      walkNodes(root, (node) => {
        if (isExpandable(node)) ids.add(node.id);
      });
      setCollapsed(ids);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [root]);

  // Dismiss the context menu on an outside press or Escape.
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (menuRef.current && target instanceof Node && menuRef.current.contains(target)) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const toggleCollapsed = (nodeId: NodeId): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const startRename = (node: SceneNode): void => {
    cancelRenameRef.current = null;
    setMenu(null);
    setEditing({ id: node.id, value: node.name });
  };

  const commitRename = (nodeId: NodeId, rawValue: string): void => {
    if (cancelRenameRef.current === nodeId) {
      cancelRenameRef.current = null;
      setEditing((current) => (current?.id === nodeId ? null : current));
      return;
    }
    const name = rawValue.trim();
    if (name.length > 0) {
      const state = useProjectStore.getState();
      const currentPage = activePageOf(state.project, state.activePageId);
      const node = currentPage ? findNode(currentPage.root, nodeId) : null;
      if (currentPage && node && node.name !== name) {
        applyRecipe("Rename layer", (draft) => {
          renameNode(draft, { pageId: currentPage.id, nodeId }, name);
        });
      }
    }
    setEditing((current) => (current?.id === nodeId ? null : current));
  };

  const cancelRename = (nodeId: NodeId): void => {
    cancelRenameRef.current = nodeId;
    setEditing((current) => (current?.id === nodeId ? null : current));
  };

  const duplicateLayer = (node: SceneNode): void => {
    if (!page || node.id === page.root.id) return;
    const created: { id: NodeId | null } = { id: null };
    applyRecipe("Duplicate layer", (draft) => {
      created.id = duplicateNode(draft, { pageId: page.id, nodeId: node.id });
    });
    if (created.id) select(created.id);
    setMenu(null);
  };

  const toggleVisibility = (node: SceneNode): void => {
    if (!page) return;
    applyRecipe(node.visible ? "Hide layer" : "Show layer", (draft) => {
      setNodeVisible(draft, { pageId: page.id, nodeId: node.id }, !node.visible);
    });
    setMenu(null);
  };

  const toggleLock = (node: SceneNode): void => {
    if (!page) return;
    applyRecipe(node.locked ? "Unlock layer" : "Lock layer", (draft) => {
      setNodeLocked(draft, { pageId: page.id, nodeId: node.id }, !node.locked);
    });
    setMenu(null);
  };

  const deleteLayer = (node: SceneNode): void => {
    if (!page || node.id === page.root.id) return;
    const parent = findParent(page.root, node.id);
    applyRecipe("Delete layer", (draft) => {
      removeNode(draft, { pageId: page.id, nodeId: node.id });
    });
    const rest = selection.filter((id) => id !== node.id);
    selectMany(rest.length > 0 ? rest : parent ? [parent.id] : []);
    setMenu(null);
  };

  const openMenuAt = (clientX: number, clientY: number, node: SceneNode): void => {
    select(node.id);
    setMenu({
      id: node.id,
      x: Math.max(8, Math.min(clientX, window.innerWidth - MENU_WIDTH - 8)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - MENU_HEIGHT - 8)),
    });
  };

  const openMenu = (event: ReactMouseEvent, node: SceneNode): void => {
    event.preventDefault();
    event.stopPropagation();
    openMenuAt(event.clientX, event.clientY, node);
  };

  const resolveDropPosition = (
    event: ReactDragEvent<HTMLDivElement>,
    node: SceneNode,
  ): DropPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!root || node.id === root.id) return "inside";
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    if (node.type === "frame" && ratio > 0.25 && ratio < 0.75) return "inside";
    return ratio < 0.5 ? "before" : "after";
  };

  const canDropOn = (node: SceneNode, draggedId: NodeId | null): draggedId is NodeId => {
    if (!root || !draggedId) return false;
    if (node.locked) return false;
    if (node.id === draggedId) return false;
    return !isSelfOrDescendant(root, draggedId, node.id);
  };

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>, node: SceneNode): void => {
    if (!page || node.locked || node.id === page.root.id) {
      event.preventDefault();
      return;
    }
    draggedRef.current = node.id;
    setDraggingId(node.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
  };

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>, node: SceneNode): void => {
    const draggedId = draggedRef.current;
    if (!canDropOn(node, draggedId)) {
      event.dataTransfer.dropEffect = "none";
      setDrop(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const position = resolveDropPosition(event, node);
    setDrop((current) =>
      current?.nodeId === node.id && current.position === position
        ? current
        : { nodeId: node.id, position },
    );
  };

  const clearDrag = (): void => {
    draggedRef.current = null;
    setDraggingId(null);
    setDrop(null);
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>, node: SceneNode): void => {
    event.preventDefault();
    const draggedId = draggedRef.current;
    const position = drop?.nodeId === node.id ? drop.position : resolveDropPosition(event, node);
    clearDrag();
    if (!page || !canDropOn(node, draggedId)) return;

    let parentId: NodeId;
    let index: number;
    if (position === "inside") {
      if (node.type !== "frame") return;
      parentId = node.id;
      index = node.children.length;
    } else {
      const parent = findParent(page.root, node.id);
      if (!parent) return;
      parentId = parent.id;
      index = indexOfNode(parent, node.id) + (position === "after" ? 1 : 0);
      const previousParent = findParent(page.root, draggedId);
      if (previousParent && previousParent.id === parent.id) {
        const previousIndex = indexOfNode(previousParent, draggedId);
        if (previousIndex < index) index -= 1;
      }
    }

    applyRecipe("Move layer", (draft) => {
      moveNode(draft, { pageId: page.id, nodeId: draggedId, parentId, index });
    });
  };

  const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, node: SceneNode): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(node.id, event.shiftKey || event.metaKey || event.ctrlKey);
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openMenuAt(rect.left + 12, rect.top + 12, node);
    }
  };

  const renderNode = (node: SceneNode, depth: number): ReactNode => {
    if (!root || !page) return null;
    if (matching && !matching.has(node.id)) return null;

    const isRoot = node.id === root.id;
    const isSelected = selectionSet.has(node.id);
    const isEditing = editing?.id === node.id;
    const expandable = isExpandable(node);
    const open = matching ? true : !collapsed.has(node.id);
    const dropPosition = drop?.nodeId === node.id ? drop.position : null;

    const rowClass = ["wfm-list-row", "wfm-layer-row"];
    if (isSelected) rowClass.push("is-selected");
    if (!node.visible) rowClass.push("is-hidden");
    if (draggingId === node.id) rowClass.push("is-dragging");
    if (dropPosition) rowClass.push(`is-drop-${dropPosition}`);

    const row = (
      <div
        key={node.id}
        role="treeitem"
        aria-selected={isSelected}
        aria-level={depth + 1}
        aria-expanded={expandable ? open : undefined}
        tabIndex={0}
        className={rowClass.join(" ")}
        style={{ paddingLeft: 8 + depth * 12 }}
        draggable={!isEditing && !isRoot && !node.locked}
        onClick={(event) => select(node.id, event.shiftKey || event.metaKey || event.ctrlKey)}
        onDoubleClick={() => startRename(node)}
        onContextMenu={(event) => openMenu(event, node)}
        onKeyDown={(event) => handleRowKeyDown(event, node)}
        onDragStart={(event) => handleDragStart(event, node)}
        onDragOver={(event) => handleDragOver(event, node)}
        onDrop={(event) => handleDrop(event, node)}
        onDragEnd={clearDrag}
      >
        <span className="wfm-layer-row__lead">
          {expandable ? (
            <button
              type="button"
              className="wfm-layer-row__disclosure"
              tabIndex={-1}
              aria-label={open ? "Collapse layer" : "Expand layer"}
              onClick={(event) => {
                event.stopPropagation();
                toggleCollapsed(node.id);
              }}
            >
              <Icon name={open ? "chevron-down" : "chevron-right"} size={12} />
            </button>
          ) : null}
        </span>
        <Icon name={glyphFor(node)} size={16} className="wfm-layer-row__glyph" />
        {isEditing ? (
          <input
            className="wfm-layer-row__rename"
            value={editing.value}
            ref={focusRename}
            aria-label="Layer name"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onChange={(event) => setEditing({ id: node.id, value: event.target.value })}
            onBlur={() => commitRename(node.id, editing.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                commitRename(node.id, editing.value);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelRename(node.id);
              }
            }}
          />
        ) : (
          <span className="wfm-list-row__name">{node.name}</span>
        )}
        <span
          className={`wfm-layer-row__actions${!node.visible || node.locked ? " is-visible" : ""}`}
        >
          <button
            type="button"
            className="wfm-layer-row__action"
            title={node.visible ? "Hide layer" : "Show layer"}
            aria-label={node.visible ? "Hide layer" : "Show layer"}
            onClick={(event) => {
              event.stopPropagation();
              toggleVisibility(node);
            }}
          >
            <Icon name={node.visible ? "eye" : "eye-off"} size={13} />
          </button>
          <button
            type="button"
            className="wfm-layer-row__action"
            title={node.locked ? "Unlock layer" : "Lock layer"}
            aria-label={node.locked ? "Unlock layer" : "Lock layer"}
            onClick={(event) => {
              event.stopPropagation();
              toggleLock(node);
            }}
          >
            <Icon name={node.locked ? "lock" : "unlock"} size={13} />
          </button>
        </span>
        {isRoot ? <span className="wfm-badge">Primary</span> : null}
      </div>
    );

    if (!expandable || !open) return <Fragment key={node.id}>{row}</Fragment>;

    return (
      <Fragment key={node.id}>
        {row}
        {node.type === "frame" ? node.children.map((child) => renderNode(child, depth + 1)) : null}
      </Fragment>
    );
  };

  const menuNode = menu && page ? findNode(page.root, menu.id) : null;
  const menuIsRoot = Boolean(menuNode && page && menuNode.id === page.root.id);

  return (
    <div className="wfm-panel-control">
      <button type="button" className="wfm-path-button" title="Home">
        <Icon name="home" size={16} />
        <span>Home</span>
        <Icon name="chevron-down" size={14} />
      </button>

      <div className="wfm-search">
        <Icon name="search" size={14} />
        <input
          type="text"
          value={query}
          placeholder="Search..."
          aria-label="Search layers"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="wfm-layers__divider" />

      <div className="wfm-layer-tree" role="tree" aria-label="Layers">
        {root ? renderNode(root, 0) : null}
      </div>

      {menu && menuNode ? (
        <div
          ref={menuRef}
          className="wfm-menu wfm-layer-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="wfm-menu__item"
            onClick={() => startRename(menuNode)}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className={`wfm-menu__item${menuIsRoot ? " is-disabled" : ""}`}
            disabled={menuIsRoot}
            onClick={() => duplicateLayer(menuNode)}
          >
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className="wfm-menu__item"
            onClick={() => toggleVisibility(menuNode)}
          >
            {menuNode.visible ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="wfm-menu__item"
            onClick={() => toggleLock(menuNode)}
          >
            {menuNode.locked ? "Unlock" : "Lock"}
          </button>
          <div className="wfm-menu__sep" />
          <button
            type="button"
            role="menuitem"
            className={`wfm-menu__item${menuIsRoot || menuNode.locked ? " is-disabled" : ""}`}
            disabled={menuIsRoot || menuNode.locked}
            onClick={() => deleteLayer(menuNode)}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
