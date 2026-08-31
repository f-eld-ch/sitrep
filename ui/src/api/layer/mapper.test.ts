import { describe, expect, it } from "vitest";
import { toLayer } from "./mapper";
import type { GetLayersForIncidentQuery } from "gql/next";

type WireFeature = GetLayersForIncidentQuery["layersForIncident"][0]["features"][0];
type WireLayer = GetLayersForIncidentQuery["layersForIncident"][0];

const WIRE_FEATURE_1: WireFeature = {
  id: "feat-1",
  geometry: { type: "Point", coordinates: [8.5, 47.1] },
  properties: { color: "red" },
};

const WIRE_FEATURE_2: WireFeature = {
  id: "feat-2",
  geometry: { type: "Point", coordinates: [8.6, 47.2] },
  properties: {},
};

const WIRE_LAYER: WireLayer = {
  id: "layer-1",
  name: "Alpha Layer",
  revision: 1,
  features: [WIRE_FEATURE_1, WIRE_FEATURE_2],
};

describe("toLayer", () => {
  it("maps id and name", () => {
    const result = toLayer(WIRE_LAYER);
    expect(result.id).toBe("layer-1");
    expect(result.name).toBe("Alpha Layer");
  });

  it("includes all features (server handles soft-delete in new schema)", () => {
    const result = toLayer(WIRE_LAYER);
    expect(result.features).toHaveLength(2);
    expect(result.features[0].id).toBe("feat-1");
    expect(result.features[1].id).toBe("feat-2");
  });

  it("keeps all features when none are deleted", () => {
    const layer = { ...WIRE_LAYER, features: [WIRE_FEATURE_1] };
    const result = toLayer(layer);
    expect(result.features).toHaveLength(1);
  });

  it("returns empty features for a layer with no features", () => {
    const layer = { ...WIRE_LAYER, features: [] };
    const result = toLayer(layer);
    expect(result.features).toHaveLength(0);
  });

  it("provides default createdAt for features (not in new schema)", () => {
    const result = toLayer(WIRE_LAYER);
    expect(result.features[0].createdAt).toBeInstanceOf(Date);
  });

  it("passes geometry and properties through as-is", () => {
    const result = toLayer(WIRE_LAYER);
    expect(result.features[0].geometry).toEqual({ type: "Point", coordinates: [8.5, 47.1] });
    expect(result.features[0].properties).toEqual({ color: "red" });
  });

  it("does not include __typename in feature or layer", () => {
    const wireWithTypename = {
      ...WIRE_LAYER,
      __typename: "Layer" as const,
      features: [{ ...WIRE_FEATURE_1, __typename: "Feature" as const }],
    };
    const result = toLayer(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
    expect(Object.keys(result.features[0])).not.toContain("__typename");
  });
});
