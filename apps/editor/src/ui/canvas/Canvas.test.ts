import { describe, expect, it } from "vitest";
import {
  centeredStageOffset,
  clampZoom,
  constrainDelta,
  nudgeDelta,
  resizeRect,
  resizeSizePatch,
  STAGE_TOP,
  viewportPointToPage,
  zoomPanAtPointer,
} from "./Canvas";

describe("canvas geometry", () => {
  it("clamps zoom to the editor range", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(10)).toBe(4);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("centers the page at the breakpoint width at 100% zoom", () => {
    const offset = centeredStageOffset(1400, 1200, 1, { x: 0, y: 0 });
    expect(offset).toEqual({ x: 100, y: STAGE_TOP });
    // The page spans exactly the breakpoint width.
    expect(offset.x + 1200).toBe(1300);
    expect(1400 - (offset.x + 1200)).toBe(100);
  });

  it("applies pan on top of the centered position", () => {
    expect(centeredStageOffset(1400, 1200, 1, { x: 40, y: -25 })).toEqual({
      x: 140,
      y: STAGE_TOP - 25,
    });
  });

  it("keeps the page point under the pointer when zooming", () => {
    const pointer = { x: 200, y: 300 };
    const before = centeredStageOffset(1400, 1200, 1, { x: 0, y: 0 });
    const pageBefore = viewportPointToPage(pointer, before, 1);
    const pan = zoomPanAtPointer(pointer, 1400, 1200, 1, 2, { x: 0, y: 0 });
    const after = centeredStageOffset(1400, 1200, 2, pan);
    const pageAfter = viewportPointToPage(pointer, after, 2);
    expect(pageAfter.x).toBeCloseTo(pageBefore.x);
    expect(pageAfter.y).toBeCloseTo(pageBefore.y);
  });

  it("constrains shift movement to the dominant axis", () => {
    expect(constrainDelta(30, 4, false)).toEqual({ x: 30, y: 4 });
    expect(constrainDelta(30, 4, true)).toEqual({ x: 30, y: 0 });
    expect(constrainDelta(4, -30, true)).toEqual({ x: 0, y: -30 });
  });

  it("resizes from every edge without changing the anchored side", () => {
    const start = { left: 100, top: 100, width: 200, height: 100 };
    expect(resizeRect(start, "se", 50, 50, false)).toEqual({
      left: 100,
      top: 100,
      width: 250,
      height: 150,
    });
    expect(resizeRect(start, "nw", -50, -50, false)).toEqual({
      left: 50,
      top: 50,
      width: 250,
      height: 150,
    });
    expect(resizeRect(start, "n", 0, 25, false)).toEqual({
      left: 100,
      top: 125,
      width: 200,
      height: 75,
    });
  });

  it("never goes below one pixel", () => {
    const start = { left: 100, top: 100, width: 200, height: 100 };
    const rect = resizeRect(start, "e", -500, 0, false);
    expect(rect.width).toBe(1);
    expect(rect.left).toBe(100);
  });

  it("preserves the aspect ratio with shift", () => {
    const start = { left: 100, top: 100, width: 200, height: 100 };
    const rect = resizeRect(start, "se", 100, 0, true);
    expect(rect.width).toBe(300);
    expect(rect.height).toBe(150);
    expect(rect.width / rect.height).toBeCloseTo(2);
  });

  it("maps arrow keys to pixel deltas", () => {
    expect(nudgeDelta("ArrowLeft", 1)).toEqual({ x: -1, y: 0 });
    expect(nudgeDelta("ArrowDown", 10)).toEqual({ x: 0, y: 10 });
    expect(nudgeDelta("Enter", 1)).toBeNull();
  });
});

describe("resize sizing modes", () => {
  it("fixes only the axes an edge handle moves", () => {
    expect(resizeSizePatch("e", 100.4, 20.6)).toEqual({
      width: { mode: "fixed", value: 100 },
    });
    expect(resizeSizePatch("w", 100.4, 20.6)).toEqual({
      width: { mode: "fixed", value: 100 },
    });
    expect(resizeSizePatch("n", 100.4, 20.6)).toEqual({
      height: { mode: "fixed", value: 21 },
    });
    expect(resizeSizePatch("s", 100.4, 20.6)).toEqual({
      height: { mode: "fixed", value: 21 },
    });
  });

  it("fixes both axes for a corner handle", () => {
    expect(resizeSizePatch("se", 100.4, 20.6)).toEqual({
      width: { mode: "fixed", value: 100 },
      height: { mode: "fixed", value: 21 },
    });
  });
});
