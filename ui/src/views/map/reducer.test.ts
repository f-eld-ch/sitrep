import type { GeoJsonProperties, Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import {
  activeLayerReducer,
  layersReducer,
  hasType,
  pendingFeaturesReducer,
  removedFeaturesReducer,
} from "./reducer";

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

  it("chooses the preferred kind over the first layer", () => {
    const messageMap = { ...layer("z-map", "parent"), kind: "MESSAGE_MAP" as const };
    const layers = [layer("a-standard", "parent"), messageMap];

    expect(
      activeLayerReducer(undefined, {
        type: "SET_LAYERS",
        payload: { viewedIncidentId: "parent", layers, preferredKind: "MESSAGE_MAP" },
      }),
    ).toBe("z-map");
    expect(
      activeLayerReducer(undefined, {
        type: "SET_LAYERS",
        payload: { viewedIncidentId: "parent", layers, preferredKind: "STANDARD" },
      }),
    ).toBe("a-standard");
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
  it("puts the Nachrichtenkarte first, whatever it is called, then the others alphabetically", () => {
    const messageMap = (name: string, incident: string): Layer => ({
      ...layer(name, incident),
      kind: "MESSAGE_MAP",
    });

    const result = layersReducer([], {
      type: "SET_LAYERS",
      payload: {
        viewedIncidentId: "kfs",
        layers: [
          layer("Zeta", "kfs"),
          layer("alpha", "kfs"),
          messageMap("Zzz Nachrichtenkarte", "kfs"),
          layer("Beta", "kfs"),
          layer("Lage", "child"),
          messageMap("Carte", "child"),
        ],
      },
    });

    expect(result.map((item) => item.layer.name)).toEqual([
      "Zzz Nachrichtenkarte",
      "alpha",
      "Beta",
      "Zeta",
      "Carte",
      "Lage",
    ]);
  });

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

describe("removedFeaturesReducer", () => {
  const point = { type: "Point" as const, coordinates: [8, 47] };
  const removed = (id: string, messageId = "msg-1") => ({
    id,
    messageId,
    geometry: point,
    properties: { icon: "x" },
  });

  it("remembers features deleted for a message until they are cleared", () => {
    let state = removedFeaturesReducer([], {
      type: "ADD_REMOVED_FEATURE",
      payload: { feature: removed("a") },
    });
    state = removedFeaturesReducer(state, {
      type: "ADD_REMOVED_FEATURE",
      payload: { feature: removed("b") },
    });
    expect(state.map((r) => r.id)).toEqual(["a", "b"]);

    state = removedFeaturesReducer(state, { type: "CLEAR_REMOVED_FEATURE", payload: { id: "a" } });
    expect(state.map((r) => r.id)).toEqual(["b"]);
  });

  it("deleting the same feature again replaces the entry", () => {
    const state = removedFeaturesReducer([removed("a", "msg-1")], {
      type: "ADD_REMOVED_FEATURE",
      payload: { feature: removed("a", "msg-2") },
    });

    expect(state).toHaveLength(1);
    expect(state[0].messageId).toBe("msg-2");
  });

  it("ignores other actions", () => {
    const state = [removed("a")];

    expect(removedFeaturesReducer(state, { type: "DESELECT_FEATURE", payload: null })).toBe(state);
  });
});

describe("pendingFeaturesReducer and the selection", () => {
  const drawn = (id: string, geometry: Geometry, properties: GeoJsonProperties = {}) => ({
    id,
    layerId: "l",
    geometry,
    properties,
  });
  const line: Geometry = {
    type: "LineString",
    coordinates: [
      [8, 47],
      [9, 48],
    ],
  };

  it("drops a drawn object that was never told what it is when the selection leaves it", () => {
    const state = [drawn("a", line), drawn("b", line, { lineType: "Rutschgebiet" })];

    expect(
      pendingFeaturesReducer(state, { type: "DESELECT_FEATURE", payload: null }, "a").map(
        (p) => p.id,
      ),
    ).toEqual(["b"]);
    expect(
      pendingFeaturesReducer(state, { type: "SELECT_FEATURE", payload: { id: "z" } }, "a").map(
        (p) => p.id,
      ),
    ).toEqual(["b"]);
  });

  it("keeps one that has its type, to be saved later", () => {
    const state = [drawn("b", line, { lineType: "Rutschgebiet" })];

    expect(pendingFeaturesReducer(state, { type: "DESELECT_FEATURE", payload: null }, "b")).toBe(
      state,
    );
  });

  it("keeps a typeless one that stays selected, or is not the selected one", () => {
    const state = [drawn("a", line)];

    expect(
      pendingFeaturesReducer(state, { type: "SELECT_FEATURE", payload: { id: "a" } }, "a"),
    ).toBe(state);
    expect(
      pendingFeaturesReducer(state, { type: "DESELECT_FEATURE", payload: null }, "other"),
    ).toBe(state);
    expect(pendingFeaturesReducer(state, { type: "DESELECT_FEATURE", payload: null })).toBe(state);
  });

  it.each([
    ["a point without a symbol", { type: "Point", coordinates: [8, 47] } as Geometry, {}, false],
    ["a point with one", { type: "Point", coordinates: [8, 47] } as Geometry, { icon: "x" }, true],
    ["an area without a type", { type: "Polygon", coordinates: [] } as Geometry, {}, false],
    ["an area with one", { type: "Polygon", coordinates: [] } as Geometry, { zoneType: "z" }, true],
  ])("tells whether %s has a type", (_name, geometry, properties, typed) => {
    expect(hasType(drawn("x", geometry, properties))).toBe(typed);
  });
});
