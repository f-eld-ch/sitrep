import type { Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import { pickFeature } from "./pickFeature";

const point = (id: string, x: number): { geometry: Geometry; properties: { id: string } } => ({
  geometry: { type: "Point", coordinates: [x, 0] },
  properties: { id },
});
const line = (id: string) => ({
  geometry: {
    type: "LineString",
    coordinates: [
      [0, 0],
      [1, 1],
    ],
  } as Geometry,
  properties: { id },
});

/** A map whose features sit at x = their longitude, in pixels, on the horizontal axis. */
function fakeMap(hits: ReturnType<typeof point>[]) {
  const queries: [[number, number], [number, number]][] = [];

  return {
    queries,
    map: {
      queryRenderedFeatures: (box: [[number, number], [number, number]]) => {
        queries.push(box);

        return hits;
      },
      project: ([lng, lat]: [number, number]) => ({ x: lng, y: lat }),
    },
  };
}

describe("pickFeature", () => {
  it("looks around the click, not only at it", () => {
    const { map, queries } = fakeMap([]);

    pickFeature(map, { x: 100, y: 50 }, ["layer"], 10);

    expect(queries).toEqual([
      [
        [90, 40],
        [110, 60],
      ],
    ]);
  });

  it("picks the closest icon within reach", () => {
    const { map } = fakeMap([point("far", 108), point("near", 103), point("beyond", 200)]);

    expect(pickFeature(map, { x: 100, y: 0 }, ["layer"], 10)?.properties?.id).toBe("near");
  });

  it("ignores an icon that is only inside the search box, not within reach", () => {
    // The box is square: its corners are farther away than the radius.
    const { map } = fakeMap([point("corner", 109)]);

    expect(pickFeature(map, { x: 100, y: 9 }, ["layer"], 10)).toBeUndefined();
  });

  it("prefers a nearby icon over a line that happens to be in the box", () => {
    const { map } = fakeMap([line("road") as never, point("icon", 104)]);

    expect(pickFeature(map, { x: 100, y: 0 }, ["layer"], 10)?.properties?.id).toBe("icon");
  });

  it("falls back to a line or area when no icon is near", () => {
    const { map } = fakeMap([point("far-icon", 300) as never, line("road") as never]);

    expect(pickFeature(map, { x: 100, y: 0 }, ["layer"], 10)?.properties?.id).toBe("road");
  });

  it("finds nothing on empty map, and asks nothing without layers", () => {
    const { map, queries } = fakeMap([]);

    expect(pickFeature(map, { x: 0, y: 0 }, ["layer"])).toBeUndefined();
    expect(pickFeature(map, { x: 0, y: 0 }, [])).toBeUndefined();
    expect(queries).toHaveLength(1);
  });
});
