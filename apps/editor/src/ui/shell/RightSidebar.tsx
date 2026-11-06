import { Fragment, useEffect } from "react";
import type { AlignMode } from "../canvas/alignment";
import { useAlignSelection } from "../canvas/alignment";
import { Icon, type IconName } from "../icons";
import { PropertiesPanel } from "../panels/PropertiesPanel";
import { useUIStore } from "../ui-store";

const alignButtons: ReadonlyArray<{
  name: IconName;
  mode: AlignMode;
  title: string;
}> = [
  { name: "align-left", mode: "left", title: "Align left (Alt+A)" },
  { name: "align-center-h", mode: "center-h", title: "Align horizontally (Alt+H)" },
  { name: "align-right", mode: "right", title: "Align right (Alt+D)" },
  { name: "distribute-h", mode: "distribute-h", title: "Distribute horizontally (Ctrl+Alt+H)" },
  { name: "align-top", mode: "top", title: "Align top (Alt+W)" },
  { name: "align-center-v", mode: "center-v", title: "Align vertically (Alt+V)" },
  { name: "align-bottom", mode: "bottom", title: "Align bottom (Alt+S)" },
  { name: "distribute-v", mode: "distribute-v", title: "Distribute vertically (Ctrl+Alt+V)" },
];

export function RightSidebar() {
  const rightTab = useUIStore((state) => state.rightTab);
  const setRightTab = useUIStore((state) => state.setRightTab);
  const { align, canAlign } = useAlignSelection();

  useEffect(() => {
    const handleAlign = (event: Event): void => {
      const mode = (event as CustomEvent<AlignMode>).detail;
      if (mode) align(mode);
    };
    window.addEventListener("wfm:align", handleAlign);
    return () => window.removeEventListener("wfm:align", handleAlign);
  }, [align]);

  return (
    <aside className="wfm-rightbar">
      <div className="wfm-tabs">
        <button
          type="button"
          className={`wfm-tab ${rightTab === "agent" ? "is-active" : ""}`}
          onClick={() => setRightTab("agent")}
        >
          Agent
        </button>
        <button
          type="button"
          className={`wfm-tab ${rightTab === "style" ? "is-active" : ""}`}
          onClick={() => setRightTab("style")}
        >
          Style
        </button>
      </div>

      {rightTab === "agent" ? <AgentPanel /> : null}
      {rightTab === "style" ? (
        <>
          <div className="wfm-alignbar" aria-label="Alignment">
            {alignButtons.map((button, index) => (
              <Fragment key={button.name}>
                {index === 4 ? <span className="wfm-alignbar__sep" /> : null}
                <button
                  type="button"
                  className="wfm-alignbar__button"
                  title={button.title}
                  disabled={!canAlign(button.mode)}
                  onClick={() => align(button.mode)}
                >
                  <Icon name={button.name} size={16} />
                </button>
              </Fragment>
            ))}
            <span className="wfm-alignbar__sep" />
            <button
              type="button"
              className="wfm-alignbar__button"
              title="More alignment options are not in this build"
              disabled
              style={{ opacity: 0.4 }}
            >
              <Icon name="more" size={16} />
            </button>
          </div>
        </>
      ) : null}
      {rightTab === "style" ? (
        <div className="wfm-panel-scroll">
          <PropertiesPanel />
        </div>
      ) : null}
    </aside>
  );
}

function AgentPanel() {
  return (
    <div className="wfm-panel-scroll" style={{ padding: 10, display: "grid", gap: 10 }}>
      <div className="wfm-path-button" style={{ justifyContent: "space-between" }}>
        New chat
        <Icon name="chevron-down" size={14} />
      </div>
      <p className="wfm-empty" style={{ padding: "4px 2px" }}>
        The Framer Agent is not part of this build. The Style panel is the working
        inspector.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {["Design a landing page", "Design a portfolio", "Import my current website"].map(
          (label) => (
            <button
              key={label}
              type="button"
              className="wfm-list-row"
              style={{ background: "var(--wfm-surface)", opacity: 0.45 }}
              disabled
            >
              {label}
            </button>
          ),
        )}
      </div>
      <div
        className="wfm-field"
        style={{
          height: 86,
          padding: 10,
          color: "var(--wfm-text-faint)",
          opacity: 0.5,
        }}
      >
        Ask Framer…
      </div>
    </div>
  );
}
