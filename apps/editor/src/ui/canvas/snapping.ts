/**
 * Smart-guide snapping math.
 *
 * All coordinates are page pixels. `computeSnap` looks at the rect's left,
 * center and right edges on x, and top, middle and bottom edges on y, and
 * returns the smallest movement that aligns one of those moving edges to a
 * target. Axes are independent, so a rect can snap horizontally and vertically
 * at the same time.
 */

export type SnapAxis = "x" | "y";

export interface SnapTarget {
  axis: SnapAxis;
  position: number;
  /** Optional origin ("parent", "sibling", "guide", …) used for debugging. */
  source?: string;
}

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapLine {
  axis: SnapAxis;
  position: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  lines: SnapLine[];
}

/** Per-axis switches; both axes are enabled by default. */
export interface SnapOptions {
  x?: boolean;
  y?: boolean;
}

/** Which edges of the rect participate. Defaults to every edge and center. */
export interface SnapEdges {
  x?: SnapEdge[];
  y?: SnapEdge[];
}

export type SnapEdge = "start" | "center" | "end";

export const ALL_EDGES: ReadonlyArray<SnapEdge> = ["start", "center", "end"];

interface AxisSnap {
  delta: number;
  target: SnapTarget;
}

function edgePositions(rect: SnapRect, axis: SnapAxis, edges: SnapEdge[]): number[] {
  if (axis === "x") {
    return edges.map((edge) =>
      edge === "start" ? rect.x : edge === "center" ? rect.x + rect.width / 2 : rect.x + rect.width,
    );
  }
  return edges.map((edge) =>
    edge === "start" ? rect.y : edge === "center" ? rect.y + rect.height / 2 : rect.y + rect.height,
  );
}

/**
 * Closest target for one axis. On an equal distance the target that appears
 * first in the list wins, so callers get stable results for duplicated lines.
 */
function closestSnap(
  rect: SnapRect,
  targets: SnapTarget[],
  axis: SnapAxis,
  threshold: number,
  edges: SnapEdge[],
): AxisSnap | null {
  const moving = edgePositions(rect, axis, edges);
  let best: AxisSnap | null = null;

  for (const target of targets) {
    if (target.axis !== axis || !Number.isFinite(target.position)) continue;
    for (const edge of moving) {
      const delta = target.position - edge;
      if (Math.abs(delta) > threshold) continue;
      if (best === null || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, target };
      }
    }
  }

  return best;
}

/**
 * Snaps a rect using the supplied edges. The canvas uses this for resizing so
 * only the edges moved by the handle can attract a snap. Ties are stable: the
 * first matching target wins.
 */
export function computeSnapForEdges(
  rect: SnapRect,
  targets: SnapTarget[],
  threshold: number,
  edges: SnapEdges,
  options: SnapOptions = {},
): SnapResult {
  const empty: SnapResult = { dx: 0, dy: 0, lines: [] };
  if (!Number.isFinite(threshold) || threshold < 0) return empty;

  const xSnap =
    options.x === false
      ? null
      : closestSnap(rect, targets, "x", threshold, edges.x ?? [...ALL_EDGES]);
  const ySnap =
    options.y === false
      ? null
      : closestSnap(rect, targets, "y", threshold, edges.y ?? [...ALL_EDGES]);

  const lines: SnapLine[] = [];
  if (xSnap) lines.push({ axis: "x", position: xSnap.target.position });
  if (ySnap) lines.push({ axis: "y", position: ySnap.target.position });

  return { dx: xSnap?.delta ?? 0, dy: ySnap?.delta ?? 0, lines };
}

/**
 * Finds the smallest movement that aligns any moving edge of `rect` to a
 * target within `threshold` page pixels. Returns the delta to apply to the
 * rect, plus the matched target positions for drawing snap lines.
 */
export function computeSnap(
  rect: SnapRect,
  targets: SnapTarget[],
  threshold: number,
  options: SnapOptions = {},
): SnapResult {
  return computeSnapForEdges(rect, targets, threshold, {}, options);
}

/** Adds both edges and the center of a rect on each axis to a target list. */
export function addRectTargets(
  targets: SnapTarget[],
  rect: SnapRect,
  source: string,
): SnapTarget[] {
  const xEdges = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  const yEdges = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
  for (const position of xEdges) targets.push({ axis: "x", position, source });
  for (const position of yEdges) targets.push({ axis: "y", position, source });
  return targets;
}
