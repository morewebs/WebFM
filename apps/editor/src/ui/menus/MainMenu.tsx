import { canRedo, canUndo, findNode, findParent, resolveNodeProps } from "@webfm/model";
import {
  type CSSProperties,
  Fragment,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { activeSceneOf, useProjectStore } from "../../state/project-store";
import { Icon, type IconName } from "../icons";
import { useUIStore } from "../ui-store";
import { unwrapSelection, wrapSelection } from "./context-actions";
import "./MainMenu.css";

interface MainMenuProps {
  style?: CSSProperties;
  onClose(): void;
}

interface MenuEntry {
  id: string;
  label: string;
  shortcut?: string;
  icon?: IconName;
  active?: boolean;
  disabled?: boolean;
  reason?: string;
  action?: () => void;
}

interface MenuSubmenu {
  id: string;
  label: string;
  entries: MenuEntry[];
}

type TopItem = { kind: "entry"; entry: MenuEntry } | { kind: "submenu"; submenu: MenuSubmenu };

const VIEW_DISABLED = "Only the Canvas view is in this build";

/**
 * The Framer-logo main menu. Two levels: top-level rows and hover flyouts.
 * Structure, labels and shortcut strings follow docs/FRAMER-REFERENCE.md,
 * docs/SHORTCUTS.md and screenshot .scratch/framer-recon/screens/19-hover-tool.png.
 */
export function MainMenu({ style, onClose }: MainMenuProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const setTool = useUIStore((state) => state.setTool);
  const setLeftTab = useUIStore((state) => state.setLeftTab);
  const setProjectMenuOpen = useUIStore((state) => state.setProjectMenuOpen);
  const setPublishOpen = useUIStore((state) => state.setPublishOpen);
  const rulersVisible = useUIStore((state) => state.rulersVisible);
  const guidesVisible = useUIStore((state) => state.guidesVisible);
  const toggleRulers = useUIStore((state) => state.toggleRulers);
  const toggleGuides = useUIStore((state) => state.toggleGuides);
  const setZoom = useProjectStore((state) => state.setZoom);
  const setPan = useProjectStore((state) => state.setPan);

  const project = useProjectStore((state) => state.project);
  const activePageId = useProjectStore((state) => state.activePageId);
  const activeBreakpointId = useProjectStore((state) => state.activeBreakpointId);
  const history = useProjectStore((state) => state.history);
  const selection = useProjectStore((state) => state.selection);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const duplicateSelection = useProjectStore((state) => state.duplicateSelection);
  const deleteSelection = useProjectStore((state) => state.deleteSelection);
  const updateBox = useProjectStore((state) => state.updateBox);
  const updateText = useProjectStore((state) => state.updateText);
  const editingComponent = useProjectStore((state) => state.editingComponent);
  const createComponentFromSelection = useProjectStore(
    (state) => state.createComponentFromSelection,
  );
  const enterComponent = useProjectStore((state) => state.enterComponent);
  const exitComponent = useProjectStore((state) => state.exitComponent);
  const addComponentVariant = useProjectStore((state) => state.addComponentVariant);

  useEffect(() => {
    const handlePointer = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (rootRef.current?.contains(target)) return;
      // The logo and the Canvas switcher both toggle this menu; let their click
      // handler close it instead of closing on pointerdown and reopening.
      if (target.closest(".wfm-logo-btn, .wfm-view-switch")) return;
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

  const scene = activeSceneOf(project, activePageId, editingComponent);
  const selectedId = selection[0];
  const selectedNode = scene && selectedId ? findNode(scene.root, selectedId) : null;
  const singleSelectedNode = selection.length === 1 ? selectedNode : null;
  const selectedIsSceneRoot =
    scene !== null && selectedId !== undefined && selectedId === scene.root.id;
  const canCreateComponent =
    scene?.kind === "page" && singleSelectedNode !== null && !selectedIsSceneRoot;
  const createComponentReason = !singleSelectedNode
    ? "Select a single layer"
    : scene?.kind === "component"
      ? "Exit the component to create another"
      : selectedIsSceneRoot
        ? "The page root cannot become a component"
        : "Select a single layer";
  const instanceNode = singleSelectedNode?.type === "componentInstance" ? singleSelectedNode : null;
  const selectedText = selectedNode?.type === "text" ? selectedNode : null;
  const textProps =
    selectedText && project
      ? resolveNodeProps(selectedText, activeBreakpointId, project.breakpoints).text
      : null;

  const undoAvailable = history ? canUndo(history) : false;
  const redoAvailable = history ? canRedo(history) : false;
  const hasSelection = selection.length > 0;

  const canWrapSelection = scene !== null && selection.some((id) => id !== scene.root.id);
  const selectedParent =
    scene && singleSelectedNode ? findParent(scene.root, singleSelectedNode.id) : null;
  const canUnwrapSelection =
    singleSelectedNode !== null &&
    !selectedIsSceneRoot &&
    (singleSelectedNode.type === "frame" ||
      (selectedParent !== null && selectedParent.id !== scene?.root.id));

  const fitContent = (): void => {
    if (!selectedId) return;
    updateBox(selectedId, { size: { width: { mode: "hug" }, height: { mode: "hug" } } });
  };

  const toggleBold = (): void => {
    if (!selectedText || !textProps) return;
    updateText(selectedText.id, {
      text: { fontWeight: textProps.fontWeight >= 600 ? 400 : 700 },
    });
  };

  const toggleItalic = (): void => {
    if (!selectedText || !textProps) return;
    updateText(selectedText.id, { text: { italic: !textProps.italic } });
  };

  const toggleUnderline = (): void => {
    if (!selectedText || !textProps) return;
    updateText(selectedText.id, {
      text: { textDecoration: textProps.textDecoration === "underline" ? "none" : "underline" },
    });
  };

  const sections: TopItem[][] = [
    [
      {
        kind: "entry",
        entry: {
          id: "canvas",
          label: "Canvas",
          shortcut: "Alt+1",
          active: true,
          action: () => undefined,
        },
      },
      {
        kind: "entry",
        entry: {
          id: "cms",
          label: "CMS",
          shortcut: "Alt+2",
          disabled: true,
          reason: VIEW_DISABLED,
        },
      },
      {
        kind: "entry",
        entry: {
          id: "localization",
          label: "Localization",
          shortcut: "Alt+3",
          disabled: true,
          reason: VIEW_DISABLED,
        },
      },
      {
        kind: "entry",
        entry: {
          id: "analytics",
          label: "Analytics",
          shortcut: "Alt+4",
          disabled: true,
          reason: VIEW_DISABLED,
        },
      },
      {
        kind: "entry",
        entry: {
          id: "settings",
          label: "Settings",
          shortcut: "Alt+5",
          disabled: true,
          reason: VIEW_DISABLED,
        },
      },
    ],
    [
      {
        kind: "entry",
        entry: {
          id: "dashboard",
          label: "Go to dashboard",
          disabled: true,
          reason: "The dashboard is not in this build",
        },
      },
      {
        kind: "entry",
        entry: {
          id: "quick-actions",
          label: "Quick actions",
          shortcut: "Ctrl+K",
          disabled: true,
          reason: "Quick actions are not in this build",
        },
      },
    ],
    [
      {
        kind: "submenu",
        submenu: {
          id: "file",
          label: "File",
          entries: [
            {
              id: "new-project",
              label: "New project",
              action: () => setProjectMenuOpen(true),
            },
            {
              id: "publish-site",
              label: "Publish site",
              shortcut: "Ctrl+Shift+P",
              action: () => setPublishOpen(true),
            },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "edit",
          label: "Edit",
          entries: [
            {
              id: "undo",
              label: "Undo",
              shortcut: "Ctrl+Z",
              action: undo,
              disabled: !undoAvailable,
              reason: "Nothing to undo",
            },
            {
              id: "redo",
              label: "Redo",
              shortcut: "Ctrl+Shift+Z",
              action: redo,
              disabled: !redoAvailable,
              reason: "Nothing to redo",
            },
            {
              id: "duplicate",
              label: "Duplicate",
              shortcut: "Ctrl+D",
              action: () => {
                duplicateSelection();
              },
              disabled: !hasSelection,
              reason: "Select a layer first",
            },
            {
              id: "delete",
              label: "Delete",
              shortcut: "Del",
              action: deleteSelection,
              disabled: !hasSelection,
              reason: "Select a layer first",
            },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "view",
          label: "View",
          entries: [
            {
              id: "show-pages",
              label: "Show pages",
              shortcut: "Alt+Shift+1",
              action: () => setLeftTab("pages"),
            },
            {
              id: "show-layers",
              label: "Show layers",
              shortcut: "Alt+Shift+2",
              action: () => setLeftTab("layers"),
            },
            {
              id: "show-assets",
              label: "Show assets",
              shortcut: "Alt+Shift+3",
              action: () => setLeftTab("assets"),
            },
            {
              id: "show-rulers",
              label: "Show rulers",
              shortcut: "Ctrl+R",
              active: rulersVisible,
              action: toggleRulers,
            },
            {
              id: "show-guides",
              label: "Show guides",
              shortcut: "Alt+G",
              active: guidesVisible,
              action: toggleGuides,
            },
            {
              id: "zoom-100",
              label: "Zoom to 100%",
              shortcut: "Ctrl+0",
              action: () => setZoom(1),
            },
            { id: "reset-pan", label: "Reset pan", action: () => setPan({ x: 0, y: 0 }) },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "tool",
          label: "Tool",
          entries: [
            { id: "tool-select", label: "Select", action: () => setTool("select") },
            { id: "tool-frame", label: "Frame", shortcut: "F", action: () => setTool("frame") },
            { id: "tool-stack", label: "Stack", shortcut: "S", action: () => setTool("stack") },
            { id: "tool-text", label: "Text", shortcut: "T", action: () => setTool("text") },
            {
              id: "tool-image",
              label: "Image",
              shortcut: "Shift+I",
              action: () => setTool("image"),
            },
            { id: "tool-oval", label: "Oval", shortcut: "O", action: () => setTool("oval") },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "layout",
          label: "Layout",
          entries: [
            {
              id: "add-frame",
              label: "Add Frame",
              shortcut: "Shift+F",
              action: () => wrapSelection("frame"),
              disabled: !canWrapSelection,
              reason: "Select a layer first",
            },
            {
              id: "add-stack",
              label: "Add Stack",
              shortcut: "Shift+A",
              action: () => wrapSelection("stack"),
              disabled: !canWrapSelection,
              reason: "Select a layer first",
            },
            {
              id: "group",
              label: "Group",
              shortcut: "Ctrl+G",
              action: () => wrapSelection("frame"),
              disabled: !canWrapSelection,
              reason: "Select a layer first",
            },
            {
              id: "ungroup",
              label: "Ungroup",
              shortcut: "Ctrl+Shift+G",
              action: () => unwrapSelection(),
              disabled: !canUnwrapSelection,
              reason: "Select a frame or a layer inside one",
            },
            {
              id: "remove-wrapper",
              label: "Remove Wrapper",
              shortcut: "Ctrl+Del",
              action: () => unwrapSelection(),
              disabled: !canUnwrapSelection,
              reason: "Select a frame or a layer inside one",
            },
            {
              id: "fit-content",
              label: "Fit content",
              action: fitContent,
              disabled: !hasSelection,
              reason: "Select a layer first",
            },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "text",
          label: "Text",
          entries: [
            {
              id: "bold",
              label: "Bold",
              action: toggleBold,
              disabled: !textProps,
              reason: "Select a text layer",
            },
            {
              id: "italic",
              label: "Italic",
              action: toggleItalic,
              disabled: !textProps,
              reason: "Select a text layer",
            },
            {
              id: "underline",
              label: "Underline",
              action: toggleUnderline,
              disabled: !textProps,
              reason: "Select a text layer",
            },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "vector",
          label: "Vector",
          entries: [
            {
              id: "vector-path",
              label: "Path",
              shortcut: "P",
              disabled: true,
              reason: "Vector tools are not in this build",
            },
            {
              id: "vector-rectangle",
              label: "Rectangle",
              shortcut: "R",
              disabled: true,
              reason: "Vector tools are not in this build",
            },
            {
              id: "vector-oval",
              label: "Oval",
              shortcut: "O",
              disabled: true,
              reason: "Vector tools are not in this build",
            },
            {
              id: "vector-polygon",
              label: "Polygon",
              disabled: true,
              reason: "Vector tools are not in this build",
            },
            {
              id: "vector-star",
              label: "Star",
              disabled: true,
              reason: "Vector tools are not in this build",
            },
          ],
        },
      },
    ],
    [
      {
        kind: "submenu",
        submenu: {
          id: "component",
          label: "Component",
          entries: [
            {
              id: "create-component",
              label: "Create Component",
              shortcut: "Cmd+Alt+K",
              action: () => {
                createComponentFromSelection();
              },
              disabled: !canCreateComponent,
              reason: createComponentReason,
            },
            {
              id: "edit-main-component",
              label: "Edit Main Component",
              action: () => {
                if (!instanceNode) return;
                enterComponent(
                  instanceNode.componentId,
                  instanceNode.variantId ?? undefined,
                  instanceNode.id,
                );
              },
              disabled: instanceNode === null,
              reason: "Select a component instance",
            },
            {
              id: "add-variant",
              label: "Add Variant",
              action: () => {
                addComponentVariant();
              },
              disabled: editingComponent === null,
              reason: "Edit a component first",
            },
            {
              id: "back-to-page",
              label: "Back to Page",
              shortcut: "Alt+Esc",
              action: exitComponent,
              disabled: editingComponent === null,
              reason: "Not editing a component",
            },
            {
              id: "create-from-code",
              label: "Create from code…",
              shortcut: "Ctrl+Shift+K",
              disabled: true,
              reason: "Code components are not in this build",
            },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "plugins",
          label: "Plugins",
          entries: [
            {
              id: "browse-plugins",
              label: "Browse all",
              disabled: true,
              reason: "Plugins are not in this build",
            },
            {
              id: "run-recent",
              label: "Run recent plugin",
              shortcut: "Ctrl+Alt+P",
              disabled: true,
              reason: "Plugins are not in this build",
            },
            {
              id: "clear-recent",
              label: "Clear recent plugins",
              disabled: true,
              reason: "Plugins are not in this build",
            },
            {
              id: "development-plugin",
              label: "Open development plugin",
              shortcut: "Ctrl+Alt+L",
              disabled: true,
              reason: "Plugins are not in this build",
            },
            {
              id: "developer-tools",
              label: "Show developer tools",
              disabled: true,
              reason: "Plugins are not in this build",
            },
            {
              id: "plugin-api",
              label: "API documentation",
              disabled: true,
              reason: "Plugins are not in this build",
            },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "code",
          label: "Code",
          entries: [
            {
              id: "code-component",
              label: "Create code component…",
              disabled: true,
              reason: "Code is not in this build",
            },
            {
              id: "code-override",
              label: "Create code override…",
              disabled: true,
              reason: "Code is not in this build",
            },
            {
              id: "code-api",
              label: "API documentation",
              disabled: true,
              reason: "Code is not in this build",
            },
          ],
        },
      },
      {
        kind: "submenu",
        submenu: {
          id: "preferences",
          label: "Preferences",
          entries: [
            "Animate on zoom",
            "Auto-draft content",
            "Auto-layout pinning",
            "Auto-switch to layers panel",
            "Exit canvas on double click",
            "Fast zoom",
            "Keyboard zooms to selection",
            "Off-screen content hint",
            "Reverse zoom direction",
            "Use direct selection",
            "Nudge amount",
            "Performance mode",
            "Reset default frame fill",
          ].map((label, index) => ({
            id: `preference-${index}`,
            label,
            disabled: true,
            reason: "Preferences are not in this build",
          })),
        },
      },
    ],
    [
      {
        kind: "submenu",
        submenu: {
          id: "help",
          label: "Help",
          entries: [
            {
              id: "keyboard-shortcuts",
              label: "Keyboard shortcuts",
              disabled: true,
              reason: "Help is not in this build",
            },
            {
              id: "help-api",
              label: "API documentation",
              disabled: true,
              reason: "Help is not in this build",
            },
          ],
        },
      },
    ],
  ];

  const normalized = query.trim().toLowerCase();
  const itemLabel = (item: TopItem): string =>
    item.kind === "entry" ? item.entry.label : item.submenu.label;
  const visibleSections = normalized
    ? sections
        .map((section) =>
          section.filter((item) => itemLabel(item).toLowerCase().includes(normalized)),
        )
        .filter((section) => section.length > 0)
    : sections;

  const runEntry = (entry: MenuEntry): void => {
    entry.action?.();
    onClose();
  };

  const renderEntry = (entry: MenuEntry): ReactElement => {
    const disabled = entry.disabled === true || entry.action === undefined;
    return (
      <button
        key={entry.id}
        type="button"
        className={`wfm-menu__item wfm-mainmenu__item${entry.active ? " is-active" : ""}`}
        disabled={disabled}
        title={disabled ? entry.reason : undefined}
        onClick={disabled ? undefined : () => runEntry(entry)}
      >
        {entry.icon ? <Icon name={entry.icon} size={14} className="wfm-mainmenu__icon" /> : null}
        <span className="wfm-menu__label">{entry.label}</span>
        {entry.shortcut ? <span className="wfm-menu__shortcut">{entry.shortcut}</span> : null}
      </button>
    );
  };

  const renderSubEntry = (entry: MenuEntry): ReactElement => {
    const disabled = entry.disabled === true || entry.action === undefined;
    return (
      <button
        key={entry.id}
        type="button"
        className={`wfm-menu__item${entry.active ? " is-active" : ""}`}
        disabled={disabled}
        title={disabled ? entry.reason : undefined}
        onClick={disabled ? undefined : () => runEntry(entry)}
      >
        {entry.active ? <Icon name="check" size={14} className="wfm-mainmenu__icon" /> : null}
        <span className="wfm-menu__label">{entry.label}</span>
        {entry.shortcut ? <span className="wfm-menu__shortcut">{entry.shortcut}</span> : null}
      </button>
    );
  };

  return (
    <div
      ref={rootRef}
      className="wfm-menu wfm-mainmenu"
      style={style}
      role="menu"
      aria-label="Main menu"
    >
      <label className="wfm-mainmenu__search">
        <Icon name="search" size={14} />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpenSubmenu(null);
          }}
          placeholder="Type to search..."
          aria-label="Search menu"
          spellCheck={false}
        />
      </label>

      {visibleSections.map((section) => {
        const sectionKey = section.map(itemLabel).join("-");
        return (
          <Fragment key={sectionKey}>
            {section !== visibleSections[0] ? <div className="wfm-menu__sep" /> : null}
            {section.map((item) =>
              item.kind === "submenu" ? (
                <div key={item.submenu.id} className="wfm-mainmenu__group">
                  <button
                    type="button"
                    className="wfm-menu__item wfm-mainmenu__item"
                    onClick={() => setOpenSubmenu(item.submenu.id)}
                    onMouseEnter={() => setOpenSubmenu(item.submenu.id)}
                    onFocus={() => setOpenSubmenu(item.submenu.id)}
                    aria-haspopup="menu"
                    aria-expanded={openSubmenu === item.submenu.id}
                  >
                    <span className="wfm-menu__label">{item.submenu.label}</span>
                    <Icon name="chevron-right" size={12} className="wfm-mainmenu__chevron" />
                  </button>
                  {openSubmenu === item.submenu.id ? (
                    <div
                      className="wfm-flyout wfm-mainmenu__flyout"
                      role="menu"
                      aria-label={item.submenu.label}
                      onMouseLeave={() => setOpenSubmenu(null)}
                    >
                      {item.submenu.entries.map(renderSubEntry)}
                    </div>
                  ) : null}
                </div>
              ) : (
                renderEntry(item.entry)
              ),
            )}
          </Fragment>
        );
      })}

      {visibleSections.length === 0 ? <div className="wfm-mainmenu__empty">No results.</div> : null}
    </div>
  );
}
