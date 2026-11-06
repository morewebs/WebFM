import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../icons";
import { type EditorTool, useUIStore } from "../ui-store";
import "./LayoutToolsMenu.css";

interface LayoutToolsMenuProps {
  anchor?: "frame";
  onClose(): void;
}

interface LayoutToolItem {
  id: string;
  label: string;
  shortcut: string;
  icon: IconName;
  tool?: EditorTool;
  disabled?: boolean;
  reason?: string;
}

// The shell's EditorTool union predates the Grid tool. The canvas reads the
// string, so the cast stays localized here until the lead widens the union.
const GRID_TOOL = "grid" as unknown as EditorTool;

const LAYOUT_TOOLS: LayoutToolItem[] = [
  { id: "frame", label: "Frame", shortcut: "F", icon: "frame", tool: "frame" },
  { id: "stack", label: "Stack", shortcut: "S", icon: "stack", tool: "stack" },
  { id: "grid", label: "Grid", shortcut: "Shift+G", icon: "grid", tool: GRID_TOOL },
  {
    id: "masonry",
    label: "Masonry",
    shortcut: "Shift+M",
    icon: "grid",
    disabled: true,
    reason: "Masonry layouts are not in this build",
  },
  { id: "image", label: "Image", shortcut: "Shift+I", icon: "image", tool: "image" },
  {
    id: "video",
    label: "Video",
    shortcut: "Shift+V",
    icon: "play",
    disabled: true,
    reason: "Video is not in this build",
  },
];

/**
 * Layout-tools flyout, opened from the frame icon in the top bar. Rendered in
 * the tool button's wrapper; it measures that wrapper so the panel sits just
 * below it (screenshot .scratch/framer-recon/screens/65-stack-inserted.png).
 */
export function LayoutToolsMenu({ onClose }: LayoutToolsMenuProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const setTool = useUIStore((state) => state.setTool);

  useLayoutEffect(() => {
    const node = rootRef.current;
    const trigger = node?.parentElement;
    if (!node || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left - 16, window.innerWidth - 184));
    setPosition({ top: rect.bottom + 3, left });
  }, []);

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

  const choose = (tool: EditorTool): void => {
    setTool(tool);
    onClose();
  };

  const renderItem = (item: LayoutToolItem): ReactElement => {
    const disabled = item.disabled === true || item.tool === undefined;
    return (
      <button
        key={item.id}
        type="button"
        className="wfm-menu__item wfm-layout-menu__item"
        disabled={disabled}
        title={disabled ? item.reason : undefined}
        onClick={
          disabled
            ? undefined
            : () => {
                if (item.tool) choose(item.tool);
              }
        }
      >
        <Icon name={item.icon} size={16} className="wfm-layout-menu__icon" />
        <span className="wfm-layout-menu__label">{item.label}</span>
        <span className="wfm-menu__shortcut">{item.shortcut}</span>
      </button>
    );
  };

  return (
    <div
      ref={rootRef}
      className="wfm-layout-menu"
      style={{ top: position.top, left: position.left }}
      role="menu"
      aria-label="Layout tools"
    >
      {LAYOUT_TOOLS.slice(0, 4).map(renderItem)}
      <div className="wfm-menu__sep" />
      {LAYOUT_TOOLS.slice(4).map(renderItem)}
    </div>
  );
}
