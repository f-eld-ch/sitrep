import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import { isPendingFeature, withPendingFeatures } from "./pending";

const layer = (id: string): Layer => ({
  id,
  sourceIncidentId: "inc",
  sourceIncidentName: "Inc",
  name: id,
  kind: "STANDARD",
  incident: {} as Layer["incident"],
  features: [
    {
      id: "saved",
      geometry: { type: "Point", coordinates: [8, 47] },
      properties: {},
      createdAt: new Date(0),
      updatedAt: null,
      deletedAt: null,
    },
  ],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deletedAt: null as unknown as Date,
});

const pendingFeature = (id: string, layerId: string) => ({
  id,
  layerId,
  geometry: { type: "Point" as const, coordinates: [9, 47] },
  properties: { label: id },
});

describe("withPendingFeatures", () => {
  it("draws the saved features first, then the unsaved ones of that layer", () => {
    const fc = withPendingFeatures(layer("a"), [
      pendingFeature("p1", "a"),
      pendingFeature("other", "b"),
    ]);
    expect(fc.features.map((f) => f.id)).toEqual(["saved", "p1"]);
    expect(fc.features[1].properties).toEqual({ label: "p1" });
  });

  it("has nothing to draw without a layer", () => {
    expect(withPendingFeatures(undefined, [pendingFeature("p1", "a")]).features).toEqual([]);
  });
});

describe("isPendingFeature", () => {
  it("tells unsaved features from saved ones", () => {
    const pending = [pendingFeature("p1", "a")];
    expect(isPendingFeature(pending, "p1")).toBe(true);
    expect(isPendingFeature(pending, "saved")).toBe(false);
    expect(isPendingFeature(pending, undefined)).toBe(false);
  });
});
