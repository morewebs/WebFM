# WebFM architecture

This file is the source of truth for structure. Agents must not invent a second
architecture in their area. Decisions and their history live in
[`DECISIONS.md`](DECISIONS.md).

## Shape

WebFM is an open-source visual design editor modeled on Framer's editor. It runs
as a local web application today and is structured so project storage and auth
can move behind a cloud service later without changing the editor.

```
apps/editor        React UI: canvas, panels, menus, preview
apps/server        HTTP API: projects, assets, publishing
packages/model     Plain-JSON document, operations, history, resolution
packages/render    Shared React renderer and style resolution
packages/publish   PublishAdapter interface and static exporter
```

Dependency direction is one-way:

```
model  <-  render  <-  publish
  ^                      ^
  |                      |
editor ----------------> server
```

`model` has no React, DOM, server, or filesystem dependency. `render` depends on
`model` and React only. `publish` depends on `model` + `render`. `editor` and
`server` depend on the packages, never on each other's internals.

## Document model

A project is one JSON document (`packages/model/src/types.ts`):

- `Project` — schema version, revision, breakpoints, pages, components, assets,
  color styles, text styles, publish settings.
- `Page` — name, route path, background, root `FrameNode`.
- Nodes — `frame`, `text`, `image`, `componentInstance`, arranged in a tree.
- Every visual property that can differ by breakpoint is stored in
  `Responsive<T> = { base, overrides }`.
- Breakpoints are ordered widest to narrowest; the first is primary. Resolution
  cascades from base through each smaller breakpoint up to the active one. The
  primary breakpoint writes to `base`; smaller ones write overrides.
- Sizes use Framer's modes: `fixed`, `fill`, `hug`, `relative` (percentage).
- Layout uses `none` (absolute x/y), `stack` (flex direction/gap/padding/align),
  or `grid`.
- Components store definitions and variants; instances reference a variant and
  may override exposed property values.
- Color styles are named colors in `Project.colorStyles` and text styles are
  named typography in `Project.textStyles`. Solid fills carry an optional
  `styleId`; text props an optional `colorStyleId` and `textStyleId`. The
  resolved color/opacity and every typography value stay denormalized on each
  usage so the renderer and static publish never need a project lookup. Editing
  a style rewrites every linked usage; a color style wins for color only.

Operations mutate an Immer draft (`packages/model/src/operations.ts`). Undo/redo
uses Immer patches (`packages/model/src/history.ts`), so an operation never has
to know about history. The editor wraps operations in
`produceWithPatches(project, recipe)`.

The server owns the monotonic `version` used for optimistic concurrency. The
model treats it as data.

## Rendering and publishing

`packages/render` resolves node props for a breakpoint and renders the same tree
in two modes:

- **Editor mode** — inline styles, `data-node-id` attributes, no interactive
  behavior; the editor overlay draws selection on top.
- **Publish mode** — stable class names plus a generated stylesheet. Base rules
  come from the primary breakpoint; smaller breakpoints become `@media`
  blocks. This is what makes a published site responsive without JavaScript.

The static exporter (`packages/publish`) renders every page, copies referenced
assets, emits `index.html`/route folders, and returns a file map. A zip helper
turns that map into a download. `PublishAdapter` is the extension point;
`static` is the first implementation.

## Editor

- React 19 + Vite. Zustand for editor-only state; the project document is a
  separate store with a history controller.
- The canvas renders the real DOM through `@webfm/render`, scaled with a CSS
  transform. Selection, hover, resize handles, snapping and guides are an
  overlay layer positioned from measured DOM rects, not a second renderer.
- Stacks are real flexbox; frames with `layout: none` position children
  absolutely at `x`/`y`. Hug/fill sizing map to CSS so layout is computed by the
  browser, not reimplemented.
- Panel order and labels follow the verified Framer reference in
  [`FRAMER-REFERENCE.md`](FRAMER-REFERENCE.md). No guessed UI.
- Undo/redo: Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z, one entry per user gesture. Drag
  gestures update a preview and commit one operation on pointer-up.

## Server

Fastify, TypeScript, Node 20+. Endpoints:

```
GET    /api/health
GET    /api/projects
POST   /api/projects                 { name }
GET    /api/projects/:id
PUT    /api/projects/:id             { project, expectedVersion }
DELETE /api/projects/:id
POST   /api/projects/:id/assets      multipart file -> Asset
GET    /api/projects/:id/assets/:assetId
POST   /api/projects/:id/publish     { adapterId, options } -> files + zip URL
GET    /api/publish/:artifactId/:path
```

Storage is behind `ProjectStore` / `AssetStore` interfaces. The first
implementation is the filesystem (`WEBFM_DATA_DIR`, default `.webfm-data`):
one directory per project, `project.json`, `assets/`, atomic writes, an
in-process write queue per project. Cloud adapters (Postgres/object storage) are
deliberately not built tonight; the interfaces and JSON document are the seam.

Auth is a seam (`AuthProvider`). The current provider is a single local user.
The editor never stores passwords. A moreweb OAuth provider can be added later
without changing project or editor code.

## Non-goals for the core slice

- Accounts, teams, billing, multiplayer, comments.
- Cloud deployment. The repo is cloud-ready, not deployed.
- Code components, CMS, effects/shaders, AI features, Figma import.
- Hosting of published sites. Publishing produces artifacts only.

## Quality bar

- Unit tests for the model, renderer style resolution, publish output and server
  store must pass (`npm run check`).
- UI facts are verified against the live Framer editor and recorded in
  `docs/FRAMER-REFERENCE.md`; screenshots live in `.reference/`.
- Pixel fidelity uses extracted Framer assets and computed styles, with
  provenance in `docs/FRAMER-ASSETS.md`.
