import type { Position } from "geojson";
import { describe, expect, it } from "vitest";
import { smoothRing, smoothRingSegments } from "./smooth";

const square: Position[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

describe("smoothRingSegments", () => {
  it("gives one run per edge, each starting at its own vertex", () => {
    const runs = smoothRingSegments(square, 8);
    expect(runs).toHaveLength(4);
    runs.forEach((run, i) => {
      expect(run).toHaveLength(8);
      expect(run[0]).toEqual(square[i]);
    });
  });

  it("rounds the corners instead of cutting straight between the vertices", () => {
    // the middle of the edge from (0,0) to (1,0) bulges outwards, below y = 0
    const middle = smoothRingSegments(square, 8)[0][4];
    expect(middle[1]).toBeLessThan(0);
    expect(middle[0]).toBeGreaterThan(0);
    expect(middle[0]).toBeLessThan(1);
  });

  it("stays close to a polygon whose vertices are unevenly spaced", () => {
    const uneven: Position[] = [
      [0, 0],
      [0.01, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const points = smoothRing(uneven);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    // centripetal: no wild overshoot beyond a small margin around the polygon
    expect(Math.min(...xs)).toBeGreaterThan(-0.3);
    expect(Math.max(...xs)).toBeLessThan(1.3);
    expect(Math.min(...ys)).toBeGreaterThan(-0.3);
    expect(Math.max(...ys)).toBeLessThan(1.3);
  });

  it("leaves a ring that cannot bend straight", () => {
    expect(
      smoothRingSegments([
        [0, 0],
        [1, 1],
      ]).flat(),
    ).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe("smoothRing", () => {
  it("is closed and passes through every vertex", () => {
    const ring = smoothRing(square);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    square.forEach((vertex) => expect(ring).toContainEqual(vertex));
  });
});
