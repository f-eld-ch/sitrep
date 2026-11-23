import type { Position } from "geojson";
import { describe, expect, it } from "vitest";
import { ARROW } from "./arrow";
import { buildFlowArrow, rotateRing } from "./flowArrow";

const A: Position = [8.0, 47.0];
const B: Position = [8.1, 47.0];
const C: Position = [8.1, 47.1];
const D: Position = [8.0, 47.1];
const square: Position[] = [A, B, C, D, A];

describe("rotateRing", () => {
  it("moves the start on by one vertex and keeps the ring closed", () => {
    expect(rotateRing(square, 1)).toEqual([B, C, D, A, B]);
  });

  it("moves it back with a negative step", () => {
    expect(rotateRing(square, -1)).toEqual([D, A, B, C, D]);
  });

  it("comes back to the start after a full turn, and wraps for more steps than vertices", () => {
    expect(rotateRing(square, 4)).toEqual(square);
    expect(rotateRing(square, 5)).toEqual(rotateRing(square, 1));
    expect(rotateRing(rotateRing(square, 1)!, -1)).toEqual(square);
  });

  it("keeps the vertices, so the zone does not change shape", () => {
    const rotated = rotateRing(square, 2)!;
    expect(new Set(rotated.slice(0, -1).map(String))).toEqual(new Set([A, B, C, D].map(String)));
    expect(rotated[0]).toEqual(rotated[rotated.length - 1]);
  });

  it("copes with a ring that repeats its first vertex more than once", () => {
    expect(rotateRing([A, B, C, D, A, A], 1)).toEqual([B, C, D, A, B]);
  });

  it("has nothing to move in a ring that encloses nothing", () => {
    expect(rotateRing([A, B, A], 1)).toBeUndefined();
    expect(rotateRing([], 1)).toBeUndefined();
  });
});

describe("the flow arrow follows the rotation", () => {
  const config = { icon: ARROW.fireSpread, color: "#ff0000", lengthRatio: 0.12 };
  const baseOf = (ring: Position[]) => {
    const shaft = buildFlowArrow("z", "flow", ring, config, undefined).find((f) =>
      String(f.id).endsWith(":flow"),
    );

    const coordinates = (shaft!.geometry as { coordinates: Position[] }).coordinates;

    return coordinates[0];
  };

  it("springs from the middle of the closing edge, and that edge moves with the ring", () => {
    // closing edge D→A is the west side
    expect(baseOf(square)[0]).toBeCloseTo(8.0, 4);
    // after one step it is A→B, the south side
    expect(baseOf(rotateRing(square, 1)!)[1]).toBeCloseTo(47.0, 4);
    expect(baseOf(rotateRing(square, 1)!)[0]).toBeCloseTo(8.05, 3);
  });
});
