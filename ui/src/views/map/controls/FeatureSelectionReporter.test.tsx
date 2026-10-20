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
  activeLayer: undefined,
  selectedFeature: undefined,
  draw: undefined,
  wms: { activeLayers: [], availableLayers: {}, currentServer: "", servers: [] },
} as LayerState;

const icon = (id: string) => ({
  geometry: { type: "Point", coordinates: [100, 50] },
  properties: { featureId: id },
});

function setup({
  onSelect = vi.fn(),
  drawing = false,
  showRing,
  layerState = state,
}: { onSelect?: () => void; drawing?: boolean; showRing?: boolean; layerState?: LayerState } = {}) {
  return render(
    <LayerContext.Provider value={{ state: layerState, dispatch: vi.fn() }}>
      <MapTimeContext.Provider
        value={drawing ? { drawingMessage: { id: "m", time: new Date() } } : {}}
      >
        <MapSelectionContext.Provider value={{ onSelect }}>
          <FeatureSelectionReporter clickLayerIds={["layer"]} showRing={showRing} />
        </MapSelectionContext.Provider>
      </MapTimeContext.Provider>
    </LayerContext.Provider>,
  );
}

const move = () => act(() => mocks.handlers.mousemove({ point: { x: 100, y: 50 } }));

beforeEach(() => {
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

  describe("FeatureSelectionReporter ring", () => {
    const selected = {
      ...state,
      layers: [
        {
          layer: {
            id: "l1",
            kind: "STANDARD",
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
      expect(onSelect).toHaveBeenCalledWith("f1");
    });
  });
});
