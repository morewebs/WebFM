import { createImage } from "@webfm/model";
import { type ChangeEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { useProjectStore } from "../../state/project-store";
import { Icon, type IconName } from "../icons";
import { useUIStore } from "../ui-store";
import "./InsertMenu.css";

type CategoryId =
  | "icons"
  | "shaders"
  | "media"
  | "forms"
  | "interactive"
  | "social"
  | "utility"
  | "creative"
  | "collections"
  | "fields";

interface CategoryRow {
  id: CategoryId;
  label: string;
  icon: IconName;
}

const ELEMENT_ROWS: CategoryRow[] = [
  { id: "icons", label: "Icons", icon: "insert-icons" },
  { id: "shaders", label: "Shaders", icon: "insert-shaders" },
  { id: "media", label: "Media", icon: "insert-media" },
  { id: "forms", label: "Forms", icon: "insert-forms" },
  { id: "interactive", label: "Interactive", icon: "insert-interactive" },
  { id: "social", label: "Social", icon: "insert-social" },
  { id: "utility", label: "Utility", icon: "insert-utility" },
  { id: "creative", label: "Creative", icon: "insert-creative" },
];

const CMS_ROWS: CategoryRow[] = [
  { id: "collections", label: "Collections", icon: "insert-collections" },
  { id: "fields", label: "Fields", icon: "insert-fields" },
];

const ICON_LIBRARIES: ReadonlyArray<{ name: string; icon: IconName }> = [
  { name: "Iconic", icon: "component" },
  { name: "Phosphor", icon: "vector" },
  { name: "Hero", icon: "oval" },
  { name: "Feather", icon: "text" },
  { name: "Meteor", icon: "moon" },
  { name: "Material", icon: "grid" },
  { name: "Basicons", icon: "frame" },
  { name: "Flowbite", icon: "stack" },
  { name: "Nonicons", icon: "image" },
  { name: "Sargam", icon: "check" },
  { name: "Lucide", icon: "more" },
  { name: "Mage", icon: "component" },
];

// Verified against screenshot .scratch/framer-recon/screens/43-insert-media-submenu.png.
const MEDIA_ITEMS = [
  "Image",
  "Video",
  "YouTube",
  "MP3",
  "GIF",
  "Vimeo",
  "Dot Lottie",
  "Spotify",
  "Apple Music",
  "SoundCloud",
  "Podcasts",
  "Simplecast",
] as const;

const OTHER_NOTES: Record<
  Exclude<CategoryId, "icons" | "media">,
  { label: string; note: string }
> = {
  shaders: { label: "Shaders", note: "Shaders are not in this build." },
  forms: { label: "Forms", note: "Forms are not in this build." },
  interactive: {
    label: "Interactive",
    note: "Interactive components are not in this build.",
  },
  social: { label: "Social", note: "Social embeds are not in this build." },
  utility: { label: "Utility", note: "Utility components are not in this build." },
  creative: { label: "Creative", note: "Creative effects are not in this build." },
  collections: { label: "Collections", note: "CMS collections are not in this build." },
  fields: { label: "Fields", note: "CMS fields are not in this build." },
};

/**
 * The Insert panel: replaces the left sidebar content. Elements and CMS on the
 * left, the selected category's detail on the right. Structure follows
 * screenshot .scratch/framer-recon/screens/44-insert-icons.png.
 */
export function InsertMenu(): ReactElement {
  const setInsertOpen = useUIStore((state) => state.setInsertOpen);
  const project = useProjectStore((state) => state.project);
  const uploadAsset = useProjectStore((state) => state.uploadAsset);
  const insertNode = useProjectStore((state) => state.insertNode);
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CategoryId>("icons");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const state = useUIStore.getState();
      // A floating menu or modal above the panel owns Escape while it is open.
      if (state.mainMenuOpen || state.layoutMenuOpen || state.projectMenuOpen) return;
      if (state.publishOpen || state.previewOpen) return;
      event.stopPropagation();
      setInsertOpen(false);
    };
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [setInsertOpen]);

  const uploadFile = async (file: File): Promise<void> => {
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadAsset(file);
      if (!asset) {
        setError(useProjectStore.getState().error ?? "Upload failed.");
        return;
      }
      const naturalWidth = asset.width ?? 0;
      const naturalHeight = asset.height ?? 0;
      const width = naturalWidth > 0 ? Math.min(naturalWidth, 400) : 400;
      const height =
        naturalWidth > 0 && naturalHeight > 0
          ? Math.max(1, Math.round((naturalHeight / naturalWidth) * width))
          : 300;
      insertNode(
        createImage({
          name: asset.name,
          props: {
            size: {
              width: { mode: "fixed", value: width },
              height: { mode: "fixed", value: height },
            },
            image: { assetId: asset.id, src: asset.url, alt: asset.name },
          },
        }),
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void uploadFile(file);
  };

  const normalized = query.trim().toLowerCase();
  const filterRows = (rows: CategoryRow[]): CategoryRow[] =>
    normalized ? rows.filter((row) => row.label.toLowerCase().includes(normalized)) : rows;
  const elementRows = filterRows(ELEMENT_ROWS);
  const cmsRows = filterRows(CMS_ROWS);

  const renderRow = (row: CategoryRow): ReactElement => (
    <button
      key={row.id}
      type="button"
      className={`wfm-list-row wfm-insert__row${selected === row.id ? " is-active" : ""}`}
      onClick={() => setSelected(row.id)}
      aria-pressed={selected === row.id}
    >
      <Icon name={row.icon} size={12} />
      <span className="wfm-list-row__name">{row.label}</span>
      <Icon name="chevron-right" size={12} className="wfm-insert__chevron" />
    </button>
  );

  const renderDetail = (): ReactElement => {
    if (selected === "icons") {
      return (
        <div className="wfm-insert__grid">
          {ICON_LIBRARIES.map((library) => (
            <button
              key={library.name}
              type="button"
              className="wfm-insert-card wfm-insert-card--library is-disabled"
              disabled
              title="Icon libraries are not in this build"
            >
              <Icon name={library.icon} size={16} />
              <span className="wfm-insert-card__label">{library.name}</span>
            </button>
          ))}
        </div>
      );
    }

    if (selected === "media") {
      const imageDisabled = uploading || !project;
      return (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={handleFile}
            tabIndex={-1}
          />
          <div className="wfm-insert__grid">
            <button
              type="button"
              className="wfm-insert-card wfm-insert-card--media"
              disabled={imageDisabled}
              title={!project ? "Open a project first" : undefined}
              onClick={() => fileRef.current?.click()}
              aria-busy={uploading}
            >
              <span className="wfm-insert-card__label">{uploading ? "Uploading…" : "Image"}</span>
            </button>
            {MEDIA_ITEMS.filter((name) => name !== "Image").map((name) => (
              <button
                key={name}
                type="button"
                className="wfm-insert-card wfm-insert-card--media is-disabled"
                disabled
                title={`${name} is not in this build`}
              >
                <span className="wfm-insert-card__label">{name}</span>
              </button>
            ))}
          </div>
          {error ? (
            <p className="wfm-insert__error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="wfm-insert__note">Video and embeds are not in this build.</p>
        </>
      );
    }

    const other = OTHER_NOTES[selected];
    return (
      <div className="wfm-insert__list">
        <button type="button" className="wfm-menu__item is-disabled" disabled title={other.note}>
          <span className="wfm-menu__label">{other.label}</span>
        </button>
        <p className="wfm-insert__note">{other.note}</p>
      </div>
    );
  };

  return (
    <div className="wfm-insert">
      <div className="wfm-insert__nav">
        <label className="wfm-search wfm-insert__search">
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search…"
            aria-label="Search insert items"
            spellCheck={false}
          />
        </label>

        <div className="wfm-insert__title">Elements</div>
        {elementRows.map(renderRow)}

        <div className="wfm-insert__title">CMS</div>
        {cmsRows.map(renderRow)}
      </div>

      <div className="wfm-insert__detail">{renderDetail()}</div>
    </div>
  );
}
