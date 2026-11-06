import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const random = customAlphabet(alphabet, 12);

/** Generates a compact, URL-safe id with an optional type prefix. */
export function createId(prefix?: string): string {
  const id = random();
  return prefix ? `${prefix}_${id}` : id;
}
