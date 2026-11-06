# Framer editor reference

Verified against the live editor on 2026-11-06 (Webb's Workspace, Free plan,
Framer 3.0 shell). Sources: live screenshots in `.scratch/framer-recon/screens/`
(primary: `06-editor-initial-new-project.png`, `63-frame-properties.png`,
`65-stack-inserted.png`, `44-insert-icons.png`, `19-hover-tool.png`) and the
official shortcuts/docs cross-check. Measurements below are from a 1920x897
screenshot at 100% zoom. Anything unverified is marked.

## Five views

Canvas (`Alt+1`), CMS (`Alt+2`), Localization (`Alt+3`), Analytics (`Alt+4`),
Settings (`Alt+5`). The view switcher is the "Canvas" dropdown at the top-left.
Core WebFM implements Canvas only; the other entries exist but are disabled.

## Top bar

- Height **50px**, background **#111111**, bottom border **1px #212121**.
- Left to right: a single **94x30 view-switch pill** (#1f1f1f, radius 8,
  13px/450) containing the Framer mark, **Canvas**, and a chevron; then tool
  buttons in this order: **Insert (+)**, **layout tools** (dashed-frame glyph
  with dropdown), **Oval** (circle), **Text (T)**, **Vector** (triangle).
  Tool buttons are 30x30, radius 8, 14px glyphs, inactive **#999**, active
  **#eee** on #1f1f1f.
- Center: project name (13px medium, white) and a **branch pill** (branch icon +
  `main`, 12px, #999).
- Right: workspace initials **WS** (12px), **Play/Preview** triangle icon,
  **Invite** button (30px high, #1f1f1f, white 13px), **Publish** button (30px
  high, **#0099ff**, white 13px semibold). Publish is the only blue action.
- Layout-tools flyout (hover): **Frame F**, **Stack S**, **Grid Shift+G**,
  **Masonry Shift+M**, separator, **Image Shift+I**, **Video Shift+V**.

## Left sidebar

- Width **259px** content + **1px #212121** right border. Background #111111.
- Tab row: **Pages**, **Layers**, **Assets**, 13px. Active tab is a 30px-high
  rounded pill (#1f1f1f) with white text; inactive text #999. Row area 50px high
  with a bottom border.
- Layers tab content: breadcrumb row with a home icon + **Home** dropdown in a
  30px #1f1f1f rounded control (x=8..248); gap; **Search…** field (30px,
  #1f1f1f, radius 4, search glyph, placeholder #666); gap; layer tree.
- Selected layer row: **#0099ff**, 30px high, 4px radius, x=8..248, white 13px
  text, node glyph at left. A **Primary** badge (10px, translucent white pill)
  sits at the right of the breakpoint root layer.
- Pages tab content (from the same shell): a **Design** section with +, a
  **Pages** section with +, and page rows with a page glyph; **Home** selected.
- Assets tab: folder-based since 2026-10-26; **Styles**, **Templates**, and
  component update states.

## Right sidebar

- Width **259px** content + **1px #212121** left border. Background #111111.
- Tab row: **Agent**, **Style**. Active tab is a 30px pill (#1f1f1f) with white
  text; inactive #999. The core build opens Style when a layer is selected; the
  Agent tab is visible but not implemented.
- Alignment toolbar: 48px row, 10 icon buttons (align left, center horizontally,
  align right, distribute horizontally, align top, center vertically, align
  bottom, distribute vertically, and two more), 16px glyphs, #999; separator
  before the last group. Bottom border.
- Sections are 47px rows with a 12px medium white label and a **+** (#999) at
  the right; 1px #212121 borders between. Verified section order for a frame:
  **Template**, **Breakpoint**, **Layout**, **Typography**, **Overlays**,
  **Cursor**, **Effects**, **Styles**, **Code overrides**. A Text node inserts a
  text/typography group; an Image node inserts image controls. The panel is
  add-property based: the **+** adds a property row (Fill, Border, Radius,
  Shadow, Clipping, Opacity, User Select, …), not a fixed inspector.
- **Breakpoint** section rows (verified): label **Position** with two 30px
  number inputs X/Y; **Width** input + sizing dropdown (**Fixed**); a link icon
  between the width and height rows; **Height** input + sizing dropdown.
  Inputs: 30px high, #1f1f1f, radius 4, 12px text, ~40px for X/Y, ~86px for
  values, ~77px for dropdowns.
- **Typography** section: **Base** label, a 16 PX field and a −/+ stepper.
- **Styles** section: **Fill** row with an 18px white swatch, `FFFFFF`, and an
  × remove; **Overflow** row with a dropdown showing **Clip** (default).
- Sizing mode labels (official): **Fixed**, **Relative**, **Fill**,
  **Fit Content**, **Viewport**. WebFM's internal `hug` maps to the visible
  label **Fit Content**; do not show "Hug".
- Overflow values: **Clip** (default for new layers), **Hidden**, plus
  Overflow X / Overflow Y. WebFM's internal default is `clip`.

## Canvas

- Canvas background **#171717**. Page is white (#ffffff), **1200x1000** at the
  primary breakpoint, centered horizontally in the 1400px canvas area at 100%
  zoom (x=360..1559 in the screenshot). Small blue selection outline and 8px
  corner handles when selected.
- Breakpoint bar above the page: 30px high, full page width, radius 8. Two
  verified states:
  - **Neutral (nothing selected):** background **#212121**, a 30x30 glyph square
    **#2a2a2a** with a gray play outline, name **#999**, width **#777**.
  - **Selected (page root selected):** background **#161f26**, glyph square
    **#0099ff** with a white play outline, name and width **#0099ff**.
  The + at the right is accent blue; the bar has a 10px gap above the page.
- 10px gap between the breakpoint bar and the page.
- The page root layer is named **Desktop** and carries the **Primary** badge in
  the Layers panel. New pages are 1200x1000 Fixed, white, Overflow Clip.
- Bottom floating toolbar: centered pill, ~44px high, radius 22, background
  near-black with a subtle border/shadow. Buttons: **select** (active, lighter
  circular background), **hand**, **comment**, **theme toggle (moon)**;
  separator; **100%** zoom dropdown; **Upgrade now** blue pill (#0099ff).
- Zoom menu values (official): Zoom In, Zoom Out, Zoom to 100%, Zoom to Fit,
  Zoom to Selection, Fast Zoom, Nudge Amount.

## Insert menu

- The **+** opens a left-panel replacement with a search field and two groups:
  **Elements**, **CMS**.
- Elements categories (verified): **Icons** (open), **Shaders**, **Media**,
  **Forms**, **Interactive**, **Social**, **Utility**, **Creative**.
- CMS: **Collections**, **Fields**.
- Selecting **Icons** opens a second column of icon libraries: Iconic, Phosphor,
  Hero, Feather, Meteor, Material, Basicons, Flowbite, Nonicons, Sargam, Lucide,
  Mage (2-column card grid, ~100px cards, 16px glyphs, 12px labels).
- Frame/Stack/Grid/Masonry/Image/Video are in the layout-tools flyout, not the
  Insert menu.

## Main menu

The Framer logo opens a two-level menu (width ~200px, background #1f1f1f,
radius 6, 13px items):
1. Search (`Type to search…`), **Canvas Alt+1**, **CMS Alt+2**,
   **Localization Alt+3**, **Analytics Alt+4**, **Settings Alt+5**.
2. **Go to dashboard**, **Quick actions Ctrl+K**.
3. **File ›**, **Edit ›**, **View ›**, **Tool ›**, **Layout ›**, **Text ›**,
   **Vector ›**.
4. **Component ›**, **Plugins ›**, **Code ›**, **Preferences ›**.
5. **Help ›**.
The **Tool** submenu (screenshot title "Insert") contains **Agent select
Ctrl+Alt+A**, **Layout ›**, **Text T**, **Link L**, **Scale K**, **Vector ›**,
separator, **Zoom Z**, **Comment C**, **Cursor chat /**, **Sample color**,
separator, **Library Ctrl+/**.

## Shortcuts

See [`SHORTCUTS.md`](SHORTCUTS.md). The live editor and `/shortcuts` are the
source; Windows entries on that page have known transcription errors.

## Computed tokens (verified)

Extracted with `getComputedStyle` from the live editor on 2026-11-06.

- **UI font:** `Inter Variable UI` (fallbacks Inter, system-ui), 12px body,
  weights **450** regular and **550** medium. The view switch is 13px/450.
- **Top bar:** 51px including its 1px border; #111111; 10px horizontal padding;
  right-side gaps 10px. Branch pill 45x18, radius 5,
  `rgba(255,255,255,0.05)`, 10px/450. Invite/Publish 30px high, radius 8,
  0 10px padding, 12px/450; Publish #0099ff. Workspace initials 30x30, accent
  blue, transparent background. Preview glyph 14x14.
- **Sidebars:** **260px** including the 1px border; #111111. Tab row 50px;
  tab pills 30px high, radius 8, 0 10px padding, 12px/450; active #1f1f1f with
  white text, inactive #999. Search/control fields 30px high, radius 8,
  `rgba(255,255,255,0.06)`. Layer rows 30px high, radius 8.
- **Right panel:** alignment bar 48px; section rows 47px; section labels
  12px/450, 5px left padding; + glyph 12px; number/value fields 30px high,
  radius 8, 12px/450.
- **Canvas:** #171717. Breakpoint bar 30px high, radius 8, #161f26; name
  12px/550 #999, width in dimmed accent; add + is a 12px glyph. Page root is
  1200x1000 Fixed, white, Overflow Clip. Page starts 10px below the bar.
- **Bottom toolbar:** fixed 10px from the bottom, 50px high, radius 18,
  #111111, 10px padding; 30px tool buttons with 20px glyphs; zoom button 70x30
  radius 8 #1f1f1f; trailing CTA 30px high, radius 8, accent text on a 6% accent
  tint (not a solid blue pill).
- **Insert panel:** nav rail 256px, detail column 154px overlaying the canvas,
  category rows 40px high, category glyphs 12x12, section titles 12px/550 #999.

## Still unverified / next pass

- Breakpoint bar neutral color and hover states.
- Alignment toolbar icon order after the first eight and its enabled actions.
- Properties panel for Text and Image nodes beyond the controls WebFM built.
- Component, interaction, preview and publish dialogs beyond the labels above.
- Layer tree context menu, drag indicators and nested-row anatomy.
- Icon-library logos and the Oval tool glyph (not present as SVGs in the
  captured DOM).
