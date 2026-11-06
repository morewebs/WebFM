import { describe, expect, it, vi } from "vitest";
import {
  createShortcutBindings,
  installShortcuts,
  type KeyboardEventLike,
  type KeyboardEventTarget,
  SHORTCUT_DEFINITIONS,
  shouldIgnoreKeyboardEvent,
} from "./registry";

function keyEvent(overrides: Partial<KeyboardEventLike> = {}): KeyboardEventLike {
  return {
    key: "",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: null,
    ...overrides,
  };
}

function actions() {
  return {
    undo: vi.fn(),
    redo: vi.fn(),
    deleteSelection: vi.fn(),
    clearSelection: vi.fn(),
  };
}

function bindingFor(bindings: ReturnType<typeof createShortcutBindings>, id: string) {
  const binding = bindings.find((candidate) => candidate.id === id);
  if (!binding) throw new Error(`Missing binding ${id}`);
  return binding;
}

describe("shortcut registry", () => {
  it("exports a definition for every binding", () => {
    const bindings = createShortcutBindings(actions());
    expect(bindings.map((binding) => binding.id).sort()).toEqual(
      SHORTCUT_DEFINITIONS.map((definition) => definition.id).sort(),
    );
    expect(SHORTCUT_DEFINITIONS).toHaveLength(20);
  });

  it("maps the tool and panel shortcuts without modifiers", () => {
    const bindings = createShortcutBindings(actions());
    expect(bindingFor(bindings, "tool-frame").match(keyEvent({ key: "f" }))).toBe(true);
    expect(bindingFor(bindings, "tool-stack").match(keyEvent({ key: "s" }))).toBe(true);
    expect(bindingFor(bindings, "tool-text").match(keyEvent({ key: "t" }))).toBe(true);
    expect(bindingFor(bindings, "tool-oval").match(keyEvent({ key: "o" }))).toBe(true);
    expect(bindingFor(bindings, "tool-frame").match(keyEvent({ key: "f", metaKey: true }))).toBe(
      false,
    );
    expect(bindingFor(bindings, "show-style").match(keyEvent({ key: "e" }))).toBe(true);
    expect(
      bindingFor(bindings, "show-pages").match(
        keyEvent({ key: "1", altKey: true, shiftKey: true }),
      ),
    ).toBe(true);
  });

  it("maps Mod+Z to undo and Shift+Mod+Z to redo", () => {
    const bindings = createShortcutBindings(actions());
    const undo = bindingFor(bindings, "undo");
    const redo = bindingFor(bindings, "redo");

    expect(undo.match(keyEvent({ key: "z", ctrlKey: true }))).toBe(true);
    expect(undo.match(keyEvent({ key: "Z", metaKey: true }))).toBe(true);
    expect(undo.match(keyEvent({ key: "z", metaKey: true, shiftKey: true }))).toBe(false);

    expect(redo.match(keyEvent({ key: "z", metaKey: true, shiftKey: true }))).toBe(true);
    expect(redo.match(keyEvent({ key: "z", ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(redo.match(keyEvent({ key: "z", ctrlKey: true }))).toBe(false);
  });

  it("maps Mod/Ctrl+Alt+K without Shift to create component", () => {
    const bindings = createShortcutBindings(actions());
    const createComponent = bindingFor(bindings, "create-component");

    expect(createComponent.match(keyEvent({ key: "k", ctrlKey: true, altKey: true }))).toBe(true);
    expect(createComponent.match(keyEvent({ key: "K", metaKey: true, altKey: true }))).toBe(true);
    expect(createComponent.match(keyEvent({ key: "k", ctrlKey: true }))).toBe(false);
    expect(createComponent.match(keyEvent({ key: "k", altKey: true }))).toBe(false);
    expect(
      createComponent.match(keyEvent({ key: "k", ctrlKey: true, altKey: true, shiftKey: true })),
    ).toBe(false);
  });

  it("maps Alt+Escape without primary or Shift to back to page", () => {
    const bindings = createShortcutBindings(actions());
    const backToPage = bindingFor(bindings, "back-to-page");

    expect(backToPage.match(keyEvent({ key: "Escape", altKey: true }))).toBe(true);
    expect(backToPage.match(keyEvent({ key: "Escape" }))).toBe(false);
    expect(backToPage.match(keyEvent({ key: "Escape", altKey: true, metaKey: true }))).toBe(false);
    expect(backToPage.match(keyEvent({ key: "Escape", altKey: true, ctrlKey: true }))).toBe(false);
    expect(backToPage.match(keyEvent({ key: "Escape", altKey: true, shiftKey: true }))).toBe(false);
  });

  it("maps Delete and Backspace without modifiers to delete selection", () => {
    const bindings = createShortcutBindings(actions());
    const deleteBinding = bindingFor(bindings, "delete-selection");
    expect(deleteBinding.match(keyEvent({ key: "Delete" }))).toBe(true);
    expect(deleteBinding.match(keyEvent({ key: "Backspace" }))).toBe(true);
    expect(deleteBinding.match(keyEvent({ key: "Delete", shiftKey: true }))).toBe(false);
    expect(deleteBinding.match(keyEvent({ key: "Delete", metaKey: true }))).toBe(false);
  });

  it("maps Escape to clear selection", () => {
    const bindings = createShortcutBindings(actions());
    const clearBinding = bindingFor(bindings, "clear-selection");
    expect(clearBinding.match(keyEvent({ key: "Escape" }))).toBe(true);
    expect(clearBinding.match(keyEvent({ key: "Escape", ctrlKey: true }))).toBe(false);
  });

  it("runs the action for a matching event", () => {
    const spies = { ...actions(), createComponent: vi.fn(), backToPage: vi.fn() };
    const bindings = createShortcutBindings(spies);
    bindingFor(bindings, "undo").run();
    bindingFor(bindings, "redo").run();
    bindingFor(bindings, "delete-selection").run();
    bindingFor(bindings, "clear-selection").run();
    bindingFor(bindings, "create-component").run();
    bindingFor(bindings, "back-to-page").run();
    expect(spies.undo).toHaveBeenCalledTimes(1);
    expect(spies.redo).toHaveBeenCalledTimes(1);
    expect(spies.deleteSelection).toHaveBeenCalledTimes(1);
    expect(spies.clearSelection).toHaveBeenCalledTimes(1);
    expect(spies.createComponent).toHaveBeenCalledTimes(1);
    expect(spies.backToPage).toHaveBeenCalledTimes(1);
  });

  it("ignores events from inputs, textareas, selects and contentEditable", () => {
    expect(shouldIgnoreKeyboardEvent({ tagName: "INPUT" })).toBe(true);
    expect(shouldIgnoreKeyboardEvent({ tagName: "TEXTAREA" })).toBe(true);
    expect(shouldIgnoreKeyboardEvent({ tagName: "SELECT" })).toBe(true);
    expect(shouldIgnoreKeyboardEvent({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(shouldIgnoreKeyboardEvent({ tagName: "DIV" })).toBe(false);
    expect(shouldIgnoreKeyboardEvent(null)).toBe(false);
  });

  it("installs and uninstalls a single window listener", () => {
    const listeners = new Map<string, (event: KeyboardEventLike) => void>();
    const target: KeyboardEventTarget = {
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
    };

    const spies = actions();
    const uninstall = installShortcuts(spies, target);
    const handler = listeners.get("keydown");
    expect(handler).toBeDefined();

    const preventDefault = vi.fn();
    handler?.(keyEvent({ key: "z", ctrlKey: true, target: { tagName: "BODY" }, preventDefault }));
    expect(spies.undo).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);

    handler?.(keyEvent({ key: "z", ctrlKey: true, target: { tagName: "INPUT" } }));
    expect(spies.undo).toHaveBeenCalledTimes(1);

    uninstall();
    expect(listeners.has("keydown")).toBe(false);
  });
});
