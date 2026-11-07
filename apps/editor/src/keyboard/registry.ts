/**
 * Keyboard shortcut registry.
 *
 * Bindings are plain objects with a `match` predicate so tests can assert the
 * table without a DOM. `installShortcuts` attaches one keydown listener to the
 * window and returns its uninstall function.
 */

export type ShortcutId =
  | "undo"
  | "redo"
  | "delete-selection"
  | "clear-selection"
  | "duplicate-selection"
  | "insert"
  | "tool-select"
  | "tool-frame"
  | "tool-stack"
  | "tool-text"
  | "tool-oval"
  | "tool-rectangle"
  | "tool-rounded"
  | "show-pages"
  | "show-layers"
  | "show-assets"
  | "show-style"
  | "preview"
  | "publish"
  | "zoom-100"
  | "align-left"
  | "align-center-h"
  | "align-right"
  | "distribute-h"
  | "align-top"
  | "align-center-v"
  | "align-bottom"
  | "distribute-v"
  | "create-component"
  | "back-to-page"
  | "group"
  | "ungroup"
  | "wrap-frame"
  | "wrap-stack"
  | "unwrap";

export interface KeyboardEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: EventTargetLike | null;
  preventDefault?: () => void;
}

export interface EventTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

export interface KeyboardEventTarget {
  addEventListener(type: string, listener: (event: KeyboardEventLike) => void): void;
  removeEventListener(type: string, listener: (event: KeyboardEventLike) => void): void;
}

export type ToolName =
  | "select"
  | "frame"
  | "stack"
  | "text"
  | "image"
  | "oval"
  | "rectangle"
  | "rounded";
export type LeftPanelName = "pages" | "layers" | "assets";

export interface ShortcutActions {
  undo(): void;
  redo(): void;
  deleteSelection(): void;
  clearSelection(): void;
  duplicateSelection?(): void;
  toggleInsert?(): void;
  setTool?(tool: ToolName): void;
  setLeftTab?(tab: LeftPanelName): void;
  showStyle?(): void;
  openPreview?(): void;
  openPublish?(): void;
  setZoom?(zoom: number): void;
  align?(mode: string): void;
  createComponent?(): void;
  backToPage?(): void;
  group?(): void;
  ungroup?(): void;
  wrapFrame?(): void;
  wrapStack?(): void;
  unwrap?(): void;
}

export interface ShortcutBinding {
  id: ShortcutId;
  /** Human-readable shortcut for tooltips and tests. */
  keys: string;
  label: string;
  match(event: KeyboardEventLike): boolean;
  run(): void;
}

/** Metadata table, exported so UI can render shortcut hints without actions. */
export const SHORTCUT_DEFINITIONS: ReadonlyArray<Pick<ShortcutBinding, "id" | "keys" | "label">> = [
  { id: "undo", keys: "Mod+Z", label: "Undo" },
  { id: "redo", keys: "Mod+Shift+Z", label: "Redo" },
  { id: "delete-selection", keys: "Delete", label: "Delete selection" },
  { id: "clear-selection", keys: "Escape", label: "Clear selection" },
  { id: "duplicate-selection", keys: "Mod+D", label: "Duplicate" },
  { id: "insert", keys: "I", label: "Insert menu" },
  { id: "tool-select", keys: "V", label: "Select tool" },
  { id: "tool-frame", keys: "F", label: "Frame tool" },
  { id: "tool-stack", keys: "S", label: "Stack tool" },
  { id: "tool-text", keys: "T", label: "Text tool" },
  { id: "tool-oval", keys: "O", label: "Oval tool" },
  { id: "tool-rectangle", keys: "R", label: "Rectangle tool" },
  { id: "tool-rounded", keys: "U", label: "Rounded tool" },
  { id: "show-pages", keys: "Alt+Shift+1", label: "Show Pages" },
  { id: "show-layers", keys: "Alt+Shift+2", label: "Show Layers" },
  { id: "show-assets", keys: "Alt+Shift+3", label: "Show Assets" },
  { id: "show-style", keys: "E", label: "Show Style panel" },
  { id: "preview", keys: "Mod+P", label: "Open Preview" },
  { id: "publish", keys: "Mod+Shift+P", label: "Publish Site" },
  { id: "zoom-100", keys: "Mod+0", label: "Zoom to 100%" },
  { id: "create-component", keys: "Mod+Alt+K", label: "Create Component" },
  { id: "back-to-page", keys: "Alt+Escape", label: "Back to page" },
  { id: "group", keys: "Mod+G", label: "Group" },
  { id: "ungroup", keys: "Mod+Shift+G", label: "Ungroup" },
  { id: "wrap-frame", keys: "Shift+F", label: "Add Frame" },
  { id: "wrap-stack", keys: "Shift+A", label: "Add Stack" },
  { id: "unwrap", keys: "Mod+Delete", label: "Remove Frame" },
  { id: "align-left", keys: "Alt+A", label: "Align left" },
  { id: "align-center-h", keys: "Alt+H", label: "Align horizontally" },
  { id: "align-right", keys: "Alt+D", label: "Align right" },
  { id: "distribute-h", keys: "Mod+Alt+H", label: "Distribute horizontally" },
  { id: "align-top", keys: "Alt+W", label: "Align top" },
  { id: "align-center-v", keys: "Alt+V", label: "Align vertically" },
  { id: "align-bottom", keys: "Alt+S", label: "Align bottom" },
  { id: "distribute-v", keys: "Mod+Alt+V", label: "Distribute vertically" },
];

const IGNORED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** True for form fields and editable regions, where shortcuts must not fire. */
export function shouldIgnoreKeyboardEvent(target: EventTargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = target.tagName?.toUpperCase();
  return tag !== undefined && IGNORED_TAGS.has(tag);
}

function hasPrimary(event: KeyboardEventLike): boolean {
  return event.metaKey === true || event.ctrlKey === true;
}

function hasNoModifiers(event: KeyboardEventLike): boolean {
  return (
    event.metaKey !== true &&
    event.ctrlKey !== true &&
    event.shiftKey !== true &&
    event.altKey !== true
  );
}

function key(event: KeyboardEventLike): string {
  return event.key.toLowerCase();
}

/** The live binding table. Tests use this to assert key mapping. */
export function createShortcutBindings(actions: ShortcutActions): ShortcutBinding[] {
  return [
    {
      id: "undo",
      keys: "Mod+Z",
      label: "Undo",
      match: (event) => hasPrimary(event) && !event.shiftKey && !event.altKey && key(event) === "z",
      run: () => actions.undo(),
    },
    {
      id: "redo",
      keys: "Mod+Shift+Z",
      label: "Redo",
      match: (event) => hasPrimary(event) && event.shiftKey === true && key(event) === "z",
      run: () => actions.redo(),
    },
    {
      id: "duplicate-selection",
      keys: "Mod+D",
      label: "Duplicate",
      match: (event) => hasPrimary(event) && !event.shiftKey && !event.altKey && key(event) === "d",
      run: () => actions.duplicateSelection?.(),
    },
    {
      id: "publish",
      keys: "Mod+Shift+P",
      label: "Publish Site",
      match: (event) => hasPrimary(event) && event.shiftKey === true && key(event) === "p",
      run: () => actions.openPublish?.(),
    },
    {
      id: "preview",
      keys: "Mod+P",
      label: "Open Preview",
      match: (event) => hasPrimary(event) && !event.shiftKey && !event.altKey && key(event) === "p",
      run: () => actions.openPreview?.(),
    },
    {
      id: "zoom-100",
      keys: "Mod+0",
      label: "Zoom to 100%",
      match: (event) => hasPrimary(event) && !event.shiftKey && event.key === "0",
      run: () => actions.setZoom?.(1),
    },
    {
      id: "create-component",
      keys: "Mod+Alt+K",
      label: "Create Component",
      match: (event) =>
        hasPrimary(event) && event.altKey === true && event.shiftKey !== true && key(event) === "k",
      run: () => actions.createComponent?.(),
    },
    {
      id: "back-to-page",
      keys: "Alt+Escape",
      label: "Back to page",
      match: (event) =>
        event.altKey === true &&
        event.metaKey !== true &&
        event.ctrlKey !== true &&
        event.shiftKey !== true &&
        event.key === "Escape",
      run: () => actions.backToPage?.(),
    },
    {
      id: "group",
      keys: "Mod+G",
      label: "Group",
      match: (event) =>
        hasPrimary(event) && event.shiftKey !== true && event.altKey !== true && key(event) === "g",
      run: () => actions.group?.(),
    },
    {
      id: "ungroup",
      keys: "Mod+Shift+G",
      label: "Ungroup",
      match: (event) =>
        hasPrimary(event) && event.shiftKey === true && event.altKey !== true && key(event) === "g",
      run: () => actions.ungroup?.(),
    },
    {
      id: "wrap-frame",
      keys: "Shift+F",
      label: "Add Frame",
      match: (event) =>
        event.shiftKey === true &&
        event.metaKey !== true &&
        event.ctrlKey !== true &&
        event.altKey !== true &&
        key(event) === "f",
      run: () => actions.wrapFrame?.(),
    },
    {
      id: "wrap-stack",
      keys: "Shift+A",
      label: "Add Stack",
      match: (event) =>
        event.shiftKey === true &&
        event.metaKey !== true &&
        event.ctrlKey !== true &&
        event.altKey !== true &&
        key(event) === "a",
      run: () => actions.wrapStack?.(),
    },
    {
      id: "unwrap",
      keys: "Mod+Delete",
      label: "Remove Frame",
      match: (event) =>
        hasPrimary(event) &&
        event.shiftKey !== true &&
        (event.key === "Delete" || event.key === "Backspace"),
      run: () => actions.unwrap?.(),
    },
    {
      id: "show-pages",
      keys: "Alt+Shift+1",
      label: "Show Pages",
      match: (event) => event.altKey === true && event.shiftKey === true && event.key === "1",
      run: () => actions.setLeftTab?.("pages"),
    },
    {
      id: "show-layers",
      keys: "Alt+Shift+2",
      label: "Show Layers",
      match: (event) => event.altKey === true && event.shiftKey === true && event.key === "2",
      run: () => actions.setLeftTab?.("layers"),
    },
    {
      id: "show-assets",
      keys: "Alt+Shift+3",
      label: "Show Assets",
      match: (event) => event.altKey === true && event.shiftKey === true && event.key === "3",
      run: () => actions.setLeftTab?.("assets"),
    },
    {
      id: "show-style",
      keys: "E",
      label: "Show Style panel",
      match: (event) => hasNoModifiers(event) && key(event) === "e",
      run: () => actions.showStyle?.(),
    },
    {
      id: "insert",
      keys: "I",
      label: "Insert menu",
      match: (event) => hasNoModifiers(event) && key(event) === "i",
      run: () => actions.toggleInsert?.(),
    },
    {
      id: "tool-select",
      keys: "V",
      label: "Select tool",
      match: (event) => hasNoModifiers(event) && key(event) === "v",
      run: () => actions.setTool?.("select"),
    },
    {
      id: "tool-frame",
      keys: "F",
      label: "Frame tool",
      match: (event) => hasNoModifiers(event) && key(event) === "f",
      run: () => actions.setTool?.("frame"),
    },
    {
      id: "tool-stack",
      keys: "S",
      label: "Stack tool",
      match: (event) => hasNoModifiers(event) && key(event) === "s",
      run: () => actions.setTool?.("stack"),
    },
    {
      id: "tool-text",
      keys: "T",
      label: "Text tool",
      match: (event) => hasNoModifiers(event) && key(event) === "t",
      run: () => actions.setTool?.("text"),
    },
    {
      id: "tool-oval",
      keys: "O",
      label: "Oval tool",
      match: (event) => hasNoModifiers(event) && key(event) === "o",
      run: () => actions.setTool?.("oval"),
    },
    {
      id: "tool-rectangle",
      keys: "R",
      label: "Rectangle tool",
      match: (event) => hasNoModifiers(event) && key(event) === "r",
      run: () => actions.setTool?.("rectangle"),
    },
    {
      id: "tool-rounded",
      keys: "U",
      label: "Rounded tool",
      match: (event) => hasNoModifiers(event) && key(event) === "u",
      run: () => actions.setTool?.("rounded"),
    },
    {
      id: "align-left",
      keys: "Alt+A",
      label: "Align left",
      match: (event) => event.altKey === true && !hasPrimary(event) && !event.shiftKey && key(event) === "a",
      run: () => actions.align?.("left"),
    },
    {
      id: "align-center-h",
      keys: "Alt+H",
      label: "Align horizontally",
      match: (event) => event.altKey === true && !hasPrimary(event) && !event.shiftKey && key(event) === "h",
      run: () => actions.align?.("center-h"),
    },
    {
      id: "align-right",
      keys: "Alt+D",
      label: "Align right",
      match: (event) => event.altKey === true && !hasPrimary(event) && !event.shiftKey && key(event) === "d",
      run: () => actions.align?.("right"),
    },
    {
      id: "distribute-h",
      keys: "Mod+Alt+H",
      label: "Distribute horizontally",
      match: (event) => hasPrimary(event) && event.altKey === true && !event.shiftKey && key(event) === "h",
      run: () => actions.align?.("distribute-h"),
    },
    {
      id: "align-top",
      keys: "Alt+W",
      label: "Align top",
      match: (event) => event.altKey === true && !hasPrimary(event) && !event.shiftKey && key(event) === "w",
      run: () => actions.align?.("top"),
    },
    {
      id: "align-center-v",
      keys: "Alt+V",
      label: "Align vertically",
      match: (event) => event.altKey === true && !hasPrimary(event) && !event.shiftKey && key(event) === "v",
      run: () => actions.align?.("center-v"),
    },
    {
      id: "align-bottom",
      keys: "Alt+S",
      label: "Align bottom",
      match: (event) => event.altKey === true && !hasPrimary(event) && !event.shiftKey && key(event) === "s",
      run: () => actions.align?.("bottom"),
    },
    {
      id: "distribute-v",
      keys: "Mod+Alt+V",
      label: "Distribute vertically",
      match: (event) => hasPrimary(event) && event.altKey === true && !event.shiftKey && key(event) === "v",
      run: () => actions.align?.("distribute-v"),
    },
    {
      id: "delete-selection",
      keys: "Delete",
      label: "Delete selection",
      match: (event) =>
        hasNoModifiers(event) && (event.key === "Delete" || event.key === "Backspace"),
      run: () => actions.deleteSelection(),
    },
    {
      id: "clear-selection",
      keys: "Escape",
      label: "Clear selection",
      match: (event) => hasNoModifiers(event) && event.key === "Escape",
      run: () => actions.clearSelection(),
    },
  ];
}

function windowTarget(): KeyboardEventTarget | null {
  if (typeof window === "undefined") return null;
  return window as unknown as KeyboardEventTarget;
}

/**
 * Binds the shortcut table to the window. Returns an uninstall function that
 * removes the exact listener, so remounts never stack handlers.
 */
export function installShortcuts(
  actions: ShortcutActions,
  target: KeyboardEventTarget | null | undefined = windowTarget(),
): () => void {
  if (!target) return () => {};
  const bindings = createShortcutBindings(actions);

  const handler = (event: KeyboardEventLike): void => {
    if (shouldIgnoreKeyboardEvent(event.target)) return;
    for (const binding of bindings) {
      if (!binding.match(event)) continue;
      event.preventDefault?.();
      binding.run();
      return;
    }
  };

  target.addEventListener("keydown", handler);
  return () => {
    target.removeEventListener("keydown", handler);
  };
}
