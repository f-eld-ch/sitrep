import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureHalo } from "api";
import type { Layer } from "types/layer";
import { LayerContext, type LayerState, type RemovedFeature } from "../LayerContext";
import { MapSelectionContext } from "../MapSelectionContext";
import { MapTimeContext } from "../MapTimeContext";
import { MessageHighlight, MessageHighlightToggle } from "./MessageHighlight";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("react-router", () => ({ useParams: () => ({ incidentId: "inc-1" }) }));

const point = { type: "Point" as const, coordinates: [8, 47] };
const mocks = vi.hoisted(() => ({
  halos: { current: new Map() as ReadonlyMap<string, unknown>, ready: true },
  restore: vi.fn(),
  clickHandlers: [] as ((e: unknown) => void)[],
  hit: { current: undefined as unknown },
  fitBounds: vi.fn(),
  slot: {
    instance: undefined as
      | { container: HTMLElement; onAdd: () => HTMLElement; onRemove: () => void }
      | undefined,
  },
}));

vi.mock("api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("api")>()),
  useMessageFeatureHalos: () => ({ halos: mocks.halos.current, ready: mocks.halos.ready }),
  useRestoreFeature: () => [mocks.restore, { loading: false, error: undefined }],
}));
vi.mock("react-map-gl/maplibre", () => ({
  Source: ({ id, data, children }: { id: string; data: unknown; children: ReactNode }) => (
    <div data-testid={`source-${id}`} data-features={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Layer: ({ id }: { id: string }) => <i data-testid={`layer-${id}`} />,
  Popup: ({ children, onClose }: { children: ReactNode; onClose?: () => void }) => (
    <div data-testid="popup">
      <button type="button" onClick={onClose}>
        popup-closed-by-map
      </button>
      {children}
    </div>
  ),
  // The real control slot, put in the page as the map would put it in a corner.
  useControl: (factory: () => NonNullable<typeof mocks.slot.instance>) => {
    if (!mocks.slot.instance) {
      mocks.slot.instance = factory();
      document.body.append(mocks.slot.instance.onAdd());
    }

    return mocks.slot.instance;
  },
  useMap: () => ({
    current: {
      on: (_: string, handler: (e: unknown) => void) => mocks.clickHandlers.push(handler),
      off: (_: string, handler: (e: unknown) => void) => {
        mocks.clickHandlers = mocks.clickHandlers.filter((h) => h !== handler);
      },
      getLayer: () => ({}),
      queryRenderedFeatures: () => (mocks.hit.current ? [mocks.hit.current] : []),
      fitBounds: mocks.fitBounds,
    },
  }),
}));

const layer = (features: { id: string }[]): Layer =>
  ({
    id: "map-layer",
    kind: "MESSAGE_MAP",
    features: features.map((f) => ({ id: f.id, geometry: point, properties: { label: f.id } })),
  }) as unknown as Layer;

function state(overrides: Partial<LayerState> = {}): LayerState {
  return {
    layers: [{ layer: layer([{ id: "added" }, { id: "kept" }]), isVisible: true }],
    pendingFeatures: [],
    removedFeatures: [],
    draftFeatures: [],
    activeLayer: "map-layer",
    selectedFeature: undefined,
    draw: undefined,
    wms: { activeLayers: [], availableLayers: {}, currentServer: "", servers: [] },
    ...overrides,
  };
}

const dispatch = vi.fn();
const onDrawingChange = vi.fn();
const renderRemoved = vi.fn((features: unknown) => (
  <div data-testid="ghosts" data-features={JSON.stringify(features)} />
));

function tree({
  enabled = true,
  locked = false,
  layerState = state(),
  messageId = "msg-1",
}: { enabled?: boolean; locked?: boolean; layerState?: LayerState; messageId?: string } = {}) {
  return (
    <LayerContext.Provider value={{ state: layerState, dispatch }}>
      <MapTimeContext.Provider
        value={{
          drawingMessage: { id: messageId, time: new Date("2026-01-15T10:00:00Z"), locked },
          asOf: new Date("2026-01-15T10:00:00Z"),
        }}
      >
        <MapSelectionContext.Provider value={{ onDrawingChange }}>
          <MessageHighlight enabled={enabled} renderRemoved={renderRemoved} />
        </MapSelectionContext.Provider>
      </MapTimeContext.Provider>
    </LayerContext.Provider>
  );
}

function setup(options: Parameters<typeof tree>[0] = {}) {
  const result = render(tree(options));

  return {
    ...result,
    /** The same map, now drawing for another message. */
    switchTo: (messageId: string) => result.rerender(tree({ ...options, messageId })),
  };
}

const halo = (kind: FeatureHalo["kind"], extra: Partial<FeatureHalo> = {}) => ({
  kind,
  geometry: point,
  ...extra,
});

const clickMap = () =>
  act(() => mocks.clickHandlers.forEach((h) => h({ point: {}, lngLat: { lng: 8, lat: 47 } })));
const sourceFeatures = () =>
  JSON.parse(screen.getByTestId("source-message-highlight").dataset.features ?? "{}").features as {
    id: string;
    properties: { halo: string; featureId?: string };
  }[];

beforeEach(() => {
  mocks.halos.current = new Map();
  mocks.halos.ready = true;
  mocks.restore.mockReset().mockResolvedValue(undefined);
  mocks.clickHandlers = [];
  mocks.hit.current = undefined;
  mocks.fitBounds.mockReset();
  dispatch.mockReset();
  onDrawingChange.mockReset();
  renderRemoved.mockClear();
});

describe("MessageHighlight halos", () => {
  it("picks out what the message added and modified, and leaves the rest", () => {
    mocks.halos.current = new Map([
      ["added", halo("added")],
      ["kept", halo("modified")],
      ["untouched", halo("modified")], // not on the map any more: nothing to show
    ]);
    setup();

    expect(sourceFeatures().map((f) => [f.id, f.properties.halo])).toEqual([
      ["added", "added"],
      ["kept", "modified"],
    ]);
  });

  it("marks removed features where they last were, and draws them again as they looked", () => {
    mocks.halos.current = new Map([
      ["gone", halo("removed", { lastGeometry: point, lastProperties: { icon: "x" } })],
    ]);
    setup();

    expect(sourceFeatures()).toEqual([
      expect.objectContaining({ id: "gone", properties: { halo: "removed", featureId: "gone" } }),
    ]);
    expect(renderRemoved).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when switched off or when the message did nothing", () => {
    mocks.halos.current = new Map([["added", halo("added")]]);
    const { container, unmount } = setup({ enabled: false });
    expect(container).toBeEmptyDOMElement();
    unmount();

    mocks.halos.current = new Map();
    expect(setup().container).toBeEmptyDOMElement();
  });

  it("shows a feature just deleted for the message before the history knows it", () => {
    setup({
      layerState: state({
        removedFeatures: [
          { id: "fresh", messageId: "msg-1", geometry: point, properties: {} } as RemovedFeature,
          { id: "other", messageId: "msg-2", geometry: point, properties: {} } as RemovedFeature,
        ],
      }),
    });

    expect(sourceFeatures().map((f) => f.id)).toEqual(["fresh"]);
  });

  it("frames the whole layer on arrival, not closer than level 16", () => {
    mocks.halos.ready = false; // the history is not needed for the overview
    setup();

    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
    expect(mocks.fitBounds.mock.calls[0][1]).toMatchObject({ maxZoom: 16 });
  });

  it("waits for the layers before framing anything", () => {
    setup({ layerState: state({ layers: [] }) });

    expect(mocks.fitBounds).not.toHaveBeenCalled();
  });

  it("then frames what each message did, once per message and after its history is known", () => {
    mocks.halos.current = new Map([["added", halo("added")]]);
    const { switchTo } = setup();
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1); // the overview

    switchTo("msg-2");
    expect(mocks.fitBounds).toHaveBeenCalledTimes(2);

    mocks.halos.current = new Map([
      ["added", halo("added")],
      ["more", halo("added")],
    ]);
    switchTo("msg-2"); // more drawing for the same message must not move the map
    expect(mocks.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("does not move the map for a message that did nothing", () => {
    const { switchTo } = setup();
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);

    switchTo("msg-2");

    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("waits for the history before framing a message's features", () => {
    mocks.halos.current = new Map([["added", halo("added")]]);
    mocks.halos.ready = false;
    const { switchTo } = setup();

    switchTo("msg-2");

    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe("MessageHighlight restore", () => {
  const ghostHalos = () =>
    new Map([["gone", halo("removed", { lastGeometry: point, lastProperties: { icon: "x" } })]]);
  const clickGhost = (featureId = "gone") => {
    mocks.hit.current = { properties: { halo: "removed", featureId } };
    clickMap();
  };

  it("offers to bring a removed feature back when its ghost is clicked", () => {
    mocks.halos.current = ghostHalos();
    setup();
    expect(screen.queryByTestId("popup")).toBeNull();

    clickGhost();

    expect(screen.getByTestId("popup")).toBeInTheDocument();
    expect(screen.getByText("messageMap.restoreHint")).toBeInTheDocument();
  });

  it("restores at once: popup and ghost go, the server is asked for the message's time", async () => {
    mocks.halos.current = ghostHalos();
    setup();
    clickGhost();

    fireEvent.click(screen.getByRole("button", { name: /messageMap.restore$/ }));

    expect(screen.queryByTestId("popup")).toBeNull();
    expect(screen.queryByTestId("ghosts")).toBeNull();
    expect(onDrawingChange).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "CLEAR_REMOVED_FEATURE",
      payload: { id: "gone" },
    });
    expect(mocks.restore).toHaveBeenCalledWith({
      id: "gone",
      layerId: "map-layer",
      incidentId: "inc-1",
      current: { geometry: point, properties: { icon: "x" } },
      change: { messageId: "msg-1" },
      asOf: new Date("2026-01-15T10:00:00Z"),
    });
  });

  it("can restore a feature deleted a moment ago, before the history lists it", () => {
    setup({
      layerState: state({
        removedFeatures: [
          { id: "fresh", messageId: "msg-1", geometry: point, properties: { icon: "y" } },
        ] as RemovedFeature[],
      }),
    });
    clickGhost("fresh");

    fireEvent.click(screen.getByRole("button", { name: /messageMap.restore$/ }));

    expect(mocks.restore).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "fresh",
        current: { geometry: point, properties: { icon: "y" } },
      }),
    );
  });

  it("puts the ghost and the popup back when the server refuses", async () => {
    mocks.halos.current = ghostHalos();
    mocks.restore.mockRejectedValue(new Error("refused"));
    setup();
    clickGhost();

    fireEvent.click(screen.getByRole("button", { name: /messageMap.restore$/ }));

    await waitFor(() => expect(screen.getByTestId("popup")).toBeInTheDocument());
    expect(screen.getByTestId("ghosts")).toBeInTheDocument();
  });

  it("closes the popup on cancel and when something else is clicked", () => {
    mocks.halos.current = ghostHalos();
    setup();
    clickGhost();

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(screen.queryByTestId("popup")).toBeNull();

    clickGhost();
    mocks.hit.current = undefined;
    clickMap();
    expect(screen.queryByTestId("popup")).toBeNull();
  });

  it("forgets the clicked feature when the map closes the popup", () => {
    mocks.halos.current = ghostHalos();
    setup();
    clickGhost();

    fireEvent.click(screen.getByRole("button", { name: "popup-closed-by-map" }));

    expect(screen.queryByTestId("popup")).toBeNull();
  });

  it("cannot restore while the message is locked or the overlay is off", () => {
    mocks.halos.current = ghostHalos();
    const { unmount } = setup({ locked: true });
    expect(mocks.clickHandlers).toHaveLength(0);
    unmount();

    setup({ enabled: false });
    expect(mocks.clickHandlers).toHaveLength(0);
  });
});

describe("MessageHighlightToggle", () => {
  it("is a button in the map's corner that tells whether the overlay is on", () => {
    const onToggle = vi.fn();
    render(<MessageHighlightToggle enabled onToggle={onToggle} />);

    const button = screen.getByRole("button", { name: "messageMap.highlight" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(mocks.slot.instance?.container).toContainElement(button);
    expect(mocks.slot.instance?.container).toHaveClass("maplibregl-ctrl-group");

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("says when the overlay is off", () => {
    render(<MessageHighlightToggle enabled={false} onToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: "messageMap.highlight" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("goes first among the controls of its corner", () => {
    render(<MessageHighlightToggle enabled onToggle={vi.fn()} />);
    const corner = document.createElement("div");
    const other = document.createElement("div");
    corner.append(other, mocks.slot.instance?.container as HTMLElement);

    // the effect runs when the toggle mounts: mount again with the slot inside a corner
    render(<MessageHighlightToggle enabled onToggle={vi.fn()} />);

    expect(corner.firstElementChild).toBe(mocks.slot.instance?.container);
  });

  it("leaves the map when it is removed", () => {
    render(<MessageHighlightToggle enabled onToggle={vi.fn()} />);
    const container = mocks.slot.instance?.container as HTMLElement;

    mocks.slot.instance?.onRemove();

    expect(container).not.toBeInTheDocument();
  });
});
