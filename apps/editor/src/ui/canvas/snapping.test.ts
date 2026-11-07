import { describe, expect, it } from "vitest";
import {
  addRectTargets,
  computeSnap,
  computeSnapForEdges,
  type SnapRect,
  type SnapTarget,
} from "./snapping";

const rect: SnapRect = { x: 100, y: 100, width: 100, height: 50 };

describe("computeSnap", () => {
  it("snaps the left edge to a target", () => {
    const targets: SnapTarget[] = [{ axis: "x", position: 104 }];
    expect(computeSnap(rect, targets, 5)).toEqual({
      dx: 4,
      dy: 0,
      lines: [{ axis: "x", position: 104 }],
    });
  });

  it("snaps the right edge and the center", () => {
    expect(computeSnap(rect, [{ axis: "x", position: 203 }], 5).dx).toBe(3);
    expect(computeSnap(rect, [{ axis: "x", position: 148 }], 5).dx).toBe(-2);
  });

  it("snaps the top, middle and bottom edges on y", () => {
    expect(computeSnap(rect, [{ axis: "y", position: 97 }], 5).dy).toBe(-3);
    expect(computeSnap(rect, [{ axis: "y", position: 128 }], 5).dy).toBe(3);
    expect(computeSnap(rect, [{ axis: "y", position: 148 }], 5).dy).toBe(-2);
  });

  it("rejects targets outside the threshold", () => {
    expect(computeSnap(rect, [{ axis: "x", position: 110 }], 4)).toEqual({
      dx: 0,
      dy: 0,
      lines: [],
    });
    expect(computeSnap(rect, [], 4)).toEqual({ dx: 0, dy: 0, lines: [] });
  });

  it("accepts an exact match at a zero threshold", () => {
    expect(computeSnap(rect, [{ axis: "x", position: 100 }], 0).dx).toBe(0);
    expect(computeSnap(rect, [{ axis: "x", position: 109.9 }], 0).dx).toBe(0);
  });

  it("prefers the closest target and applies axes independently", () => {
    const targets: SnapTarget[] = [
      { axis: "x", position: 103 },
      { axis: "x", position: 104 },
      { axis: "y", position: 140 },
      { axis: "y", position: 190 },
    ];
    expect(computeSnap(rect, targets, 6)).toEqual({
      dx: 3,
      dy: 0,
      lines: [{ axis: "x", position: 103 }],
    });

    const both: SnapTarget[] = [
      { axis: "x", position: 203 },
      { axis: "y", position: 146 },
    ];
    expect(computeSnap(rect, both, 4)).toEqual({
      dx: 3,
      dy: -4,
      lines: [
        { axis: "x", position: 203 },
        { axis: "y", position: 146 },
      ],
    });
  });

  it("breaks distance ties by target order", () => {
    // Left edge 100 is 4 from 96 and 4 from 104: the first listed wins.
    expect(computeSnap(rect, [{ axis: "x", position: 96 }, { axis: "x", position: 104 }], 5).dx).toBe(
      -4,
    );
    expect(computeSnap(rect, [{ axis: "x", position: 104 }, { axis: "x", position: 96 }], 5).dx).toBe(
      4,
    );
  });

  it("can disable one axis", () => {
    const targets: SnapTarget[] = [
      { axis: "x", position: 102 },
      { axis: "y", position: 102 },
    ];
    expect(computeSnap(rect, targets, 4, { x: false })).toEqual({
      dx: 0,
      dy: 2,
      lines: [{ axis: "y", position: 102 }],
    });
    expect(computeSnap(rect, targets, 4, { y: false }).dx).toBe(2);
  });

  it("ignores non-finite targets", () => {
    const targets: SnapTarget[] = [
      { axis: "x", position: Number.NaN },
      { axis: "x", position: Number.POSITIVE_INFINITY },
    ];
    expect(computeSnap(rect, targets, 100)).toEqual({ dx: 0, dy: 0, lines: [] });
  });
});

describe("computeSnapForEdges", () => {
  it("only uses the requested edges", () => {
    // The right edge (200) could snap to 204, but a west resize must not use it.
    const targets: SnapTarget[] = [{ axis: "x", position: 204 }];
    expect(computeSnapForEdges(rect, targets, 6, { x: ["start"] }).dx).toBe(0);
    expect(computeSnapForEdges(rect, targets, 6, { x: ["end"] }).dx).toBe(4);
  });
});

describe("addRectTargets", () => {
  it("adds all three edges and centers with their source", () => {
    const targets = addRectTargets([], rect, "parent");
    expect(targets).toHaveLength(6);
    expect(targets.map((target) => `${target.axis}:${target.position}`)).toEqual([
      "x:100",
      "x:150",
      "x:200",
      "y:100",
      "y:125",
      "y:150",
    ]);
    expect(targets.every((target) => target.source === "parent")).toBe(true);
  });
});
