import { canRedo, canUndo, createFrame, findNode, resolveNodeProps } from "@webfm/model";
import {
  type CSSProperties,
  Fragment,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { activePageOf, useProjectStore } from "../../state/project-store";
import { Icon, type IconName } from "../icons";
import { useUIStore } from "../ui-store";
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
  const insertNode = useProjectStore((state) => state.insertNode);
  const updateBox = useProjectStore((state) => state.updateBox);
  const updateText = useProjectStore((state) => state.updateText);

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

  const page = activePageOf(project, activePageId);
  const selectedId = selection[0];
  const selectedNode = page && selectedId ? findNode(page.root, selectedId) : null;
  const selectedText = selectedNode?.type === "text" ? selectedNode : null;
  const textProps =
    selectedText && project
      ? resolveNodeProps(selectedText, activeBreakpointId, project.breakpoints).text
      : null;

  const undoAvailable = history ? canUndo(history) : false;
  const redoAvailable = history ? canRedo(history) : false;
  const hasSelection = selection.length > 0;

  const addFrame = (): void => {
    insertNode(
      createFrame({
        name: "Frame",
        props: {
          size: { width: { mode: "fixed", value: 400 }, height: { mode: "fixed", value: 300 } },
        },
      }),
    );
  };

  const addStack = (): void => {
    insertNode(
      createFrame({
        name: "Stack",
        props: {
          layout: { mode: "stack" },
          size: { width: { mode: "fixed", value: 400 }, height: { mode: "hug" } },
        },
      }),
    );
  };

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
              shortcut: "Ctrl+Enter",
              action: addFrame,
              disabled: !project,
              reason: "Open a project first",
            },
            {
              id: "add-stack",
              label: "Add Stack",
              shortcut: "Ctrl+Alt+Enter",
              action: addStack,
              disabled: !project,
              reason: "Open a project first",
            },
            {
              id: "fit-content",
              label: "Fit content",
              shortcut: "Shift+A",
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
              label: "Create component…",
              shortcut: "Ctrl+Alt+K",
              disabled: true,
              reason: "Components are not in this build",
            },
            {
              id: "create-from-code",
              label: "Create from code…",
              shortcut: "Ctrl+Shift+K",
              disabled: true,
              reason: "Components are not in this build",
            },
            {
              id: "show-primary",
              label: "Show primary",
              disabled: true,
              reason: "Components are not in this build",
            },
            {
              id: "detach-primary",
              label: "Detach from primary",
              disabled: true,
              reason: "Components are not in this build",
            },
            {
              id: "update-primary",
              label: "Update primary from instance",
              disabled: true,
              reason: "Components are not in this build",
            },
            {
              id: "reset-overrides",
              label: "Reset overrides",
              disabled: true,
              reason: "Components are not in this build",
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
        className="wfm-menu__item"
        disabled={disabled}
        title={disabled ? entry.reason : undefined}
        onClick={disabled ? undefined : () => runEntry(entry)}
      >
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
