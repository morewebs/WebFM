import { staticAdapter } from "./adapters/static";
import type { PublishAdapter, PublishAdapterInfo, PublishRequest, PublishResult } from "./types";

const adapters = new Map<string, PublishAdapter>();

/** Adapters available to the editor's Publish dialog. */
export function listAdapters(): PublishAdapterInfo[] {
  return [...adapters.values()].map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
  }));
}

export function getAdapter(id: string): PublishAdapter | undefined {
  return adapters.get(id);
}

/** Registers or replaces an adapter by id. */
export function registerAdapter(adapter: PublishAdapter): void {
  if (!adapter || typeof adapter.id !== "string" || adapter.id.trim() === "") {
    throw new Error("Cannot register a publish adapter without an id.");
  }
  adapters.set(adapter.id, adapter);
}

/** Runs one publish request through the registered adapter. */
export async function publishWithAdapter(request: PublishRequest): Promise<PublishResult> {
  const adapter = getAdapter(request.adapterId);
  if (!adapter) {
    const available =
      listAdapters()
        .map((entry) => entry.id)
        .join(", ") || "none";
    throw new Error(
      `Unknown publish adapter "${request.adapterId}". Available adapters: ${available}.`,
    );
  }

  return adapter.publish({
    project: request.project,
    config: request.config ?? {},
    assets: request.assets,
    outDir: request.outDir,
  });
}

registerAdapter(staticAdapter);
