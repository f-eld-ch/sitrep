import type { Feature, FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import { framingCollection } from "./framing";

const point = (id: string): Feature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [8, 47] },
  properties: {},
});
const collection = (...ids: string[]): FeatureCollection => ({
  type: "FeatureCollection",
  features: ids.map(point),
});

describe("framingCollection", () => {
  it("frames the active layer when it has symbols", () => {
    const active = collection("a");

    expect(framingCollection(active, collection("m"))).toBe(active);
  });

  it("falls back to the Nachrichtenkarte when the active layer is empty", () => {
    const messageMap = collection("m");

    expect(framingCollection(collection(), messageMap)).toBe(messageMap);
  });

  it("has nothing to frame when both are empty", () => {
    expect(framingCollection(collection(), collection()).features).toEqual([]);
  });
});
