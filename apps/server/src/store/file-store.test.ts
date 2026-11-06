import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileProjectStore, atomicWriteFile, sanitizeFilename } from "./file-store";
import {
  AssetTooLargeError,
  InvalidIdError,
  MAX_ASSET_BYTES,
  ProjectNotFoundError,
  VersionConflictError,
} from "./types";

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("FileProjectStore", () => {
  let dataDir: string;
  let store: FileProjectStore;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "webfm-store-"));
    store = new FileProjectStore(dataDir);
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("creates and reads a project", async () => {
    const created = await store.create({ name: "My Site" });

    expect(created.name).toBe("My Site");
    expect(created.version).toBe(1);
    expect(created.pages).toHaveLength(1);

    const loaded = await store.get(created.id);
    expect(loaded).toEqual(created);
  });

  it("lists summaries with page counts", async () => {
    const created = await store.create({ name: "Only" });
    const summaries = await store.list();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: created.id,
      name: "Only",
      version: 1,
      pageCount: 1,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
    expect(summaries[0]).not.toHaveProperty("pages");
  });

  it("saves atomically, increments version and preserves createdAt", async () => {
    const created = await store.create({ name: "First" });
    await delay(10);

    const saved = await store.save({ ...created, name: "Second" }, created.version);

    expect(saved.version).toBe(created.version + 1);
    expect(saved.name).toBe("Second");
    expect(saved.createdAt).toBe(created.createdAt);
    expect(saved.updatedAt).not.toBe(created.updatedAt);

    const loaded = await store.get(created.id);
    expect(loaded).toEqual(saved);

    const raw = await readFile(path.join(dataDir, "projects", created.id, "project.json"), "utf8");
    expect(JSON.parse(raw)).toEqual(saved);

    const leftovers = (await readdir(path.join(dataDir, "projects", created.id))).filter((entry) =>
      entry.includes(".tmp"),
    );
    expect(leftovers).toEqual([]);
  });

  it("serializes concurrent saves for one project", async () => {
    const created = await store.create({ name: "Concurrent" });

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.save({ ...created, name: `Save ${index}` }),
      ),
    );

    const loaded = await store.get(created.id);
    expect(loaded?.version).toBe(11);
  });

  it("rejects a stale expected version", async () => {
    const created = await store.create({ name: "Stale" });
    const saved = await store.save(created, created.version);

    await expect(store.save(saved, created.version)).rejects.toBeInstanceOf(VersionConflictError);
    await expect(store.save(saved, created.version)).rejects.toMatchObject({
      currentVersion: 2,
    });
  });

  it("rejects saves for a missing project", async () => {
    const created = await store.create({ name: "Gone" });
    await store.delete(created.id);

    await expect(store.save(created, created.version)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("orders the project list by newest update", async () => {
    const first = await store.create({ name: "First" });
    await delay(10);
    const second = await store.create({ name: "Second" });
    await delay(10);
    await store.save({ ...first, name: "First edited" }, first.version);

    const summaries = await store.list();
    expect(summaries.map((summary) => summary.id)).toEqual([first.id, second.id]);
  });

  it("rejects path traversal in ids", async () => {
    await expect(store.get("../escape")).rejects.toBeInstanceOf(InvalidIdError);
    await expect(store.create({ id: "../../escape" })).rejects.toBeInstanceOf(InvalidIdError);
    await expect(store.delete("..")).rejects.toBeInstanceOf(InvalidIdError);
    await expect(store.getAssetPath("../escape", "asset_x")).rejects.toBeInstanceOf(InvalidIdError);
    await expect(
      store.putAsset("..", { filename: "x.txt", mimeType: "text/plain", bytes: bytesOf("x") }),
    ).rejects.toBeInstanceOf(InvalidIdError);
  });

  it("deletes a project", async () => {
    const created = await store.create({ name: "Delete me" });

    expect(await store.delete(created.id)).toBe(true);
    expect(await store.get(created.id)).toBeNull();
    expect(await store.list()).toEqual([]);
    expect(await store.delete(created.id)).toBe(false);
  });

  it("stores and reads assets", async () => {
    const created = await store.create({ name: "Assets" });
    const content = bytesOf("image-bytes");

    const asset = await store.putAsset(created.id, {
      filename: "../My Photo?.PNG",
      mimeType: "image/png",
      bytes: content,
    });

    expect(asset.id).toMatch(/^asset_[0-9a-z]+$/);
    expect(asset.name).not.toContain("/");
    expect(asset.name).not.toContain("..");
    expect(asset.size).toBe(content.byteLength);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.url).toBe(`/api/projects/${created.id}/assets/${asset.id}`);

    const storedPath = await store.getAssetPath(created.id, asset.id);
    expect(storedPath).not.toBeNull();
    expect(storedPath).toContain(path.join("projects", created.id, "assets"));
    expect(path.basename(storedPath!)).toBe(`${asset.id}-${asset.name}`);

    const loaded = await store.getAsset(created.id, asset.id);
    expect(loaded).not.toBeNull();
    expect(Buffer.from(loaded!.bytes).toString()).toBe("image-bytes");
    expect(loaded?.mimeType).toBe("image/png");
    expect(loaded?.name).toBe(asset.name);

    expect(await store.getAsset(created.id, "asset_missing")).toBeNull();
    expect(await store.getAssetPath(created.id, "asset_missing")).toBeNull();
  });

  it("caps asset size at 25 MB", async () => {
    const created = await store.create({ name: "Big" });
    const oversized = new Uint8Array(MAX_ASSET_BYTES + 1);

    await expect(
      store.putAsset(created.id, {
        filename: "big.bin",
        mimeType: "application/octet-stream",
        bytes: oversized,
      }),
    ).rejects.toBeInstanceOf(AssetTooLargeError);
  });

  it("sanitizes uploaded filenames", () => {
    expect(sanitizeFilename("../photo one.png")).toBe("photo-one.png");
    expect(sanitizeFilename("..\\..\\evil.txt")).toBe("evil.txt");
    expect(sanitizeFilename("....")).toBe("file");
    expect(sanitizeFilename("")).toBe("file");
  });
});

describe("atomicWriteFile", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "webfm-atomic-"));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("round-trips content and replaces the target", async () => {
    const target = path.join(dataDir, "nested", "file.txt");

    await atomicWriteFile(target, "first");
    expect(await readFile(target, "utf8")).toBe("first");

    await atomicWriteFile(target, "second");
    expect(await readFile(target, "utf8")).toBe("second");

    const entries = await readdir(path.dirname(target));
    expect(entries).toEqual(["file.txt"]);
  });

  it("leaves no temp file behind when the write fails", async () => {
    const target = path.join(dataDir, "file.txt");
    await writeFile(target, "original");

    await expect(atomicWriteFile(target, { bad: true } as unknown as Uint8Array)).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("original");
    expect(await readdir(dataDir)).toEqual(["file.txt"]);
  });
});
