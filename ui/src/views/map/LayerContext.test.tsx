import { act, render, renderHook } from "@testing-library/react";
import { useContext, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "types/layer";
import { LayerContext, LayersProvider } from "./LayerContext";

const storageKey = "wmsLayersState";

function layer(id: string): Layer {
  return {
    id,
    sourceIncidentId: "inc",
    sourceIncidentName: "inc",
    name: id,
    kind: "STANDARD",
    incident: {} as Layer["incident"],
    features: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null as unknown as Date,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <LayersProvider>{children}</LayersProvider>
);

const useLayerContext = () => useContext(LayerContext);

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("LayersProvider", () => {
  it("starts empty, with the known WMS servers", () => {
    const { result } = renderHook(useLayerContext, { wrapper });

    expect(result.current.state.layers).toEqual([]);
    expect(result.current.state.activeLayer).toBeUndefined();
    expect(result.current.state.wms.activeLayers).toEqual([]);
    expect(result.current.state.wms.servers.map((s) => s.url)).toContain(
      "https://wms.geo.admin.ch",
    );
  });

  it("runs every action through all reducers", () => {
    const { result } = renderHook(useLayerContext, { wrapper });

    act(() =>
      result.current.dispatch({
        type: "SET_LAYERS",
        payload: { layers: [layer("b"), layer("a")], viewedIncidentId: "inc" },
      }),
    );

    expect(result.current.state.layers.map((l) => l.layer.id)).toEqual(["a", "b"]);
    expect(["a", "b"]).toContain(result.current.state.activeLayer);

    act(() => result.current.dispatch({ type: "SELECT_FEATURE", payload: { id: "f1" } }));

    expect(result.current.state.selectedFeature).toBe("f1");
  });

  it("keeps the state object when an action changes nothing", () => {
    const { result } = renderHook(useLayerContext, { wrapper });
    const before = result.current.state;

    act(() => result.current.dispatch({ type: "DESELECT_FEATURE", payload: null }));

    expect(result.current.state).toBe(before);
  });

  it("does not hand its consumers a new value when a parent re-renders", () => {
    const seen: unknown[] = [];
    const Probe = () => {
      seen.push(useContext(LayerContext));
      return null;
    };
    const { rerender } = render(
      <LayersProvider>
        <Probe />
      </LayersProvider>,
    );

    rerender(
      <LayersProvider>
        <Probe />
      </LayersProvider>,
    );

    expect(new Set(seen).size).toBe(1);
  });

  it("stores the WMS state when it changes and reads it back on the next start", () => {
    const first = renderHook(useLayerContext, { wrapper });

    act(() =>
      first.result.current.dispatch({
        type: "ADD_WMS_LAYER",
        payload: { layerName: "gefahr", title: "Gefahr", opacity: 0.4, server: "https://s" },
      }),
    );

    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}").activeLayers).toEqual([
      expect.objectContaining({ name: "gefahr", opacity: 0.4, isVisible: true }),
    ]);

    first.unmount();
    const second = renderHook(useLayerContext, { wrapper });

    expect(second.result.current.state.wms.activeLayers.map((l) => l.name)).toEqual(["gefahr"]);
  });

  it("starts from the defaults when the stored WMS state is unreadable", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    localStorage.setItem(storageKey, "{not json");

    const { result } = renderHook(useLayerContext, { wrapper });

    expect(result.current.state.wms.activeLayers).toEqual([]);
    expect(result.current.state.wms.servers.length).toBeGreaterThan(0);
    expect(error).toHaveBeenCalled();
  });
});

describe("LayerContext default", () => {
  it("has an inert dispatch outside a provider", () => {
    const { result } = renderHook(useLayerContext);

    expect(result.current.dispatch({ type: "DESELECT_FEATURE", payload: null })).toBeNull();
    expect(result.current.state.layers).toEqual([]);
  });
});
