/**
 * Undo/redo built on Immer patches.
 *
 * Operations never know about history: the editor calls `applyOperation`, which
 * runs the recipe through `produceWithPatches` and records the forward and
 * inverse patch sets. Consecutive operations that share a `coalesceKey` (a drag
 * gesture, a slider scrub) collapse into one history entry.
 */

import { applyPatches, type Draft, enablePatches, type Patch, produceWithPatches } from "immer";
import type { Project } from "./types";

enablePatches();

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  coalesceKey?: string;
}

export interface HistoryState {
  project: Project;
  past: HistoryEntry[];
  future: HistoryEntry[];
  limit: number;
}

export interface HistoryOptions {
  limit?: number;
}

export interface ApplyOperationOptions {
  coalesceKey?: string;
}

const DEFAULT_LIMIT = 100;

export function createHistory(project: Project, options: HistoryOptions = {}): HistoryState {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error(`History limit must be a non-negative number, received ${String(limit)}.`);
  }
  return { project, past: [], future: [], limit };
}

function trimPast(past: HistoryEntry[], limit: number): HistoryEntry[] {
  if (past.length <= limit) return past;
  return past.slice(past.length - limit);
}

export function applyOperation(
  history: HistoryState,
  label: string,
  recipe: (draft: Draft<Project>) => void,
  options: ApplyOperationOptions = {},
): HistoryState {
  const [project, patches, inversePatches] = produceWithPatches(history.project, recipe);
  const coalesceKey = options.coalesceKey;
  const last = history.past[history.past.length - 1];

  if (
    coalesceKey !== undefined &&
    history.future.length === 0 &&
    last !== undefined &&
    last.coalesceKey === coalesceKey
  ) {
    const merged: HistoryEntry = {
      label,
      patches: last.patches.concat(patches),
      inversePatches: inversePatches.concat(last.inversePatches),
      coalesceKey,
    };
    return {
      ...history,
      project,
      past: [...history.past.slice(0, -1), merged],
      future: [],
    };
  }

  const entry: HistoryEntry = { label, patches, inversePatches };
  if (coalesceKey !== undefined) entry.coalesceKey = coalesceKey;

  return {
    ...history,
    project,
    past: trimPast([...history.past, entry], history.limit),
    future: [],
  };
}

export function undo(history: HistoryState): HistoryState {
  const entry = history.past[history.past.length - 1];
  if (!entry) return history;

  return {
    ...history,
    project: applyPatches(history.project, entry.inversePatches),
    past: history.past.slice(0, -1),
    future: [...history.future, entry],
  };
}

export function redo(history: HistoryState): HistoryState {
  const entry = history.future[history.future.length - 1];
  if (!entry) return history;

  return {
    ...history,
    project: applyPatches(history.project, entry.patches),
    past: [...history.past, entry],
    future: history.future.slice(0, -1),
  };
}

export function canUndo(history: HistoryState): boolean {
  return history.past.length > 0;
}

export function canRedo(history: HistoryState): boolean {
  return history.future.length > 0;
}
