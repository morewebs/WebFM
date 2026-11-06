# Publishing

Publishing is an adapter boundary. WebFM builds sites; it does not host them.

## Contract

```ts
interface PublishAdapter<Config = unknown> {
  id: string;                 // stable id stored in project.publish.adapterId
  name: string;               // human label in the Publish dialog
  publish(input: PublishInput): Promise<PublishResult>;
}

interface PublishInput {
  project: Project;
  config: Config;
  /** Resolve an asset id to bytes and a public filename. */
  assets: AssetResolver;
  /** Optional directory for adapters that write to disk. */
  outDir?: string;
}

interface PublishResult {
  /** Relative path -> file contents. Text or bytes. */
  files: Record<string, string | Uint8Array>;
  /** Human-readable summary for the editor. */
  summary: string;
  /** Path of the entry point, usually "index.html". */
  entry: string;
}
```

Adapters are pure with respect to the project: they must not mutate it. They
receive everything through `PublishInput`. Network access is allowed only for
adapters that explicitly need it (a future GitHub Pages adapter, for example);
the static exporter has no network dependency.

## Static exporter

`static` is the first adapter and the reference implementation:

- Renders every page through `@webfm/render` in publish mode (class names plus a
  generated responsive stylesheet).
- Emits `index.html` for `/` and `<route>/index.html` for other page paths.
- Copies referenced assets under `assets/` with stable filenames.
- Produces a self-contained output: no runtime fetch, no framework required.
- Returns a zip of the file map for download.

Output shape:

```
index.html
about/index.html
assets/<hash>-<name>.<ext>
styles.css
```

## Adding an adapter

1. Implement `PublishAdapter` in `packages/publish/src/adapters/`.
2. Register it in the adapter registry.
3. Add unit tests that assert the produced file map and entry point.
4. Document its config in this file.

Hosting (DNS, CDN, deploy credentials) is out of scope. A future adapter may
push the produced files to a host, but that adapter owns its credentials and
must never commit them.
