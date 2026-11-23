import type { Feature, LineString, Position } from "geojson";
import { describe, expect, it } from "vitest";
import { enrichFeature } from "./enrichFeature";
import { SLIDE_ARROW_MAX_AT, SLIDE_ARROW_MIN_AT } from "./slideArrow";

/** A straight line due east, 0.1° long, so an attach point is easy to read off the longitude. */
const east: Position[] = [
  [8.0, 47.0],
  [8.1, 47.0],
];

const slide = (arrowAt?: unknown, coordinates: Position[] = east): Feature<LineString> => ({
  type: "Feature",
  id: "s",
  geometry: { type: "LineString", coordinates },
  properties: {
    lineType: "Rutschgebiet",
    deletedAt: null,
    ...(arrowAt === undefined ? {} : { arrowAt }),
  },
});

const shaftOf = (feature: Feature<LineString>): Position[] => {
  const shaft = enrichFeature(feature).find((f) => String(f.id).endsWith(":slide"));
  return (shaft!.geometry as LineString).coordinates;
};

/** Where along the line (0-1, by longitude) the shaft attaches. */
const attachAt = (feature: Feature<LineString>) => {
  const [tail, tip] = shaftOf(feature);
  // A shaft at right angles to an east-west line has the same longitude at both ends.
  expect(tail[0]).toBeCloseTo(tip[0], 5);
  return (tail[0] - 8.0) / 0.1;
};

describe("the position of the slide arrow", () => {
  it("is the middle by default", () => {
    expect(attachAt(slide())).toBeCloseTo(0.5, 2);
    expect(attachAt(slide(0.5))).toBeCloseTo(0.5, 2);
  });

  it("moves along the line, staying at right angles to it", () => {
    expect(attachAt(slide(0.25))).toBeCloseTo(0.25, 2);
    expect(attachAt(slide(0.8))).toBeCloseTo(0.8, 2);
  });

  it("keeps the arrow at right angles where the line turns", () => {
    // east for the first half, then north: an arrow on the first half leaves it due south
    // or north, one on the second half due east or west
    const bent: Position[] = [
      [8.0, 47.0],
      [8.1, 47.0],
      [8.1, 47.1],
    ];
    const first = shaftOf(slide(0.2, bent));
    expect(first[0][0]).toBeCloseTo(first[1][0], 5);
    const second = shaftOf(slide(0.8, bent));
    expect(second[0][1]).toBeCloseTo(second[1][1], 5);
  });

  it("stays clear of the very ends, where the direction is that of one segment only", () => {
    expect(attachAt(slide(0))).toBeCloseTo(SLIDE_ARROW_MIN_AT, 2);
    expect(attachAt(slide(1))).toBeCloseTo(SLIDE_ARROW_MAX_AT, 2);
    expect(attachAt(slide(-3))).toBeCloseTo(SLIDE_ARROW_MIN_AT, 2);
  });

  it("falls back to the middle for a value that is not a number", () => {
    expect(attachAt(slide("far"))).toBeCloseTo(0.5, 2);
    expect(attachAt(slide(Number.NaN))).toBeCloseTo(0.5, 2);
  });
});
