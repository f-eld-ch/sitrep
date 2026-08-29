import { describe, expect, it } from "vitest";
import { toLayer } from "./mapper";
import type { GetLayersQuery } from "gql";

type WireFeature = GetLayersQuery["layers"][0]["features"][0];
type WireLayer = GetLayersQuery["layers"][0];

const WIRE_FEATURE_ACTIVE: WireFeature = {
  id: "feat-1",
  geometry: { type: "Point", coordinates: [8.5, 47.1] },
  properties: { color: "red" },
  createdAt: "2024-03-15T08:00:00Z",
  updatedAt: null,
  deletedAt: null,
};

const WIRE_FEATURE_DELETED: WireFeature = {
  id: "feat-2",
  geometry: { type: "Point", coordinates: [8.6, 47.2] },
  properties: {},
  createdAt: "2024-03-14T10:00:00Z",
  updatedAt: "2024-03-15T11:00:00Z",
  deletedAt: "2024-03-15T12:00:00Z",
};

const WIRE_LAYER: WireLayer = {
  id: "layer-1",
  name: "Alpha Layer",
  features: [WIRE_FEATURE_ACTIVE, WIRE_FEATURE_DELETED],
};

describe("toLayer", () => {
  it("maps id and name", () => {
    const result = toLayer(WIRE_LAYER);
    expect(result.id).toBe("layer-1");
    expect(result.name).toBe("Alpha Layer");
  });

  it("filters out soft-deleted features", () => {
    const result = toLayer(WIRE_LAYER);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].id).toBe("feat-1");
  });

  it("keeps all features when none are deleted", () => {
    const layer = { ...WIRE_LAYER, features: [WIRE_FEATURE_ACTIVE] };
    const result = toLayer(layer);
    expect(result.features).toHaveLength(1);
  });

  it("returns empty features for a layer with only deleted features", () => {
    const layer = { ...WIRE_LAYER, features: [WIRE_FEATURE_DELETED] };
    const result = toLayer(layer);
    expect(result.features).toHaveLength(0);
  });

  it("parses feature createdAt to a Date instance", () => {
    const result = toLayer(WIRE_LAYER);
    expect(result.features[0].createdAt).toBeInstanceOf(Date);
    expect(result.features[0].createdAt.toISOString()).toBe("2024-03-15T08:00:00.000Z");
  });

  it("passes geometry and properties through as-is", () => {
    const result = toLayer(WIRE_LAYER);
    expect(result.features[0].geometry).toEqual({ type: "Point", coordinates: [8.5, 47.1] });
    expect(result.features[0].properties).toEqual({ color: "red" });
  });

  it("does not include __typename in feature or layer", () => {
    const wireWithTypename = {
      ...WIRE_LAYER,
      __typename: "Layers",
      features: [{ ...WIRE_FEATURE_ACTIVE, __typename: "Features" }],
    };
    const result = toLayer(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
    expect(Object.keys(result.features[0])).not.toContain("__typename");
  });
});
