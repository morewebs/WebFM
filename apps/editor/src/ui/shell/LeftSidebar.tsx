import { AssetsPanel } from "../panels/AssetsPanel";
import { LayersPanel } from "../panels/LayersPanel";
import { PagesPanel } from "../panels/PagesPanel";
import { InsertMenu } from "../menus/InsertMenu";
import { useUIStore } from "../ui-store";

const tabs = [
  { id: "pages", label: "Pages" },
  { id: "layers", label: "Layers" },
  { id: "assets", label: "Assets" },
] as const;

export function LeftSidebar() {
  const leftTab = useUIStore((state) => state.leftTab);
  const setLeftTab = useUIStore((state) => state.setLeftTab);
  const insertOpen = useUIStore((state) => state.insertOpen);

  if (insertOpen) {
    return (
      <aside className="wfm-leftbar">
        <InsertMenu />
      </aside>
    );
  }

  return (
    <aside className="wfm-leftbar">
      <div className="wfm-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`wfm-tab ${leftTab === tab.id ? "is-active" : ""}`}
            onClick={() => setLeftTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="wfm-panel-body">
        {leftTab === "pages" ? <PagesPanel /> : null}
        {leftTab === "layers" ? <LayersPanel /> : null}
        {leftTab === "assets" ? <AssetsPanel /> : null}
      </div>
    </aside>
  );
}
