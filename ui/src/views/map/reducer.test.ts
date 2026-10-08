import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import { activeLayerReducer, layersReducer, pendingFeaturesReducer } from "./reducer";

function layer(id: string, sourceIncidentId: string): Layer {
  return {
    id,
    sourceIncidentId,
    sourceIncidentName: sourceIncidentId,
    name: id,
    kind: "STANDARD",
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

describe("pendingFeaturesReducer", () => {
  const point = { type: "Point" as const, coordinates: [8, 47] };
  const pending = (id: string) => ({ id, layerId: "layer-1", geometry: point, properties: {} });

  it("adds drawn features and keeps them local until they are removed", () => {
    let state = pendingFeaturesReducer([], {
      type: "ADD_PENDING_FEATURE",
      payload: { feature: pending("a") },
    });
    state = pendingFeaturesReducer(state, {
      type: "ADD_PENDING_FEATURE",
      payload: { feature: pending("b") },
    });
    expect(state.map((p) => p.id)).toEqual(["a", "b"]);

    state = pendingFeaturesReducer(state, { type: "REMOVE_PENDING_FEATURE", payload: { id: "a" } });
    expect(state.map((p) => p.id)).toEqual(["b"]);
  });

  it("adding the same feature again replaces it", () => {
    const state = pendingFeaturesReducer([pending("a")], {
      type: "ADD_PENDING_FEATURE",
      payload: { feature: { ...pending("a"), properties: { label: "new" } } },
    });
    expect(state).toHaveLength(1);
    expect(state[0].properties).toEqual({ label: "new" });
  });

  it("updates only what changed", () => {
    const moved = { type: "Point" as const, coordinates: [9, 47] };
    const state = pendingFeaturesReducer([{ ...pending("a"), properties: { icon: "x" } }], {
      type: "UPDATE_PENDING_FEATURE",
      payload: { id: "a", geometry: moved },
    });
    expect(state[0].geometry).toEqual(moved);
    expect(state[0].properties).toEqual({ icon: "x" });

    const restyled = pendingFeaturesReducer(state, {
      type: "UPDATE_PENDING_FEATURE",
      payload: { id: "a", properties: { icon: "y" } },
    });
    expect(restyled[0].geometry).toEqual(moved);
    expect(restyled[0].properties).toEqual({ icon: "y" });
  });

  it("ignores updates for unknown features", () => {
    const state = [pending("a")];
    expect(
      pendingFeaturesReducer(state, {
        type: "UPDATE_PENDING_FEATURE",
        payload: { id: "zzz", properties: { x: 1 } },
      }),
    ).toEqual(state);
  });
});
