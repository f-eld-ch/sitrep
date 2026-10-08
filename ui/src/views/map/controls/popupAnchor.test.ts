import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import { popupAnchorFor, popupLayerIds } from "./popupAnchor";

function layer(id: string, features: Layer["features"]): Layer {
  return {
    id,
    sourceIncidentId: "inc",
    sourceIncidentName: "Inc",
    name: id,
    kind: "STANDARD",
    incident: {} as Layer["incident"],
    features,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null as unknown as Date,
  };
}

const feature = (id: string, geometry: Layer["features"][number]["geometry"]) => ({
  id,
  geometry,
  properties: {},
  createdAt: new Date(0),
  updatedAt: null,
  deletedAt: null,
});

describe("popupLayerIds", () => {
  it("combines every style layer with every layer", () => {
    expect(popupLayerIds([layer("a", []), layer("b", [])], ["fill", "line"])).toEqual([
      "fill-a",
      "line-a",
      "fill-b",
      "line-b",
    ]);
  });

  it("is empty without layers", () => {
    expect(popupLayerIds([], ["fill"])).toEqual([]);
  });
});

describe("popupAnchorFor", () => {
  const layers = [
    layer("a", [feature("point", { type: "Point", coordinates: [8, 47] })]),
    layer("b", [
      feature("line", {
        type: "LineString",
        coordinates: [
          [8, 47],
          [10, 49],
        ],
      }),
    ]),
  ];

  it("opens below a point", () => {
    expect(popupAnchorFor(layers, "point")).toEqual({ longitude: 8, latitude: 47 });
  });

  it("opens below the middle of a larger feature, on any layer", () => {
    expect(popupAnchorFor(layers, "line")).toEqual({ longitude: 9, latitude: 47 });
  });

  it("is undefined for an unknown feature", () => {
    expect(popupAnchorFor(layers, "missing")).toBeUndefined();
  });
});
