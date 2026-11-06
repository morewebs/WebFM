import { describe, expect, it } from "vitest";
import { type AlignmentItem, type AlignmentUpdate, computeAlignment } from "./alignment";

const items: AlignmentItem[] = [
  { id: "a", x: 0, y: 10, width: 100, height: 50 },
  { id: "b", x: 150, y: 200, width: 50, height: 100 },
  { id: "c", x: 300, y: 400, width: 80, height: 60 },
];

const bounds = { x: 0, y: 0, width: 400, height: 500 };

function byId(updates: AlignmentUpdate[]): Record<string, AlignmentUpdate> {
  return Object.fromEntries(updates.map((update) => [update.id, update]));
}

describe("computeAlignment", () => {
  it("aligns left, leaving y untouched", () => {
    const result = byId(computeAlignment(items, bounds, "left"));
    expect(result.a).toEqual({ id: "a", x: 0, y: 10 });
    expect(result.b).toEqual({ id: "b", x: 0, y: 200 });
    expect(result.c).toEqual({ id: "c", x: 0, y: 400 });
  });

  it("centers horizontally using each item's width", () => {
    const result = byId(computeAlignment(items, bounds, "center-h"));
    expect(result.a?.x).toBe(150);
    expect(result.b?.x).toBe(175);
    expect(result.c?.x).toBe(160);
    expect(result.a?.y).toBe(10);
  });

  it("aligns right using each item's width", () => {
    const result = byId(computeAlignment(items, bounds, "right"));
    expect(result.a?.x).toBe(300);
    expect(result.b?.x).toBe(350);
    expect(result.c?.x).toBe(320);
  });

  it("aligns top, leaving x untouched", () => {
    const result = byId(computeAlignment(items, bounds, "top"));
    expect(result.a).toEqual({ id: "a", x: 0, y: 0 });
    expect(result.b).toEqual({ id: "b", x: 150, y: 0 });
    expect(result.c).toEqual({ id: "c", x: 300, y: 0 });
  });

  it("centers vertically using each item's height", () => {
    const result = byId(computeAlignment(items, bounds, "center-v"));
    expect(result.a?.y).toBe(225);
    expect(result.b?.y).toBe(200);
    expect(result.c?.y).toBe(220);
    expect(result.a?.x).toBe(0);
  });

  it("aligns bottom using each item's height", () => {
    const result = byId(computeAlignment(items, bounds, "bottom"));
    expect(result.a?.y).toBe(450);
    expect(result.b?.y).toBe(400);
    expect(result.c?.y).toBe(440);
  });

  it("distributes horizontally with equal gaps and keeps the outer items", () => {
    const row: AlignmentItem[] = [
      { id: "a", x: 10, y: 5, width: 100, height: 20 },
      { id: "b", x: 180, y: 5, width: 40, height: 20 },
      { id: "c", x: 320, y: 5, width: 60, height: 20 },
    ];
    const result = byId(computeAlignment(row, bounds, "distribute-h"));

    expect(result.a?.x).toBe(10);
    expect(result.b?.x).toBe(195);
    expect(result.c?.x).toBe(320);
    expect(result.a?.y).toBe(5);
    expect(result.b?.y).toBe(5);

    const gapOne = (result.b?.x ?? 0) - ((result.a?.x ?? 0) + 100);
    const gapTwo = (result.c?.x ?? 0) - ((result.b?.x ?? 0) + 40);
    expect(gapOne).toBe(85);
    expect(gapTwo).toBe(85);
  });

  it("distributes vertically with equal gaps and keeps the outer items", () => {
    const column: AlignmentItem[] = [
      { id: "a", x: 5, y: 20, width: 20, height: 30 },
      { id: "b", x: 5, y: 150, width: 20, height: 20 },
      { id: "c", x: 5, y: 300, width: 20, height: 50 },
    ];
    const result = byId(computeAlignment(column, bounds, "distribute-v"));

    expect(result.a?.y).toBe(20);
    expect(result.b?.y).toBe(165);
    expect(result.c?.y).toBe(300);
    expect(result.a?.x).toBe(5);

    const gapOne = (result.b?.y ?? 0) - ((result.a?.y ?? 0) + 30);
    const gapTwo = (result.c?.y ?? 0) - ((result.b?.y ?? 0) + 20);
    expect(gapOne).toBe(115);
    expect(gapTwo).toBe(115);
  });

  it("requires at least three items to distribute", () => {
    const pair = items.slice(0, 2);
    expect(computeAlignment(pair, bounds, "distribute-h")).toEqual([]);
    expect(computeAlignment(pair, bounds, "distribute-v")).toEqual([]);
  });

  it("handles unsorted input for distribution", () => {
    const shuffled: AlignmentItem[] = [
      { id: "c", x: 320, y: 0, width: 60, height: 20 },
      { id: "a", x: 10, y: 0, width: 100, height: 20 },
      { id: "b", x: 180, y: 0, width: 40, height: 20 },
    ];
    const result = byId(computeAlignment(shuffled, bounds, "distribute-h"));
    expect(result.a?.x).toBe(10);
    expect(result.b?.x).toBe(195);
    expect(result.c?.x).toBe(320);
  });

  it("returns no updates for an empty selection", () => {
    expect(computeAlignment([], bounds, "left")).toEqual([]);
  });
});
