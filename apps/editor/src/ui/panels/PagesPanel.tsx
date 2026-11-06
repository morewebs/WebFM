/**
 * Pages tab.
 *
 * The Framer pages list: a search field, a Design section whose + is out of
 * scope in this build, and the Pages section that switches the active page or
 * adds one. Page rows rename inline; there is no page-delete UI because the
 * document store exposes no page-delete action.
 */

import { addPage, type PageId, updatePage } from "@webfm/model";
import { useCallback, useRef, useState } from "react";
import { useProjectStore } from "../../state/project-store";
import { Icon } from "../icons";
import "./PagesPanel.css";

interface EditingName {
  id: PageId;
  value: string;
}

export function PagesPanel() {
  const project = useProjectStore((state) => state.project);
  const activePageId = useProjectStore((state) => state.activePageId);
  const setActivePage = useProjectStore((state) => state.setActivePage);
  const applyRecipe = useProjectStore((state) => state.applyRecipe);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditingName | null>(null);
  const cancelRenameRef = useRef<PageId | null>(null);

  // Stable ref callback: focus and select the text the moment rename mounts.
  const focusRename = useCallback((element: HTMLInputElement | null) => {
    if (!element) return;
    element.focus();
    element.select();
  }, []);

  const pages = project?.pages ?? [];
  const needle = query.trim().toLowerCase();
  const visiblePages =
    needle.length === 0 ? pages : pages.filter((page) => page.name.toLowerCase().includes(needle));

  const startRename = (pageId: PageId, name: string): void => {
    cancelRenameRef.current = null;
    setEditing({ id: pageId, value: name });
  };

  const commitRename = (pageId: PageId, rawValue: string): void => {
    if (cancelRenameRef.current === pageId) {
      cancelRenameRef.current = null;
      setEditing((current) => (current?.id === pageId ? null : current));
      return;
    }
    const name = rawValue.trim();
    if (name.length > 0) {
      const target = useProjectStore.getState().project?.pages.find((page) => page.id === pageId);
      if (target && target.name !== name) {
        applyRecipe("Rename page", (draft) => {
          updatePage(draft, { pageId, name });
        });
      }
    }
    setEditing((current) => (current?.id === pageId ? null : current));
  };

  const cancelRename = (pageId: PageId): void => {
    cancelRenameRef.current = pageId;
    setEditing((current) => (current?.id === pageId ? null : current));
  };

  const addNewPage = (): void => {
    const created: { id: PageId | null } = { id: null };
    applyRecipe("Add page", (draft) => {
      created.id = addPage(draft);
    });
    if (created.id) setActivePage(created.id);
  };

  return (
    <div className="wfm-panel-control">
      <div className="wfm-search">
        <Icon name="search" size={14} />
        <input
          type="text"
          value={query}
          placeholder="Search..."
          aria-label="Search pages"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="wfm-pages__divider" />

      <section className="wfm-pages__section" aria-label="Design pages">
        <div className="wfm-panel-section__header">
          <span>Design</span>
          <button
            type="button"
            className="wfm-panel-add wfm-pages__add"
            title="Design Pages is not in this build"
            disabled
          >
            <Icon name="plus" size={14} />
          </button>
        </div>
      </section>

      <div className="wfm-pages__divider" />

      <section className="wfm-pages__section" aria-label="Pages">
        <div className="wfm-panel-section__header">
          <span>Pages</span>
          <button
            type="button"
            className="wfm-panel-add wfm-pages__add"
            title="Add page"
            onClick={addNewPage}
          >
            <Icon name="plus" size={14} />
          </button>
        </div>

        <div className="wfm-page-rows" role="listbox" aria-label="Pages">
          {visiblePages.map((page) => {
            const isActive = page.id === activePageId;
            const isEditing = editing?.id === page.id;
            return (
              <div
                key={page.id}
                role="option"
                aria-selected={isActive}
                tabIndex={0}
                className={`wfm-list-row wfm-page-row${isActive ? " is-active" : ""}`}
                onClick={() => setActivePage(page.id)}
                onDoubleClick={() => startRename(page.id, page.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActivePage(page.id);
                  }
                }}
              >
                <span className="wfm-page-row__lead" />
                <Icon name="page" size={16} className="wfm-page-row__glyph" />
                {isEditing ? (
                  <input
                    className="wfm-page-row__rename"
                    value={editing.value}
                    ref={focusRename}
                    aria-label="Page name"
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onChange={(event) => setEditing({ id: page.id, value: event.target.value })}
                    onBlur={() => commitRename(page.id, editing.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.stopPropagation();
                        commitRename(page.id, editing.value);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        cancelRename(page.id);
                      }
                    }}
                  />
                ) : (
                  <span className="wfm-list-row__name">{page.name}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
