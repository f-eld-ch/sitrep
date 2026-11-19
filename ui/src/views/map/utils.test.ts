import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import { LayersToLayerMap } from "./utils";

const layer = (id: string, featureIds: string[]): Layer => ({
  id,
  sourceIncidentId: "inc",
  sourceIncidentName: "inc",
  name: id,
  kind: "STANDARD",
  incident: {} as Layer["incident"],
  features: featureIds.map((featureId) => ({
    id: featureId,
    geometry: { type: "Point", coordinates: [8, 47] },
    properties: {},
    createdAt: new Date(0),
    updatedAt: null,
    deletedAt: null,
  })),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null as unknown as Date,
});

describe("LayersToLayerMap", () => {
  it("separates the active layer from the others, keeping their order", () => {
    const map = LayersToLayerMap(
      [layer("a", ["a1"]), layer("b", ["b1", "b2"]), layer("c", ["c1"])],
      "b",
    );

    expect(map.active.features.map((f) => f.id)).toEqual(["b1", "b2"]);
    expect(map.inactive.map((fc) => fc.features.map((f) => f.id))).toEqual([["a1"], ["c1"]]);
  });

  it("has an empty active collection when no layer is active", () => {
    const map = LayersToLayerMap([layer("a", ["a1"])], "missing");

    expect(map.active).toEqual({ type: "FeatureCollection", features: [] });
    expect(map.inactive).toHaveLength(1);
  });

  it("is empty without layers", () => {
    expect(LayersToLayerMap([], "x")).toEqual({
      active: { type: "FeatureCollection", features: [] },
      inactive: [],
    });
  });
});
