# Shortcuts

Source: <https://www.framer.com/shortcuts>, retrieved 2026-11-06. The live
editor wins when it disagrees. Windows cells on that page contain published-but-
suspect entries; WebFM uses the Mac binding and the ordinary Windows equivalent
unless the live editor shows otherwise.

## Implemented in the core slice

| Action | Mac | Windows |
| --- | --- | --- |
| Insert menu | `I` | `I` |
| Frame tool | `F` | `F` |
| Stack tool | `S` | `S` |
| Text tool | `T` | `T` |
| Rectangle | `R` | `R` |
| Oval | `O` | `O` |
| Image | `Shift+I` | `Shift+I` |
| Rows / Columns / Grid | `Shift+R` / `Shift+C` / `Shift+G` | same |
| Undo | `Cmd+Z` | `Ctrl+Z` |
| Redo | `Cmd+Shift+Z` | `Ctrl+Shift+Z` |
| Cut / Copy / Paste | `Cmd+X` / `Cmd+C` / `Cmd+V` | `Ctrl+…` |
| Copy style / Paste style | `Cmd+Alt+C` / `Cmd+Alt+V` | `Ctrl+Alt+…` |
| Duplicate | `Cmd+D` | `Ctrl+D` |
| Delete | `Backspace` | `Del` |
| Rename | `Cmd+R` | `Ctrl+R` |
| Auto-rename | `Alt+R` | `Alt+R` |
| Lock | `Cmd+L` | `Ctrl+L` |
| Hide | `Cmd+;` | `Ctrl+;` |
| Add Frame | `Cmd+Enter` | `Ctrl+Enter` |
| Add Stack | `Cmd+Alt+Enter` | `Ctrl+Alt+Enter` |
| Group / Ungroup | `Cmd+G` / `Cmd+Shift+G` | `Ctrl+G` / `Ctrl+Shift+G` |
| Wrap in frame / stack | `Shift+F` / `Shift+A` | same |
| Remove wrapper | `Cmd+Delete` | `Ctrl+Delete` |
| Remove wrapper | `Cmd+Backspace` | `Ctrl+Del` |
| Fit content | `Shift+A` (conflicts with Add stack in Framer’s live menu; Add stack wins) | same |
| Select all | `Cmd+A` | `Ctrl+A` |
| Select all siblings | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Select parent | `Escape` | `Escape` |
| Select all children | `Enter` | `Enter` |
| Back to page | `Alt+Escape` | `Alt+Escape` |
| Cycle selection | `Tab` / `Shift+Tab` | `Tab` / `Shift+Tab` |
| Show Style panel | `E` | `E` |
| Show Pages | `Alt+Shift+1` | `Alt+Shift+1` |
| Show Layers | `Alt+Shift+2` | `Alt+Shift+2` |
| Show Assets | `Alt+Shift+3` | `Alt+Shift+3` |
| Collapse layers | `Alt+L` | `Alt+L` |
| Show interface | `Cmd+.` | `Alt+.` (published; suspect) |
| Zoom in / out | `Cmd++` / `Cmd+-` | `Ctrl++` / `Ctrl+-` |
| Zoom to 100% | `Cmd+0` | `Ctrl+0` (published as Shift+0; suspect) |
| Zoom to fit | `Cmd+1` | `Ctrl+1` (published as Shift+1; suspect) |
| Zoom to selection | `Cmd+2` | `Ctrl+2` (published as Shift+2; suspect) |
| Show rulers | `Ctrl+R` | `Ctrl+Shift+R` |
| Show guides | `Ctrl+G` | `Alt+G` |
| Open preview | `Cmd+P` | `Ctrl+P` |
| Publish site | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Bring to front / send to back | `]` / `[` | `]` / `[` |
| Create component | `Cmd+Alt+K` | `Ctrl+Alt+K` |

## Later slices (component / CMS / views)

- Create component from code `Cmd+Shift+K`, version history `Shift+Cmd+H`,
  library `Cmd+/`, CMS and Localization view shortcuts, Agent shortcuts.
- View shortcuts: Canvas `Alt+1`, CMS `Alt+2`, Localization `Alt+3`,
  Analytics `Alt+4`, Settings `Alt+5`.

## Rules

- Never fire a shortcut while focus is in an input, textarea, select or
  contentEditable.
- `Escape` first leaves text editing, then selects the parent, then clears
  selection.
- Zoom shortcuts act on the canvas; `Cmd/Ctrl+0` resets to 100%.
- Destructive shortcuts only act on an unlocked selection.
- The shortcut registry is the single source of truth; the UI reads labels from
  it so tooltips cannot drift.
