import { useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import { useUIStore } from "../ui-store";

export function BottomBar() {
  const tool = useUIStore((state) => state.tool);
  const setTool = useUIStore((state) => state.setTool);
  const zoomMenuOpen = useUIStore((state) => state.zoomMenuOpen);
  const setZoomMenuOpen = useUIStore((state) => state.setZoomMenuOpen);
  const zoom = useProjectStore((state) => state.zoom);
  const setZoom = useProjectStore((state) => state.setZoom);
  const setPan = useProjectStore((state) => state.setPan);

  return (
    <div className="wfm-bottombar">
      <button
        type="button"
        className={`wfm-bottombar__tool ${tool === "select" ? "is-active" : ""}`}
        title="Select"
        onClick={() => setTool("select")}
      >
        <Icon name="cursor" size={20} />
      </button>
      <button
        type="button"
        className={`wfm-bottombar__tool ${tool === "hand" ? "is-active" : ""}`}
        title="Hand"
        onClick={() => setTool("hand")}
      >
        <Icon name="hand" size={20} />
      </button>
      <button
        type="button"
        className="wfm-bottombar__tool"
        title="Comments are not in this build"
        disabled
        style={{ opacity: 0.4 }}
      >
        <Icon name="comment" size={20} />
      </button>
      <button
        type="button"
        className="wfm-bottombar__tool"
        title="Dark theme only in this build"
        onClick={() => setTool("select")}
      >
        <Icon name="moon" size={20} />
      </button>

      <span className="wfm-bottombar__sep" />

      <button
        type="button"
        className="wfm-zoom"
        onClick={() => setZoomMenuOpen(!zoomMenuOpen)}
        title="Zoom"
      >
        {Math.round(zoom * 100)}%
        <Icon name="chevron-down" size={8} />
      </button>

      <a
        className="wfm-upgrade"
        href="https://github.com/morewebs/WebFM"
        target="_blank"
        rel="noreferrer"
        title="WebFM is open source"
      >
        Star on GitHub
      </a>

      {zoomMenuOpen ? (
        <div
          className="wfm-menu"
          style={{ position: "fixed", bottom: 72, left: "50%", transform: "translateX(-50%)" }}
        >
          {[
            { label: "Zoom in", action: () => setZoom(zoom * 1.25) },
            { label: "Zoom out", action: () => setZoom(zoom / 1.25) },
            { label: "Zoom to 100%", action: () => setZoom(1) },
            { label: "Zoom to fit", action: () => setZoom(1) },
            {
              label: "Reset pan",
              action: () => setPan({ x: 0, y: 0 }),
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="wfm-menu__item"
              onClick={() => {
                item.action();
                setZoomMenuOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
