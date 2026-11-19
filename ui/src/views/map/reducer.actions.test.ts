import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import type { WMSLayer, WMSState } from "./LayerContext";
import {
  activeLayerReducer,
  drawReducer,
  layersReducer,
  selectedFeatureReducer,
  wmsReducer,
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

describe("layersReducer visibility", () => {
  const layers = [layer("a", "kfs"), layer("b", "kfs")];

  it("keeps the visibility of layers that are already known when the layers are set again", () => {
    const hidden = [
      { layer: layers[0], isVisible: false },
      { layer: layers[1], isVisible: true },
    ];

    const result = layersReducer(hidden, {
      type: "SET_LAYERS",
      payload: { layers: [...layers, layer("c", "kfs")], viewedIncidentId: "kfs" },
    });

    expect(result.map((item) => [item.layer.id, item.isVisible])).toEqual([
      ["a", false],
      ["b", true],
      ["c", true],
    ]);
  });

  it("sorts by name when no incident is viewed and does not touch its input", () => {
    const input = [layer("b", "x"), layer("A", "y")];

    const result = layersReducer([], { type: "SET_LAYERS", payload: { layers: input } });

    expect(result.map((item) => item.layer.id)).toEqual(["A", "b"]);
    expect(input.map((l) => l.id)).toEqual(["b", "A"]);
  });

  it("toggles one layer only", () => {
    const state = layers.map((l) => ({ layer: l, isVisible: true }));

    const result = layersReducer(state, {
      type: "TOGGLE_LAYER_VISIBILITY",
      payload: { layerId: "b", isVisible: false },
    });

    expect(result.map((item) => item.isVisible)).toEqual([true, false]);
  });

  it("returns the same state for unrelated actions", () => {
    const state = layers.map((l) => ({ layer: l, isVisible: true }));

    expect(layersReducer(state, { type: "DESELECT_FEATURE", payload: null })).toBe(state);
  });
});

describe("activeLayerReducer actions", () => {
  it("sets the active layer", () => {
    expect(
      activeLayerReducer(undefined, { type: "SET_ACTIVE_LAYER", payload: { layerId: "x" } }),
    ).toBe("x");
  });

  it("keeps an active layer that is still there", () => {
    expect(
      activeLayerReducer("a", {
        type: "SET_LAYERS",
        payload: { viewedIncidentId: "kfs", layers: [layer("b", "kfs"), layer("a", "kfs")] },
      }),
    ).toBe("a");
  });

  it("falls back to the first own layer when the active one is gone", () => {
    expect(
      activeLayerReducer("gone", {
        type: "SET_LAYERS",
        payload: { viewedIncidentId: "kfs", layers: [layer("b", "kfs")] },
      }),
    ).toBe("b");
  });

  it("takes the first layer when no incident is viewed", () => {
    expect(
      activeLayerReducer(undefined, {
        type: "SET_LAYERS",
        payload: { layers: [layer("z", "other")] },
      }),
    ).toBe("z");
  });

  it("is undefined without layers and ignores other actions", () => {
    expect(
      activeLayerReducer(undefined, { type: "SET_LAYERS", payload: { layers: [] } }),
    ).toBeUndefined();
    expect(activeLayerReducer("a", { type: "DESELECT_FEATURE", payload: null })).toBe("a");
  });
});

describe("selectedFeatureReducer", () => {
  it.each([
    ["selects", undefined, { type: "SELECT_FEATURE", payload: { id: "f" } } as const, "f"],
    ["deselects", "f", { type: "DESELECT_FEATURE", payload: null } as const, undefined],
    ["ignores others", "f", { type: "SET_ACTIVE_LAYER", payload: { layerId: "x" } } as const, "f"],
  ])("%s", (_name, state, action, expected) => {
    expect(selectedFeatureReducer(state, action)).toBe(expected);
  });
});

describe("drawReducer", () => {
  it("stores the draw control and ignores other actions", () => {
    const draw = { id: "draw" } as unknown as MapboxDraw;

    const set = drawReducer(undefined, { type: "SET_DRAW", payload: { draw } });
    expect(set).toBe(draw);
    expect(drawReducer(set, { type: "DESELECT_FEATURE", payload: null })).toBe(draw);
    expect(drawReducer(set, { type: "SET_DRAW", payload: { draw: undefined } })).toBeUndefined();
  });
});

describe("wmsReducer", () => {
  const wmsLayer = (name: string): WMSLayer => ({
    name,
    title: name.toUpperCase(),
    server: "https://wms.example",
    opacity: 0.5,
    isVisible: true,
  });
  const base: WMSState = {
    activeLayers: [],
    availableLayers: {},
    currentServer: "",
    servers: [
      { name: "One", url: "https://one" },
      { name: "Two", url: "https://two" },
    ],
  };
  const withLayers = (...names: string[]): WMSState => ({
    ...base,
    activeLayers: names.map(wmsLayer),
  });

  it("adds a layer as visible, with its legend, once", () => {
    const added = wmsReducer(base, {
      type: "ADD_WMS_LAYER",
      payload: {
        layerName: "a",
        title: "Layer A",
        opacity: 0.7,
        server: "https://one",
        legendURL: "https://legend",
      },
    });

    expect(added.activeLayers).toEqual([
      {
        name: "a",
        title: "Layer A",
        opacity: 0.7,
        server: "https://one",
        isVisible: true,
        legendURL: "https://legend",
      },
    ]);
    expect(
      wmsReducer(added, {
        type: "ADD_WMS_LAYER",
        payload: { layerName: "a", title: "x", opacity: 1, server: "s" },
      }),
    ).toBe(added);
  });

  it("changes the opacity of one layer", () => {
    const result = wmsReducer(withLayers("a", "b"), {
      type: "UPDATE_WMS_LAYER_OPACITY",
      payload: { layerName: "b", opacity: 0.1 },
    });

    expect(result.activeLayers.map((l) => l.opacity)).toEqual([0.5, 0.1]);
  });

  it("toggles the visibility of one layer", () => {
    const result = wmsReducer(withLayers("a", "b"), {
      type: "TOGGLE_WMS_LAYER_VISIBILITY",
      payload: { layerName: "a", isVisible: false },
    });

    expect(result.activeLayers.map((l) => l.isVisible)).toEqual([false, true]);
  });

  it("removes a layer", () => {
    const result = wmsReducer(withLayers("a", "b"), {
      type: "REMOVE_WMS_LAYER",
      payload: { layerName: "a" },
    });

    expect(result.activeLayers.map((l) => l.name)).toEqual(["b"]);
  });

  it("switches the current server", () => {
    expect(
      wmsReducer(base, { type: "SET_WMS_SERVER", payload: { server: "https://two" } })
        .currentServer,
    ).toBe("https://two");
  });

  it("caches the layers per server", () => {
    const first = wmsReducer(base, {
      type: "SET_WMS_SERVER_LAYERS_CACHE",
      payload: { server: "https://one", layers: [wmsLayer("a")] },
    });
    const second = wmsReducer(first, {
      type: "SET_WMS_SERVER_LAYERS_CACHE",
      payload: { server: "https://two", layers: [wmsLayer("b")] },
    });

    expect(Object.keys(second.availableLayers)).toEqual(["https://one", "https://two"]);
    expect(second.availableLayers["https://one"][0].name).toBe("a");
  });

  it("adds a custom server and makes it current", () => {
    const result = wmsReducer(base, {
      type: "ADD_CUSTOM_WMS_SERVER",
      payload: { server: { name: "Mine", url: "https://mine" } },
    });

    expect(result.servers.map((s) => s.url)).toEqual([
      "https://one",
      "https://two",
      "https://mine",
    ]);
    expect(result.currentServer).toBe("https://mine");
  });

  it("removes a server with its cached layers and falls back to the first server", () => {
    const state: WMSState = {
      ...base,
      currentServer: "https://two",
      availableLayers: { "https://one": [wmsLayer("a")], "https://two": [wmsLayer("b")] },
    };

    const result = wmsReducer(state, {
      type: "REMOVE_WMS_SERVER",
      payload: { server: "https://two" },
    });

    expect(result.servers.map((s) => s.url)).toEqual(["https://one"]);
    expect(Object.keys(result.availableLayers)).toEqual(["https://one"]);
    expect(result.currentServer).toBe("https://one");
  });

  it("does not keep a removed server as the current one", () => {
    const result = wmsReducer(
      { ...base, currentServer: "https://one" },
      { type: "REMOVE_WMS_SERVER", payload: { server: "https://one" } },
    );

    expect(result.currentServer).toBe("https://two");
  });

  it("has no current server once the last one is removed", () => {
    const result = wmsReducer(
      { ...base, servers: [{ name: "One", url: "https://one" }], currentServer: "https://one" },
      { type: "REMOVE_WMS_SERVER", payload: { server: "https://one" } },
    );

    expect(result.servers).toEqual([]);
    expect(result.currentServer).toBe("");
  });

  it("ignores other actions", () => {
    expect(wmsReducer(base, { type: "DESELECT_FEATURE", payload: null })).toBe(base);
  });
});
