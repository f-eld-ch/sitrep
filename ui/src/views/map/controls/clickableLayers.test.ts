import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import { clickableLayerIds } from "./clickableLayers";

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

describe("clickableLayerIds", () => {
  it("combines every style layer with every layer", () => {
    expect(clickableLayerIds([layer("a", []), layer("b", [])], ["fill", "line"])).toEqual([
      "fill-a",
      "line-a",
      "fill-b",
      "line-b",
    ]);
  });

  it("is empty without layers", () => {
    expect(clickableLayerIds([], ["fill"])).toEqual([]);
  });
});
