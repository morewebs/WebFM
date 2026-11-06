# Decisions

Append-only. Every decision gets an id, a date, a status, and the reason. Never
rewrite history; supersede with a new entry.

| Id | Date | Status | Decision | Why |
| --- | --- | --- | --- | --- |
| D1 | 2026-11-06 | accepted | Framer's editor is the specification: information architecture, panel placement, terminology, shortcuts and behavior. | The user's bar is that a Framer user finds everything where they expect it. |
| D2 | 2026-11-06 | accepted | Tonight's success bar is a verified core editor: pages, canvas, Frame/Stack/Text/Image, insert, layers, properties, breakpoints, undo/redo, preview, save, static publish. | "Prefer verified and working over broad and half-done." |
| D3 | 2026-11-06 | accepted | After the core, build components → interactions → code components → CMS. Effects/shaders are out. | Agreed priority order. |
| D4 | 2026-11-06 | accepted | Build open source tonight; cloud deployment is discussed later. Architecture stays cloud-ready. | User: "build it open source tonight, we'll discuss this later." |
| D5 | 2026-11-06 | accepted | Single-user editing with autosave now; real-time collaboration later. | Agreed; multiplayer would displace core polish. |
| D6 | 2026-11-06 | accepted | Pixel-for-pixel dark Framer editor, using extracted Framer UI assets rather than redrawn approximations. | User explicitly chose the replica and corrected: "extract assets, don't recreate." |
| D7 | 2026-11-06 | accepted | Publishing is an adapter boundary; ship a static exporter (HTML/CSS/JS/assets + zip). Hosting is not built. | User's scope and "make publishing pluggable." |
| D8 | 2026-11-06 | accepted | Repository: public `morewebs/WebFM`, AGPL-3.0, local checkout `Projects/WebFM`. | User's answers. |
| D9 | 2026-11-06 | accepted | Merge gate is typecheck + unit tests + build (`npm run check`). No Playwright suite; the lead verifies UI in the browser. | User chose unit tests only. |
| D10 | 2026-11-06 | accepted | Monorepo: `packages/model`, `packages/render`, `packages/publish`, `apps/editor`, `apps/server`; one-way dependencies. | Keeps the document, renderer and publisher independent of editor internals. |
| D11 | 2026-11-06 | accepted | Storage starts as a filesystem project store behind `ProjectStore`/`AssetStore` interfaces. Cloud adapters are deferred. | Works locally tonight, leaves a clean seam for moreweb cloud storage. |
| D12 | 2026-11-06 | accepted | Auth is an `AuthProvider` seam with one local user; no passwords stored in WebFM. moreweb OAuth can be added later. | Cloud/auth were deferred; do not block the editor. |
| D13 | 2026-11-06 | accepted | Project format is plain JSON with `schemaVersion`, and responsive values cascade from primary through smaller breakpoints. | Durable, diffable, publishable; matches Framer's responsive model. |
| D14 | 2026-11-06 | accepted | DOM/CSS renderer shared by editor and publisher: inline styles in the editor, generated classes + media queries when publishing. | One renderer prevents editor/published drift; browser computes layout. |
| D15 | 2026-11-06 | accepted | Undo/redo uses Immer patches around pure operations. | Deterministic, gesture-level history without bespoke each-operation inverses. |
| D16 | 2026-11-06 | accepted | `main` stays green; work on branches; no force-pushes or deletions. | The user's standing constraint. |
| D17 | 2026-11-06 | accepted-with-risk | Extracted Framer UI assets may be used for the pixel replica and are stored with provenance. They remain Framer's property; redistribution risk is recorded. | User instruction; replace before any public distribution that requires it. |
| D18 | 2026-11-06 | accepted | Framer screenshots/raw reference stay in gitignored `.reference/`; distilled, verified notes are committed. | Keeps the public repo lean and avoids dumping proprietary screens. |
| D19 | 2026-11-06 | accepted | Components slice: create from a layer, instances, component edit mode, and variants. Property-control UI (Variables) is the next sub-slice; the model and renderer accept bindings now. | Ships a complete, verifiable component core instead of a half-built Variables panel. |
| D20 | 2026-11-06 | accepted | Property controls built: expose text content, text color, font size, alt text, visible and opacity; instance controls with reset; component-wide defaults; default-variant action. | Completes the component essentials. Per-variant defaults and instance style overrides are follow-ups. |
| D21 | 2026-11-06 | accepted | Custom breakpoints can be added and non-primary ones removed. New widths must be narrower than the primary breakpoint; page roots receive a width override and dead overrides are cleaned up. | Keeps the primary/base cascade intact and closes the visibly disabled + in the breakpoint bar. |
| D22 | 2026-11-07 | accepted | Interactions slice: Appear/Hover/Tap with Fade/Slide/Scale, duration, delay and ease/linear/ease-in/ease-out; CSS keyframes/transitions in Preview and publish; first effect per trigger is emitted. | Ships a working, verifiable effects core. Scroll/drag/loop and multiple effects per trigger are later. |
| D23 | 2026-11-07 | accepted | Alignment: 8 align/distribute actions on free-layout siblings, measured from the live canvas, one history entry per action, buttons and Alt shortcuts. Text layers auto-rename from content when not manually named. | Closes the visibly disabled alignment bar and matches Framer text-layer naming. Stack/grid alignment and the extra alignment menu remain layout-owned/out of scope. |
