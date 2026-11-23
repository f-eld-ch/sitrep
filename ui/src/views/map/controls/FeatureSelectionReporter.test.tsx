import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerContext, type LayerState } from "../LayerContext";
import { MapSelectionContext } from "../MapSelectionContext";
import { MapTimeContext } from "../MapTimeContext";
import { FeatureSelectionReporter } from "./FeatureSelectionReporter";

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: unknown) => void>,
  hits: { current: [] as unknown[] },
  container: { style: { cursor: "" } },
}));

vi.mock("react-map-gl/maplibre", () => ({
  Layer: () => null,
  Source: ({ id }: { id: string }) => <div data-testid={`source-${id}`} />,
  useMap: () => ({
    current: {
      on: (type: string, handler: (e: unknown) => void) => (mocks.handlers[type] = handler),
      off: (type: string) => delete mocks.handlers[type],
      getLayer: () => ({}),
      getCanvasContainer: () => mocks.container,
      queryRenderedFeatures: () => mocks.hits.current,
      project: ([lng, lat]: [number, number]) => ({ x: lng, y: lat }),
    },
  }),
}));

const state = {
  layers: [],
  pendingFeatures: [],
  removedFeatures: [],
  draftFeatures: [],
  activeLayer: undefined,
  selectedFeature: undefined,
  draw: undefined,
  wms: { activeLayers: [], availableLayers: {}, currentServer: "", servers: [] },
} as LayerState;

const icon = (id: string) => ({
  geometry: { type: "Point", coordinates: [100, 50] },
  properties: { featureId: id },
});

const dispatch = vi.fn();

function tree({
  onSelect = vi.fn(),
  drawing = false,
  showRing,
  layerState = state,
  deselectToken,
}: {
  onSelect?: () => void;
  drawing?: boolean;
  showRing?: boolean;
  layerState?: LayerState;
  deselectToken?: number;
} = {}) {
  return (
    <LayerContext.Provider value={{ state: layerState, dispatch }}>
      <MapTimeContext.Provider
        value={drawing ? { drawingMessage: { id: "m", time: new Date() } } : {}}
      >
        <MapSelectionContext.Provider value={{ onSelect, deselectToken }}>
          <FeatureSelectionReporter clickLayerIds={["layer"]} showRing={showRing} />
        </MapSelectionContext.Provider>
      </MapTimeContext.Provider>
    </LayerContext.Provider>
  );
}

function setup(options: Parameters<typeof tree>[0] = {}) {
  return render(tree(options));
}

const move = () => act(() => mocks.handlers.mousemove({ point: { x: 100, y: 50 } }));

beforeEach(() => {
  dispatch.mockClear();
  vi.useFakeTimers();
  mocks.handlers = {};
  mocks.hits.current = [];
  mocks.container.style.cursor = "";
});

afterEach(() => vi.useRealTimers());

describe("FeatureSelectionReporter cursor", () => {
  it("shows the pointing finger over what a click would select", () => {
    mocks.hits.current = [icon("a")];
    setup();

    move();

    expect(mocks.container.style.cursor).toBe("pointer");
  });

  it("goes back to the map's own cursor over empty map", () => {
    mocks.hits.current = [icon("a")];
    setup();
    move();

    mocks.hits.current = [];
    act(() => {
      mocks.handlers.mousemove({ point: { x: 400, y: 400 } });
      vi.advanceTimersByTime(100); // the look at what is under the mouse is throttled
    });

    expect(mocks.container.style.cursor).toBe("");
  });

  it("lets go of the cursor when it goes away", () => {
    mocks.hits.current = [icon("a")];
    const { unmount } = setup();
    move();

    unmount();

    expect(mocks.container.style.cursor).toBe("");
    expect(mocks.handlers.mousemove).toBeUndefined();
  });

  it("does nothing for a map that selects nothing", () => {
    setup({ drawing: true });

    expect(mocks.handlers.mousemove).toBeUndefined();
  });

  describe("selection", () => {
    const click = () => act(() => mocks.handlers.click({ point: { x: 100, y: 50 } }));

    it("reports the feature that is clicked", () => {
      mocks.hits.current = [icon("a")];
      const onSelect = vi.fn();
      setup({ onSelect });

      click();

      expect(onSelect).toHaveBeenLastCalledWith("a", undefined);
    });

    it("clears the selection when empty map is clicked", () => {
      mocks.hits.current = [icon("a")];
      const onSelect = vi.fn();
      setup({ onSelect });
      click();

      mocks.hits.current = [];
      click();

      expect(onSelect).toHaveBeenLastCalledWith(undefined, undefined);
    });

    it("ignores a hit that carries no feature id", () => {
      mocks.hits.current = [{ ...icon("a"), properties: {} }];
      const onSelect = vi.fn();
      setup({ onSelect });

      click();

      expect(onSelect).not.toHaveBeenCalledWith("a", undefined);
      expect(onSelect).toHaveBeenLastCalledWith(undefined, undefined);
    });

    it("clears the selection with Escape", () => {
      mocks.hits.current = [icon("a")];
      const onSelect = vi.fn();
      setup({ onSelect });
      click();

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: "DESELECT_FEATURE", payload: null });
      expect(onSelect).toHaveBeenLastCalledWith(undefined, undefined);
    });

    it("keeps the selection for other keys", () => {
      mocks.hits.current = [icon("a")];
      const onSelect = vi.fn();
      setup({ onSelect });
      click();

      act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      });

      expect(dispatch).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenLastCalledWith("a", undefined);
    });

    it("clears the selection when the host changes the deselect token", () => {
      mocks.hits.current = [icon("a")];
      const onSelect = vi.fn();
      const { rerender } = setup({ onSelect, deselectToken: 1 });
      click();
      dispatch.mockClear();

      rerender(tree({ onSelect, deselectToken: 2 }));

      expect(dispatch).toHaveBeenCalledWith({ type: "DESELECT_FEATURE", payload: null });
      expect(onSelect).toHaveBeenLastCalledWith(undefined, undefined);
    });

    it("does not look up the messages of a feature that is not saved yet", () => {
      const onSelect = vi.fn();
      setup({
        onSelect,
        layerState: {
          ...state,
          selectedFeature: "draft",
          pendingFeatures: [{ id: "draft", layerId: "l", geometry: icon("x").geometry }],
        } as unknown as LayerState,
      });

      expect(onSelect).toHaveBeenLastCalledWith(undefined, undefined);
    });
  });

  describe("FeatureSelectionReporter ring", () => {
    const selected = {
      ...state,
      layers: [
        {
          layer: {
            id: "l1",
            kind: "STANDARD",
            sourceIncidentId: "inc-child",
            features: [
              { id: "f1", geometry: { type: "Point", coordinates: [8, 47] }, properties: {} },
            ],
          },
          isVisible: true,
        },
      ],
      selectedFeature: "f1",
    } as unknown as LayerState;

    it("rings the selected feature by default", () => {
      setup({ layerState: selected });

      expect(screen.getByTestId("source-selected-feature")).toBeInTheDocument();
    });

    it("draws no ring when switched off, but still reports the selection", () => {
      const onSelect = vi.fn();
      setup({ layerState: selected, showRing: false, onSelect });

      expect(screen.queryByTestId("source-selected-feature")).toBeNull();
      // With the incident the feature's layer belongs to: a parent incident shows the layers of
      // its sub-incidents, and the messages are in the incident that drew the feature.
      expect(onSelect).toHaveBeenCalledWith("f1", "inc-child");
    });

    it("reports no incident for a feature that is on no layer", () => {
      const onSelect = vi.fn();
      setup({ layerState: { ...selected, selectedFeature: "elsewhere" }, onSelect });

      expect(onSelect).toHaveBeenCalledWith("elsewhere", undefined);
    });
  });
});
