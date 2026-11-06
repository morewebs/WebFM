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
  | "show-pages"
  | "show-layers"
  | "show-assets"
  | "show-style"
  | "preview"
  | "publish"
  | "zoom-100";

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

export type ToolName = "select" | "frame" | "stack" | "text" | "image" | "oval";
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
export const SHORTCUT_DEFINITIONS: ReadonlyArray<
  Pick<ShortcutBinding, "id" | "keys" | "label">
> = [
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
  { id: "show-pages", keys: "Alt+Shift+1", label: "Show Pages" },
  { id: "show-layers", keys: "Alt+Shift+2", label: "Show Layers" },
  { id: "show-assets", keys: "Alt+Shift+3", label: "Show Assets" },
  { id: "show-style", keys: "E", label: "Show Style panel" },
  { id: "preview", keys: "Mod+P", label: "Open Preview" },
  { id: "publish", keys: "Mod+Shift+P", label: "Publish Site" },
  { id: "zoom-100", keys: "Mod+0", label: "Zoom to 100%" },
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
