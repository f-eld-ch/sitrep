import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import { activeLayerReducer, layersReducer } from "./reducer";

function layer(id: string, sourceIncidentId: string): Layer {
  return {
    id,
    sourceIncidentId,
    sourceIncidentName: sourceIncidentId,
    name: id,
    incident: {} as Layer["incident"],
    features: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null as unknown as Date,
  };
}

describe("activeLayerReducer", () => {
  it("chooses the first own layer when layers are loaded", () => {
    const result = activeLayerReducer(undefined, {
      type: "SET_LAYERS",
      payload: {
        viewedIncidentId: "parent",
        layers: [layer("child-layer", "child"), layer("parent-layer", "parent")],
      },
    });

    expect(result).toBe("parent-layer");
  });

  it("keeps an inherited active layer selectable for viewing", () => {
    const result = activeLayerReducer("child-layer", {
      type: "SET_LAYERS",
      payload: {
        viewedIncidentId: "parent",
        layers: [layer("child-layer", "child"), layer("parent-layer", "parent")],
      },
    });

    expect(result).toBe("child-layer");
  });

  it("clears the active layer when only inherited layers are visible", () => {
    const result = activeLayerReducer("missing-layer", {
      type: "SET_LAYERS",
      payload: {
        viewedIncidentId: "parent",
        layers: [layer("child-layer", "child")],
      },
    });

    expect(result).toBeUndefined();
  });
});

describe("layersReducer", () => {
  it("orders own layers first, then child layers by incident and layer name", () => {
    const result = layersReducer([], {
      type: "SET_LAYERS",
      payload: {
        viewedIncidentId: "kfs",
        layers: [
          layer("Nachrichtenkarte", "gfs-altdorf"),
          layer("Zweite KFS Karte", "kfs"),
          layer("Führungskarte", "gfs-ahausen"),
          layer("Nachrichtenkarte", "gfs-ahausen"),
          layer("Erste KFS Karte", "kfs"),
        ],
      },
    });

    expect(result.map((item) => `${item.layer.sourceIncidentId}:${item.layer.name}`)).toEqual([
      "kfs:Erste KFS Karte",
      "kfs:Zweite KFS Karte",
      "gfs-ahausen:Führungskarte",
      "gfs-ahausen:Nachrichtenkarte",
      "gfs-altdorf:Nachrichtenkarte",
    ]);
  });
});
