import { strToU8, zipSync } from "fflate";
import type { PublishFiles } from "./types";

/**
 * Turns a publish file map into a ZIP archive. Text files are encoded as
 * UTF-8; byte files are copied as-is.
 */
export function zipFiles(files: PublishFiles): Uint8Array {
  const entries: Record<string, Uint8Array> = {};

  for (const [path, content] of Object.entries(files)) {
    entries[path] = typeof content === "string" ? strToU8(content) : content;
  }

  return zipSync(entries);
}
