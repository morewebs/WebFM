import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PublishFiles } from "@webfm/publish";

export const ZIP_FILE_NAME = "publish.zip";

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Normalizes a path emitted by a publish adapter into a safe relative path.
 * Rejects absolute paths, parent segments and Windows drive letters.
 */
export function normalizeArtifactPath(relative: string): string {
  const normalized = relative.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Unsafe publish path: ${JSON.stringify(relative)}`);
  }
  const segments = normalized.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.length === 0) throw new Error(`Empty publish path: ${JSON.stringify(relative)}`);
  for (const segment of segments) {
    if (segment === "..") throw new Error(`Unsafe publish path: ${JSON.stringify(relative)}`);
  }
  return segments.join("/");
}

function contentToBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? new TextEncoder().encode(content) : content;
}

/** Writes every artifact file below outDir and returns the sorted paths. */
export async function writeArtifactFiles(outDir: string, files: PublishFiles): Promise<string[]> {
  const written: string[] = [];
  for (const [rawPath, content] of Object.entries(files)) {
    const relative = normalizeArtifactPath(rawPath);
    const destination = path.join(outDir, ...relative.split("/"));
    if (!isInside(outDir, destination)) {
      throw new Error(`Unsafe publish path: ${JSON.stringify(rawPath)}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contentToBytes(content));
    written.push(relative);
  }
  return written.sort();
}

/* ---------------------------------------------------------------------- zip */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Minimal uncompressed ZIP writer used when @webfm/publish cannot supply one. */
export function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    localChunks.push(local, entry.data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralChunks.push(central);

    offset += local.length + entry.data.length;
  }

  const centralSize = centralChunks.reduce((total, chunk) => total + chunk.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const all = [...localChunks, ...centralChunks, end];
  const total = all.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of all) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

/** Builds a zip for the file map, preferring @webfm/publish's helper. */
export async function buildZip(files: PublishFiles): Promise<Uint8Array> {
  try {
    const publish = await import("@webfm/publish");
    const zip = await Promise.resolve(publish.zipFiles(files));
    if (zip instanceof Uint8Array && zip.byteLength > 0) return zip;
  } catch {
    // The publish package is a stub at first; fall through to our writer.
  }
  const entries: ZipEntry[] = Object.entries(files).map(([name, content]) => ({
    name: normalizeArtifactPath(name),
    data: contentToBytes(content),
  }));
  return createStoredZip(entries);
}

/** Writes publish.zip next to the artifact files and returns its path. */
export async function writeArtifactZip(outDir: string, files: PublishFiles): Promise<string> {
  const zipPath = path.join(outDir, ZIP_FILE_NAME);
  await mkdir(outDir, { recursive: true });
  await writeFile(zipPath, await buildZip(files));
  return zipPath;
}

/** Reads every stored artifact file except the zip itself. */
export async function readStoredFiles(outDir: string): Promise<PublishFiles> {
  const files: PublishFiles = {};

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name !== ZIP_FILE_NAME) {
        const relative = path.relative(outDir, fullPath).split(path.sep).join("/");
        files[relative] = await readFile(fullPath);
      }
    }
  }

  await walk(outDir);
  return files;
}
