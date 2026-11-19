import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readyResult } from "api/testing/results";
import type { Incident } from "types";
import type { Layer } from "types/layer";
import { IncidentContext } from "utils";
import en from "../../i18n/locales/en/translations.json";
import { Map as IncidentMap } from "./Map";
import type { DrawingMessage } from "./MapTimeContext";

// None of these tests needs a map: react-map-gl/maplibre, maplibre-gl, mapbox-gl-draw and every
// control are replaced by stand-ins that show what they were given. What is under test is the
// logic of Map.tsx: which layer is active and drawable, when the map frames, how drawing events
// become commands, and how the layers are fetched and synced.

const mocks = vi.hoisted(() => {
  const listeners: { event: string; fn: (event: unknown) => void; once: boolean }[] = [];
  const container = document.createElement("div");
  const fakeMap = {
    getMap: () => fakeMap,
    getContainer: () => container,
    loaded: vi.fn(() => true),
    fitBounds: vi.fn(),
    on: vi.fn((event: string, fn: (event: unknown) => void) => {
      listeners.push({ event, fn, once: false });
    }),
    once: vi.fn((event: string, fn: (event: unknown) => void) => {
      listeners.push({ event, fn, once: true });
    }),
    off: vi.fn((event: string, fn: (event: unknown) => void) => {
      const index = listeners.findIndex((l) => l.event === event && l.fn === fn);
      if (index >= 0) listeners.splice(index, 1);
    }),
  };

  return {
    listeners,
    container,
    fakeMap,
    incidentId: "inc-1" as string | undefined,
    language: "en",
    basemap: { style: { name: "basemap-a" } } as { style: unknown },
    layersResult: undefined as unknown,
    layersCalls: [] as unknown[][],
    addFeature: vi.fn(),
    modifyFeature: vi.fn(),
    deleteFeature: vi.fn(),
    setBabsSpriteLang: vi.fn(),
    withBabsSprite: vi.fn(),
    setWorkerUrl: vi.fn(),
    mapProps: undefined as Record<string, unknown> | undefined,
    attributionProps: undefined as Record<string, unknown> | undefined,
    drawProps: undefined as Record<string, (...args: never[]) => unknown> | undefined,
    reporterProps: undefined as { clickLayerIds: string[]; showRing: boolean } | undefined,
    probe: undefined as
      | {
          layers: { state: import("./LayerContext").LayerState; dispatch: (a: never) => void };
          time: import("./MapTimeContext").MapTime;
          selection: import("./MapSelectionContext").MapSelection;
        }
      | undefined,
  };
});

const emit = (event: string, payload: unknown = {}) => {
  for (const l of [...mocks.listeners].filter((x) => x.event === event)) {
    if (l.once) mocks.listeners.splice(mocks.listeners.indexOf(l), 1);
    l.fn(payload);
  }
};
const listenerCount = (event: string) => mocks.listeners.filter((l) => l.event === event).length;

vi.mock("react-router", () => ({ useParams: () => ({ incidentId: mocks.incidentId }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key.split(".").reduce<unknown>((node, part) => (node as never)?.[part], en) ?? key,
    i18n: { resolvedLanguage: mocks.language, language: mocks.language },
  }),
}));
vi.mock("api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("api")>()),
  useLayersForIncident: (...args: unknown[]) => {
    mocks.layersCalls.push(args);
    return mocks.layersResult;
  },
  useAddFeature: () => [mocks.addFeature, { loading: false }],
  useModifyFeature: () => [mocks.modifyFeature, { loading: false }],
  useDeleteFeature: () => [mocks.deleteFeature, { loading: false }],
}));
vi.mock("maplibre-gl", () => ({
  setMaxParallelImageRequests: vi.fn(),
  setWorkerCount: vi.fn(),
  setWorkerUrl: (url: string) => mocks.setWorkerUrl(url),
}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({ default: "worker-url" }));
vi.mock("@mapbox/mapbox-gl-draw", () => ({ default: { modes: { simple_select: {} } } }));
vi.mock("@f-eld-ch/babs-sprites", () => ({
  setBabsSpriteLang: (...args: unknown[]) => mocks.setBabsSpriteLang(...args),
  withBabsSprite: (...args: unknown[]) => mocks.withBabsSprite(...args),
}));
vi.mock("react-map-gl/maplibre", () => ({
  Map: ({ children, ...props }: { children: ReactNode }) => {
    mocks.mapProps = props;
    return <div data-testid="map">{children}</div>;
  },
  MapProvider: ({ children }: { children: ReactNode }) => children,
  useMap: () => ({ current: mocks.fakeMap }),
  AttributionControl: (props: Record<string, unknown>) => {
    mocks.attributionProps = props;
    return <div data-testid="attribution" />;
  },
  FullscreenControl: () => <div data-testid="fullscreen" />,
  NavigationControl: () => <div data-testid="navigation" />,
  ScaleControl: () => <div data-testid="scale" />,
  Source: ({
    id,
    data,
    children,
  }: {
    id: string;
    data: FeatureCollection;
    children: ReactNode;
  }) => (
    <div data-testid={`source-${id}`} data-features={data.features.map((f) => f.id).join(",")}>
      {children}
    </div>
  ),
  Layer: ({ id }: { id: string }) => <i data-testid={`maplayer-${id}`} />,
}));
vi.mock("./styleGenerator", () => ({
  createMapStyle: ({ forDraw }: { forDraw: boolean }) =>
    forDraw ? [{ id: "draw-style" }] : [{ id: "line" }, { id: "fill" }],
}));
vi.mock("components/map/EnrichedLayerFeatures", () => ({
  default: ({ id, featureCollection }: { id: string; featureCollection: FeatureCollection }) => (
    <div
      data-testid={`enriched-${id}`}
      data-geometries={JSON.stringify(featureCollection.features.map((f) => f.geometry))}
    />
  ),
  EnrichedSymbolSource: () => null,
}));
vi.mock("./ActiveLayerCard", () => ({
  ActiveLayerCard: ({ layer }: { layer: { id: string } }) => (
    <div data-testid="layer-card">{layer.id}</div>
  ),
}));
vi.mock("./ActiveWMSLayers", () => ({ default: () => <div data-testid="wms-layers" /> }));
vi.mock("./controls/BabsIconController", () => ({
  BabsIconController: () => <div data-testid="icon-controller" />,
}));
vi.mock("./controls/DrawControl", () => ({
  default: (props: Record<string, (...args: never[]) => unknown>) => {
    mocks.drawProps = props;
    return <div data-testid="draw-control" />;
  },
}));
vi.mock("./controls/ExportControl", () => ({
  default: () => <div data-testid="export-control" />,
}));
vi.mock("./controls/LayerControl", () => ({
  default: () => <div data-testid="layer-control" />,
}));
vi.mock("./controls/Searchbox", () => ({ default: () => <div data-testid="search-control" /> }));
vi.mock("./controls/StyleController", () => ({
  MapStyleProvider: ({ children }: { children: ReactNode }) => children,
  StyleController: () => <div data-testid="style-controller" />,
  useMapStyle: () => ({ selectedStyle: mocks.basemap }),
}));
vi.mock("./controls/TimeControl", () => ({
  TimeControl: () => <div data-testid="time-control" />,
}));
vi.mock("./controls/PendingFeaturesGuard", () => ({
  PendingFeaturesGuard: () => <div data-testid="pending-guard" />,
}));
vi.mock("./controls/FeatureSelectionReporter", () => ({
  FeatureSelectionReporter: (props: { clickLayerIds: string[]; showRing: boolean }) => {
    mocks.reporterProps = props;
    return null;
  },
}));
vi.mock("./controls/MessageHighlight", () => ({
  MessageHighlight: ({
    enabled,
    renderRemoved,
  }: {
    enabled: boolean;
    renderRemoved: (fc: FeatureCollection) => ReactNode;
  }) => (
    <div data-testid="message-highlight" data-enabled={String(enabled)}>
      {renderRemoved({ type: "FeatureCollection", features: [] })}
    </div>
  ),
  MessageHighlightToggle: ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <button aria-pressed={enabled} onClick={onToggle}>
      highlight toggle
    </button>
  ),
}));
// Reads the contexts the map provides, so the tests can see and drive them.
vi.mock("./controls/TimeLabels", async () => {
  const { useContext } = await import("react");
  const { LayerContext } = await import("./LayerContext");
  const { MapTimeContext } = await import("./MapTimeContext");
  const { MapSelectionContext } = await import("./MapSelectionContext");

  return {
    TimeLabels: () => {
      mocks.probe = {
        layers: useContext(LayerContext) as never,
        time: useContext(MapTimeContext),
        selection: useContext(MapSelectionContext),
      };
      return null;
    },
  };
});

const point = (lng = 8, lat = 47): Geometry => ({ type: "Point", coordinates: [lng, lat] });

function makeLayer(
  id: string,
  overrides: Partial<Layer> = {},
  featureIds: string[] = ["f1"],
): Layer {
  return {
    id,
    sourceIncidentId: "inc-1",
    sourceIncidentName: "Incident",
    name: id,
    kind: "STANDARD",
    incident: {} as Layer["incident"],
    features: featureIds.map((featureId, i) => ({
      id: featureId,
      geometry: point(8 + i, 47 + i),
      properties: { icon: "x" },
      createdAt: new Date(0),
      updatedAt: null,
      deletedAt: null,
    })),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null as unknown as Date,
    ...overrides,
  };
}

const setLayers = (...layers: Layer[]) => {
  mocks.layersResult = readyResult({ layers });
};

type MapProps = Parameters<typeof IncidentMap>[0];

function Wrapper({
  incident,
  children,
}: {
  incident: Partial<Incident> | null;
  children: ReactNode;
}) {
  return (
    <IncidentContext.Provider
      value={{
        state: { incident: incident as Incident | null, loadedForId: "inc-1" },
        dispatch: () => null,
      }}
    >
      {children}
    </IncidentContext.Provider>
  );
}

function renderMap(props: MapProps = {}, incident: Partial<Incident> | null = { closedAt: null }) {
  const view = (p: MapProps) => (
    <Wrapper incident={incident}>
      <IncidentMap {...p} />
    </Wrapper>
  );
  const result = render(view(props));

  return { ...result, update: (p: MapProps) => result.rerender(view(p)) };
}

const state = () => mocks.probe!.layers.state;
const dispatch = (action: unknown) => act(() => mocks.probe!.layers.dispatch(action as never));
const flush = () => act(async () => {});
const draw = () => mocks.drawProps!;
const call = <T,>(name: string, ...args: unknown[]): T => {
  let result: unknown;
  act(() => {
    result = (draw()[name] as (...a: unknown[]) => unknown)(...args);
  });
  return result as T;
};

// The part of the draw control Map.tsx talks to.
const fakeDraw = () => ({
  deleteAll: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  changeMode: vi.fn(),
  delete: vi.fn(),
});

const message: DrawingMessage = { id: "msg-1", time: new Date("2026-01-15T10:00:00Z") };

beforeEach(() => {
  mocks.listeners.length = 0;
  mocks.incidentId = "inc-1";
  mocks.language = "en";
  mocks.basemap = { style: { name: "basemap-a" } };
  mocks.layersCalls = [];
  mocks.mapProps = undefined;
  mocks.attributionProps = undefined;
  mocks.drawProps = undefined;
  mocks.reporterProps = undefined;
  mocks.probe = undefined;
  mocks.fakeMap.loaded.mockReset().mockReturnValue(true);
  mocks.fakeMap.fitBounds.mockReset();
  mocks.addFeature.mockReset().mockResolvedValue({ featureId: "server-id" });
  mocks.modifyFeature.mockReset().mockResolvedValue(undefined);
  mocks.deleteFeature.mockReset().mockResolvedValue(undefined);
  mocks.setBabsSpriteLang.mockReset();
  mocks.withBabsSprite.mockReset().mockImplementation((style: unknown) => ({ withSprite: style }));
  mocks.setWorkerUrl.mockReset();
  setLayers(makeLayer("L1"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("module setup", () => {
  it("still loads when the maplibre globals cannot be set", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.setWorkerUrl.mockImplementation(() => {
      throw new Error("no workers here");
    });
    vi.resetModules();

    const module = await import("./Map");

    expect(module.Map).toBeTypeOf("function");
    expect(error).toHaveBeenCalledWith("Error setting maplibregl globals:", expect.any(Error));
  });
});

describe("controls per kind of map", () => {
  const ids = [
    "search-control",
    "fullscreen",
    "export-control",
    "pending-guard",
    "time-control",
    "layer-control",
    "icon-controller",
    "wms-layers",
  ];
  const shown = () => ids.filter((id) => screen.queryByTestId(id));

  it.each([
    ["the operator map", {}, ids],
    [
      "an embedded map",
      { embedded: true },
      ["search-control", "fullscreen", "layer-control", "icon-controller", "wms-layers"],
    ],
    ["the read-only map", { readOnly: true }, []],
    [
      "a read-only map that stays on one kind of layer",
      { readOnly: true, preferredLayerKind: "MESSAGE_MAP" as const },
      ["layer-control", "wms-layers"],
    ],
    [
      "a map drawn for a message",
      { embedded: true, drawingMessage: message },
      ["search-control", "fullscreen", "layer-control", "icon-controller", "wms-layers"],
    ],
    [
      "a map for a locked message",
      { embedded: true, drawingMessage: { ...message, locked: true } },
      ["search-control", "fullscreen", "layer-control", "wms-layers"],
    ],
  ])("%s shows its own controls", (_name, props, expected) => {
    renderMap(props as MapProps);

    expect(shown().sort()).toEqual([...expected].sort());
    // Every map has the zoom buttons, the scale and the basemap switch.
    expect(screen.getByTestId("navigation")).toBeInTheDocument();
    expect(screen.getByTestId("scale")).toBeInTheDocument();
    expect(screen.getByTestId("style-controller")).toBeInTheDocument();
  });

  it("only gives an embedded map a full-height box", () => {
    const { container, unmount } = renderMap({ embedded: true });
    expect(container.querySelector("[data-theme=light]")).toHaveClass("h-full");
    unmount();

    const full = renderMap();
    expect(full.container.querySelector("[data-theme=light]")).toHaveClass("grow");
  });
});

describe("style and language", () => {
  it("gives the map the basemap with the BABS sprite of the current language", () => {
    mocks.language = "fr";

    renderMap();

    expect(mocks.withBabsSprite).toHaveBeenCalledWith(
      { name: "basemap-a" },
      "fr",
      expect.objectContaining({ unSigns: true }),
    );
    expect(mocks.mapProps?.mapStyle).toEqual({ withSprite: { name: "basemap-a" } });
  });

  it("swaps the sprite in place when the language changes, without a new style", () => {
    const { update } = renderMap();
    const style = mocks.mapProps?.mapStyle;
    expect(mocks.setBabsSpriteLang).toHaveBeenLastCalledWith(
      mocks.fakeMap,
      "en",
      expect.any(String),
    );

    mocks.language = "it";
    update({});

    expect(mocks.mapProps?.mapStyle).toBe(style);
    expect(mocks.setBabsSpriteLang).toHaveBeenLastCalledWith(
      mocks.fakeMap,
      "it",
      expect.any(String),
    );
  });

  it("builds a new style when the basemap changes", () => {
    const { update } = renderMap();
    const style = mocks.mapProps?.mapStyle;

    mocks.basemap = { style: { name: "basemap-b" } };
    update({});

    expect(mocks.mapProps?.mapStyle).not.toBe(style);
    expect(mocks.mapProps?.mapStyle).toEqual({ withSprite: { name: "basemap-b" } });
  });

  it("shows the swisstopo credits in the app language and rebuilds only the attribution", () => {
    const { update } = renderMap();
    expect(mocks.attributionProps?.customAttribution).toContain("© FDFA");
    const style = mocks.mapProps?.mapStyle;

    mocks.language = "de";
    update({});

    expect(mocks.attributionProps?.customAttribution).toContain("© EDA");
    expect(mocks.mapProps?.mapStyle).toBe(style);
  });

  it("expands and folds the short attribution on a click inside the map", () => {
    renderMap();
    mocks.container.innerHTML =
      '<span class="attrib-short" role="button" aria-expanded="false">© swisstopo<span class="inner">, more</span></span><span id="other">x</span>';
    const short = mocks.container.querySelector(".attrib-short")!;

    fireEvent.click(mocks.container.querySelector(".inner")!);
    expect(short).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(short);
    expect(short).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(mocks.container.querySelector("#other")!);
    expect(short).toHaveAttribute("aria-expanded", "false");
  });

  it("stops listening to the map container when it goes away", () => {
    const { unmount } = renderMap();
    mocks.container.innerHTML = '<span class="attrib-short" aria-expanded="false">x</span>';
    unmount();

    fireEvent.click(mocks.container.querySelector(".attrib-short")!);

    expect(mocks.container.querySelector(".attrib-short")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

describe("fetching the layers", () => {
  const lastOptions = () => mocks.layersCalls.at(-1) as [string, Date | undefined, unknown];

  it.each([
    ["live, as an operator", {}, { pollInterval: 2000, fetchPolicy: "cache-and-network" }],
    [
      "live, read-only (nobody edits)",
      { readOnly: true },
      { pollInterval: 10_000, fetchPolicy: "cache-and-network" },
    ],
    [
      "a fixed point in the past, which does not change and must not touch the cache",
      { asOf: new Date("2026-01-15T10:00:00Z") },
      { pollInterval: 0, fetchPolicy: "no-cache" },
    ],
    [
      "for a message, where others' drawings arrive slowly",
      { drawingMessage: message },
      { pollInterval: 10_000, fetchPolicy: "cache-and-network" },
    ],
    [
      "for a message in the past, which still uses the cache the drawing updates",
      { drawingMessage: message, asOf: new Date("2026-01-15T10:00:00Z") },
      { pollInterval: 10_000, fetchPolicy: "cache-and-network" },
    ],
  ])("polls and caches %s", (_name, props, expected) => {
    renderMap(props as MapProps);

    expect(lastOptions()[0]).toBe("inc-1");
    expect(lastOptions()[2]).toEqual(expected);
  });

  it("asks for the layers as of the time the map shows", () => {
    const asOf = new Date("2026-01-15T10:00:00Z");

    renderMap({ asOf });

    expect(lastOptions()[1]).toEqual(asOf);
  });

  it("puts the layers of the incident in the map, own ones first, with the first one active", () => {
    setLayers(
      makeLayer("child", { sourceIncidentId: "inc-2", sourceIncidentName: "Child" }),
      makeLayer("own"),
    );

    renderMap();

    expect(state().layers.map((l) => l.layer.id)).toEqual(["own", "child"]);
    expect(state().activeLayer).toBe("own");
  });

  it.each([
    ["an operator", {}, "MESSAGE_MAP", "std"],
    [
      "a map that prefers the message map",
      { preferredLayerKind: "MESSAGE_MAP" as const },
      "std",
      "map",
    ],
    ["a map drawn for a message", { drawingMessage: message }, "std", "map"],
  ])("chooses the layer kind to draw on for %s", (_name, props, _unused, expected) => {
    setLayers(
      makeLayer("map", { kind: "MESSAGE_MAP", name: "Nachrichtenkarte" }),
      makeLayer("std", { name: "zzz" }),
    );

    renderMap(props as MapProps);

    expect(state().activeLayer).toBe(expected);
  });

  it("waits for the result before it sets any layer", () => {
    mocks.layersResult = { status: "loading", data: undefined };

    renderMap();

    expect(state().layers).toEqual([]);
  });

  it("does not set the layers again while the result is unchanged, and reuses unchanged layers", () => {
    const layerA = makeLayer("a");
    const layerB = makeLayer("b");
    setLayers(layerA, layerB);
    const { update } = renderMap();
    const before = state().layers;

    // A poll returns equal data in new objects.
    setLayers(structuredClone(layerA), structuredClone(layerB));
    update({});
    expect(state().layers).toBe(before);

    // One layer changes: only that one is a new object.
    const changed = structuredClone(layerB);
    changed.features.push({ ...changed.features[0], id: "f2" });
    setLayers(structuredClone(layerA), changed);
    update({});

    const after = state().layers;
    expect(after).not.toBe(before);
    expect(after[0].layer).toBe(before[0].layer);
    expect(after[1].layer).not.toBe(before[1].layer);
    expect(after[1].layer.features.map((f) => f.id)).toEqual(["f1", "f2"]);
  });

  it("keeps the layers a user hid when the layers are set again", () => {
    const { update } = renderMap();
    dispatch({ type: "TOGGLE_LAYER_VISIBILITY", payload: { layerId: "L1", isVisible: false } });

    setLayers(makeLayer("L1", {}, ["f1", "f2"]));
    update({});

    expect(state().layers[0].isVisible).toBe(false);
    expect(state().layers[0].layer.features).toHaveLength(2);
  });

  it("starts over for another incident", () => {
    const { update } = renderMap();
    expect(state().layers).toHaveLength(1);

    mocks.incidentId = "inc-2";
    setLayers(makeLayer("L1", { sourceIncidentId: "inc-2" }));
    update({});

    expect(state().layers.map((l) => l.layer.sourceIncidentId)).toEqual(["inc-2"]);
  });
});

describe("the map's time", () => {
  it("gives a map without a fixed time a slider that moves it, and reports the move", () => {
    const onTimeChange = vi.fn();
    renderMap({ onTimeChange });
    expect(mocks.probe!.time.asOf).toBeUndefined();
    const moved = new Date("2026-01-15T11:00:00Z");

    act(() => mocks.probe!.time.setAsOf?.(moved));

    expect(onTimeChange).toHaveBeenCalledWith(moved);
    expect(mocks.probe!.time.asOf).toEqual(moved);
    expect(mocks.layersCalls.at(-1)?.[1]).toEqual(moved);

    act(() => mocks.probe!.time.setAsOf?.(undefined));

    expect(onTimeChange).toHaveBeenLastCalledWith(undefined);
    expect(mocks.probe!.time.asOf).toBeUndefined();
  });

  it.each([
    ["a fixed time", { asOf: new Date("2026-01-15T10:00:00Z") }],
    ["a message", { drawingMessage: message }],
  ])("has no slider for a map with %s", (_name, props) => {
    renderMap(props as MapProps);

    expect(mocks.probe!.time.setAsOf).toBeUndefined();
  });

  it("describes the message it is drawn for, and that it only has the message map", () => {
    renderMap({ drawingMessage: { ...message, locked: true } });

    expect(mocks.probe!.time.drawingMessage).toEqual({ ...message, locked: true });
    expect(mocks.probe!.time.messageMapOnly).toBe(true);
  });

  it("only has the message map when it prefers that kind of layer", () => {
    renderMap({ preferredLayerKind: "MESSAGE_MAP" });

    expect(mocks.probe!.time.messageMapOnly).toBe(true);
    expect(mocks.probe!.time.drawingMessage).toBeUndefined();
  });

  it("does not hand out a new time when a parent re-renders with equal dates", () => {
    const { update } = renderMap({ drawingMessage: { ...message, time: new Date(message.time) } });
    const time = mocks.probe!.time;

    update({ drawingMessage: { ...message, time: new Date(message.time) } });

    expect(mocks.probe!.time).toBe(time);
  });

  it("passes the selection callbacks on to the controls", () => {
    const onFeatureSelect = vi.fn();
    const onDrawingChange = vi.fn();

    renderMap({ onFeatureSelect, onDrawingChange, deselectToken: 3 });

    expect(mocks.probe!.selection).toEqual({
      onSelect: onFeatureSelect,
      onDrawingChange,
      deselectToken: 3,
    });
  });
});

describe("the buttons in the corner", () => {
  it("offers the selection ring only on a map that reports its selection, and starts it off", () => {
    renderMap({ onFeatureSelect: vi.fn() });

    const ring = screen.getByRole("button", { name: en.mapview.selectionRing });
    expect(ring).toHaveAttribute("aria-pressed", "false");
    expect(mocks.reporterProps?.showRing).toBe(false);

    fireEvent.click(ring);

    expect(ring).toHaveAttribute("aria-pressed", "true");
    expect(mocks.reporterProps?.showRing).toBe(true);
  });

  it.each([
    ["without a selection to report", {}],
    ["for a message", { onFeatureSelect: vi.fn(), drawingMessage: message }],
  ])("has no selection ring %s", (_name, props) => {
    renderMap(props as MapProps);

    expect(
      screen.queryByRole("button", { name: en.mapview.selectionRing }),
    ).not.toBeInTheDocument();
  });

  it("toggles the highlight of the message and shows what was removed", () => {
    renderMap({ drawingMessage: message });

    const highlight = screen.getByTestId("message-highlight");
    expect(highlight).toHaveAttribute("data-enabled", "true");
    expect(within(highlight).getByTestId("source-message-removed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "highlight toggle" }));

    expect(highlight).toHaveAttribute("data-enabled", "false");
  });

  it("has no message highlight on other maps", () => {
    renderMap();

    expect(screen.queryByTestId("message-highlight")).not.toBeInTheDocument();
  });
});

describe("clickable layers", () => {
  it("lets the operator click the visible layers other than the active one", () => {
    setLayers(makeLayer("a"), makeLayer("b"), makeLayer("c"));
    renderMap();
    expect(state().activeLayer).toBe("a");
    dispatch({ type: "TOGGLE_LAYER_VISIBILITY", payload: { layerId: "c", isVisible: false } });

    expect(mocks.reporterProps?.clickLayerIds).toEqual(["line-b", "fill-b"]);
  });

  it("lets a read-only map click every visible layer", () => {
    setLayers(makeLayer("a"), makeLayer("b"));
    renderMap({ readOnly: true });

    expect(mocks.reporterProps?.clickLayerIds).toEqual(["line-a", "fill-a", "line-b", "fill-b"]);
  });

  it("lets a closed incident's active layer be clicked as well", () => {
    setLayers(makeLayer("a"), makeLayer("b"));
    renderMap({}, { closedAt: new Date("2026-01-01T00:00:00Z") });

    expect(mocks.reporterProps?.clickLayerIds).toEqual(["line-a", "fill-a", "line-b", "fill-b"]);
  });
});

describe("the read-only map", () => {
  const frame = (west: number, south: number, east: number, north: number) => [
    [west, south],
    [east, north],
  ];

  it("shows the layers that have features, the first as active, and frames it", () => {
    setLayers(makeLayer("empty", {}, []), makeLayer("a", {}, ["a1", "a2"]), makeLayer("b"));

    renderMap({ readOnly: true });

    expect(screen.getByTestId("layer-card")).toHaveTextContent("a");
    expect(screen.queryByTestId("source-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("source-a")).toHaveAttribute("data-features", "a1,a2");
    expect(screen.getByTestId("source-b")).toBeInTheDocument();
    expect(state().activeLayer).toBe("a");
    expect(mocks.fakeMap.fitBounds).toHaveBeenCalledExactlyOnceWith(frame(8, 47, 9, 48), {
      animate: true,
      maxZoom: 16,
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
    });
  });

  it("does not show a layer that was switched off", () => {
    setLayers(makeLayer("a"), makeLayer("b"));
    renderMap({ readOnly: true });

    dispatch({ type: "TOGGLE_LAYER_VISIBILITY", payload: { layerId: "a", isVisible: false } });

    expect(screen.queryByTestId("source-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("layer-card")).toHaveTextContent("b");
    expect(state().activeLayer).toBe("b");
  });

  it("waits for the map to load before it frames", () => {
    mocks.fakeMap.loaded.mockReturnValue(false);

    renderMap({ readOnly: true });
    expect(mocks.fakeMap.fitBounds).not.toHaveBeenCalled();

    act(() => emit("load"));

    expect(mocks.fakeMap.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("does not frame after it was left before the map loaded", () => {
    mocks.fakeMap.loaded.mockReturnValue(false);
    const { unmount } = renderMap({ readOnly: true });

    unmount();

    expect(listenerCount("load")).toBe(0);
  });

  describe("cycling through the layers", () => {
    beforeEach(() => vi.useFakeTimers());

    const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
    const cardLayer = () => screen.getByTestId("layer-card").textContent;

    it("moves on to the next layer every 30 seconds, and starts over after the last", () => {
      setLayers(makeLayer("a"), makeLayer("b"), makeLayer("c"));
      renderMap({ readOnly: true });
      expect(cardLayer()).toBe("a");

      tick(29_999);
      expect(cardLayer()).toBe("a");
      tick(1);
      expect(cardLayer()).toBe("b");
      tick(30_000);
      expect(cardLayer()).toBe("c");
      tick(30_000);
      expect(cardLayer()).toBe("a");
    });

    it("frames every layer it comes to", () => {
      setLayers(makeLayer("a", {}, ["a1"]), makeLayer("b", {}, ["b1", "b2", "b3"]));
      renderMap({ readOnly: true });
      mocks.fakeMap.fitBounds.mockClear();

      tick(30_000);

      expect(mocks.fakeMap.fitBounds).toHaveBeenCalledExactlyOnceWith(
        frame(8, 47, 10, 49),
        expect.objectContaining({ animate: true }),
      );
    });

    it("does not cycle with a single layer", () => {
      setLayers(makeLayer("a"));
      renderMap({ readOnly: true });

      tick(120_000);

      expect(cardLayer()).toBe("a");
    });

    it("does not cycle when one kind of layer is the point of the map", () => {
      setLayers(
        makeLayer("a", { kind: "MESSAGE_MAP" }),
        makeLayer("b", { kind: "MESSAGE_MAP", sourceIncidentId: "inc-1", name: "z" }),
      );
      renderMap({ readOnly: true, preferredLayerKind: "MESSAGE_MAP" });
      const first = cardLayer();

      tick(120_000);

      expect(cardLayer()).toBe(first);
    });

    it("stops following when the user moves the map, and resumes on the button", () => {
      setLayers(makeLayer("a"), makeLayer("b"));
      renderMap({ readOnly: true });
      const follow = screen.getByRole("button", { name: en.styleController.autoFrame });
      expect(follow).toHaveAttribute("aria-pressed", "true");
      mocks.fakeMap.fitBounds.mockClear();

      // The map's own fitBounds moves it without a browser event.
      act(() => emit("movestart", {}));
      expect(follow).toHaveAttribute("aria-pressed", "true");

      act(() => emit("movestart", { originalEvent: new MouseEvent("mousedown") }));
      expect(follow).toHaveAttribute("aria-pressed", "false");
      tick(120_000);
      expect(cardLayer()).toBe("a");
      expect(mocks.fakeMap.fitBounds).not.toHaveBeenCalled();

      fireEvent.click(follow);
      expect(follow).toHaveAttribute("aria-pressed", "true");
      expect(mocks.fakeMap.fitBounds).toHaveBeenCalledTimes(1);
      tick(30_000);
      expect(cardLayer()).toBe("b");
    });

    it("stops listening to the map when it goes away", () => {
      const { unmount } = renderMap({ readOnly: true });
      expect(listenerCount("movestart")).toBe(1);

      unmount();

      expect(listenerCount("movestart")).toBe(0);
    });
  });
});

describe("drawing", () => {
  const drawn = (id: string, geometry: Geometry = point(9, 46)): Feature => ({
    type: "Feature",
    id,
    geometry,
    properties: { icon: "x", layerId: "L1", featureId: id, createdAt: "t" },
  });
  const drawing = () => screen.queryByTestId("draw-control");

  describe("when the active layer can be drawn on", () => {
    it.each<[string, MapProps, Partial<Layer>, boolean, Partial<Incident>?]>([
      ["a standard layer of the incident", {}, {}, true],
      ["the message map layer without a message", {}, { kind: "MESSAGE_MAP" }, false],
      [
        "the message map layer for a message",
        { drawingMessage: message },
        { kind: "MESSAGE_MAP" },
        true,
      ],
      [
        "a standard layer for a message, which only draws on the message map",
        { drawingMessage: message },
        {},
        false,
      ],
      [
        "the message map layer for a locked message",
        { drawingMessage: { ...message, locked: true } },
        { kind: "MESSAGE_MAP" },
        false,
      ],
      [
        "a layer shown as of a point in the past",
        { asOf: new Date("2026-01-15T10:00:00Z") },
        {},
        false,
      ],
      [
        "the message map layer of a message shown in the past",
        { drawingMessage: message, asOf: new Date("2026-01-15T10:00:00Z") },
        { kind: "MESSAGE_MAP" },
        true,
      ],
      ["a layer of another incident", {}, { sourceIncidentId: "inc-2" }, false],
    ])("%s", (_name, props, layer, allowed) => {
      setLayers(makeLayer("L1", layer));

      renderMap({ ...props, preferredLayerKind: layer.kind ?? "STANDARD" });
      // A layer of another incident can be selected to look at, but is not drawn on.
      dispatch({ type: "SET_ACTIVE_LAYER", payload: { layerId: "L1" } });

      expect(state().activeLayer).toBe("L1");
      expect(Boolean(drawing())).toBe(allowed);
      expect(screen.queryByTestId("enriched-L1") !== null).toBe(allowed);
      // A layer that cannot be drawn on is shown like any other, instead of vanishing.
      expect(screen.queryByTestId("source-L1") !== null).toBe(!allowed);
    });

    it("does not draw on a closed incident", () => {
      renderMap({}, { closedAt: new Date("2026-01-01T00:00:00Z") });

      expect(drawing()).not.toBeInTheDocument();
      expect(screen.queryByTestId("source-L1")).toBeInTheDocument();
    });
  });

  describe("framing the active layer", () => {
    it("frames the layer once, with room for the controls", () => {
      setLayers(makeLayer("L1", {}, ["a", "b"]));

      const { update } = renderMap();

      expect(mocks.fakeMap.fitBounds).toHaveBeenCalledExactlyOnceWith(
        [
          [8, 47],
          [9, 48],
        ],
        { animate: true, maxZoom: 16, padding: { top: 30, bottom: 30, left: 30, right: 30 } },
      );

      update({});
      expect(mocks.fakeMap.fitBounds).toHaveBeenCalledTimes(1);
    });

    it("waits for the map to load before it frames", () => {
      setLayers(makeLayer("L1", {}, ["a", "b"]));
      mocks.fakeMap.loaded.mockReturnValue(false);

      renderMap();
      expect(mocks.fakeMap.fitBounds).not.toHaveBeenCalled();

      mocks.fakeMap.loaded.mockReturnValue(true);
      act(() => emit("load"));

      expect(mocks.fakeMap.fitBounds).toHaveBeenCalledTimes(1);
    });

    it("frames the next layer when the active layer changes", () => {
      setLayers(makeLayer("L1", {}, ["a"]), makeLayer("L2", {}, ["b", "c"]));
      renderMap();
      mocks.fakeMap.fitBounds.mockClear();

      dispatch({ type: "SET_ACTIVE_LAYER", payload: { layerId: "L2" } });

      expect(mocks.fakeMap.fitBounds).toHaveBeenCalledExactlyOnceWith(
        [
          [8, 47],
          [9, 48],
        ],
        expect.anything(),
      );
    });

    it("frames the drawings of the message map while the layer has nothing of its own", () => {
      setLayers(makeLayer("L1", {}, []), makeLayer("map", { kind: "MESSAGE_MAP" }, ["m1"]));
      renderMap();
      expect(state().activeLayer).toBe("L1");

      expect(mocks.fakeMap.fitBounds).toHaveBeenCalledExactlyOnceWith(
        [
          [8, 47],
          [8, 47],
        ],
        expect.anything(),
      );
    });

    it("does not frame at all while there is nothing to frame", () => {
      setLayers(makeLayer("L1", {}, []));

      renderMap();

      expect(mocks.fakeMap.fitBounds).not.toHaveBeenCalled();
    });

    it("leaves the framing to the message highlight when drawing for a message", () => {
      setLayers(makeLayer("L1", { kind: "MESSAGE_MAP" }, ["a"]));

      renderMap({ drawingMessage: message });

      expect(mocks.fakeMap.fitBounds).not.toHaveBeenCalled();
    });
  });

  describe("events of the draw control, free drawing", () => {
    beforeEach(() => renderMap());

    it("selects what is selected in the draw control, and clears the selection when nothing is", () => {
      call("onSelectionChange", { features: [drawn("d1"), drawn("d2")] });
      expect(state().selectedFeature).toBe("d1");

      call("onSelectionChange", { features: [] });
      expect(state().selectedFeature).toBeUndefined();
    });

    it("keeps a new feature local until it is saved, and selects it", () => {
      call("onCreate", { features: [drawn("d1")] }, "L1");

      expect(state().pendingFeatures).toEqual([
        { id: "d1", layerId: "L1", geometry: point(9, 46), properties: { icon: "x" } },
      ]);
      expect(state().selectedFeature).toBe("d1");
      expect(mocks.addFeature).not.toHaveBeenCalled();
    });

    it("ignores a feature drawn without an active layer", () => {
      call("onCreate", { features: [drawn("d1")] }, undefined);

      expect(state().pendingFeatures).toEqual([]);
    });

    it("changes only the local copy of a feature that is not saved yet", () => {
      call("onCreate", { features: [drawn("d1")] }, "L1");
      const moved = point(10, 46);

      call("onUpdate", { features: [drawn("d1", moved)] });
      expect(state().pendingFeatures[0].geometry).toEqual(moved);

      call("onUpdate", {
        features: [{ ...drawn("d1", point(1, 1)), properties: { icon: "y" } }],
        action: "featureDetail",
      });
      expect(state().pendingFeatures[0].geometry).toEqual(moved);
      expect(state().pendingFeatures[0].properties).toEqual({ icon: "y" });

      call("onUpdate", {
        features: [{ ...drawn("d1", point(2, 2)), properties: { icon: "z" } }],
        action: "reverseDirection",
      });
      expect(state().pendingFeatures[0].geometry).toEqual(point(2, 2));
      expect(state().pendingFeatures[0].properties).toEqual({ icon: "y" });
      expect(mocks.modifyFeature).not.toHaveBeenCalled();
    });

    it("drops the local copy of a feature that is deleted before it is saved", () => {
      call("onCreate", { features: [drawn("d1")] }, "L1");

      call("onDelete", { features: [drawn("d1")] });

      expect(state().pendingFeatures).toEqual([]);
      expect(state().selectedFeature).toBeUndefined();
      expect(mocks.deleteFeature).not.toHaveBeenCalled();
    });

    it.each([
      ["both", undefined, { geometry: point(9, 46), properties: { icon: "x" } }],
      ["featureDetail", "featureDetail", { geometry: undefined, properties: { icon: "x" } }],
      ["reverseDirection", "reverseDirection", { geometry: point(9, 46), properties: undefined }],
    ])("saves what changed on a saved feature (%s)", (_name, action, sparse) => {
      call("onUpdate", { features: [drawn("saved")], action });

      expect(mocks.modifyFeature).toHaveBeenCalledExactlyOnceWith({
        id: "saved",
        ...sparse,
        currentGeometry: point(9, 46),
        currentProperties: { icon: "x" },
        incidentId: "inc-1",
        change: undefined,
        asOf: undefined,
      });
    });

    it("dates a property change with the time it was given", () => {
      const effectiveAt = new Date("2026-01-15T08:30:00Z");

      call("onUpdate", { features: [drawn("saved")], action: "featureDetail", effectiveAt });

      expect(mocks.modifyFeature).toHaveBeenCalledWith(
        expect.objectContaining({ change: { effectiveAt } }),
      );
    });

    it("deletes a saved feature on the server", () => {
      call("onDelete", { features: [drawn("saved")] });

      expect(mocks.deleteFeature).toHaveBeenCalledExactlyOnceWith({
        id: "saved",
        incidentId: "inc-1",
        change: undefined,
        asOf: undefined,
      });
      expect(state().removedFeatures).toEqual([]);
    });

    it("combines features by creating the new ones and deleting the old ones", () => {
      dispatch({ type: "SELECT_FEATURE", payload: { id: "old" } });

      call("onCombine", { createdFeatures: [drawn("new")], deletedFeatures: [drawn("old")] });

      expect(state().pendingFeatures.map((p) => p.id)).toEqual(["new"]);
      expect(mocks.deleteFeature).toHaveBeenCalledWith(expect.objectContaining({ id: "old" }));
      expect(state().selectedFeature).toBeUndefined();
    });
  });

  describe("events of the draw control, drawing for a message", () => {
    const onDrawingChange = vi.fn();
    beforeEach(() => {
      onDrawingChange.mockReset();
      setLayers(makeLayer("L1", { kind: "MESSAGE_MAP" }));
      renderMap({ drawingMessage: message, onDrawingChange });
      dispatch({ type: "SET_DRAW", payload: { draw: fakeDraw() } });
    });

    it("creates a new feature at once, for the message, and removes the draw control's copy", async () => {
      call("onCreate", { features: [drawn("d1")] }, "L1");
      await flush();

      expect(onDrawingChange).toHaveBeenCalledTimes(1);
      expect(mocks.addFeature).toHaveBeenCalledExactlyOnceWith({
        layerId: "L1",
        geometry: point(9, 46),
        clientKey: "d1",
        properties: { icon: "x" },
        incidentId: "inc-1",
        change: { messageId: "msg-1" },
        asOf: undefined,
      });
      expect((state().draw as unknown as { delete: () => void }).delete).toHaveBeenCalledWith([
        "d1",
      ]);
      expect(state().pendingFeatures).toEqual([]);
      expect(state().selectedFeature).toBe("server-id");
    });

    it("shows a feature deleted for the message as a ghost at once", () => {
      call("onDelete", { features: [drawn("old")] });

      expect(onDrawingChange).toHaveBeenCalledTimes(1);
      expect(state().removedFeatures).toEqual([
        {
          id: "old",
          messageId: "msg-1",
          geometry: point(9, 46),
          properties: { icon: "x" },
        },
      ]);
      expect(mocks.deleteFeature).toHaveBeenCalledWith(
        expect.objectContaining({ id: "old", change: { messageId: "msg-1" } }),
      );
    });

    it("leaves no ghost for a feature that was drawn for the message in this session", async () => {
      call("onCreate", { features: [drawn("d1")] }, "L1");
      await flush();

      call("onDelete", { features: [drawn("server-id")] });

      expect(state().removedFeatures).toEqual([]);
      expect(mocks.deleteFeature).toHaveBeenCalledWith(
        expect.objectContaining({ id: "server-id" }),
      );
    });

    it("takes the ghost away again when the deletion fails", async () => {
      mocks.deleteFeature.mockRejectedValue(new Error("nope"));

      call("onDelete", { features: [drawn("old")] });
      await flush();

      expect(state().removedFeatures).toEqual([]);
    });

    it("reports a change of a saved feature and dates it with the message", () => {
      call("onUpdate", { features: [drawn("saved")] });

      expect(onDrawingChange).toHaveBeenCalledTimes(1);
      expect(mocks.modifyFeature).toHaveBeenCalledWith(
        expect.objectContaining({ change: { messageId: "msg-1" } }),
      );
    });
  });

  describe("keeping the draw control in step with the layer", () => {
    it("replaces what the draw control holds by the layer and the pending features", () => {
      setLayers(makeLayer("L1", {}, ["a", "b"]));
      renderMap();
      const control = fakeDraw();

      dispatch({ type: "SET_DRAW", payload: { draw: control } });
      call("onCreate", { features: [drawn("d1")] }, "L1");

      const lastSet = control.set.mock.calls.at(-1)?.[0] as FeatureCollection;
      expect(lastSet.features.map((f) => f.id)).toEqual(["a", "b", "d1"]);
      expect(control.deleteAll).toHaveBeenCalled();
    });

    it("leaves the draw control alone until the map has loaded", () => {
      mocks.fakeMap.loaded.mockReturnValue(false);
      renderMap();
      const control = fakeDraw();

      dispatch({ type: "SET_DRAW", payload: { draw: control } });
      expect(control.set).not.toHaveBeenCalled();
      expect(control.changeMode).not.toHaveBeenCalled();

      mocks.fakeMap.loaded.mockReturnValue(true);
      act(() => emit("load"));

      expect(control.set).toHaveBeenCalled();
    });

    it("keeps the selected feature selected after the reset", () => {
      renderMap();
      const control = fakeDraw();
      control.get.mockImplementation((id: string) => (id === "f1" ? { id } : undefined));
      dispatch({ type: "SET_DRAW", payload: { draw: control } });
      control.changeMode.mockClear();

      dispatch({ type: "SELECT_FEATURE", payload: { id: "f1" } });

      expect(control.changeMode).toHaveBeenCalledWith("simple_select", { featureIds: ["f1"] });
    });

    it("leaves selection mode when nothing is selected", () => {
      renderMap();
      const control = fakeDraw();
      dispatch({ type: "SET_DRAW", payload: { draw: control } });

      expect(control.changeMode).toHaveBeenCalledWith("simple_select");
    });

    it("survives a draw control that throws", () => {
      renderMap();
      const control = fakeDraw();
      control.deleteAll.mockImplementation(() => {
        throw new Error("torn down");
      });

      expect(() => dispatch({ type: "SET_DRAW", payload: { draw: control } })).not.toThrow();
    });

    it("warns about, and leaves alone, a draw control it does not know", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      renderMap();

      dispatch({ type: "SET_DRAW", payload: { draw: { something: "else" } } });

      expect(warn).toHaveBeenCalledWith(
        "Draw control missing get/changeMode; skipping selection sync.",
      );
    });
  });

  describe("the geometry under the cursor", () => {
    const geometries = () =>
      JSON.parse(screen.getByTestId("enriched-L1").getAttribute("data-geometries") ?? "[]");

    function setup() {
      vi.useFakeTimers();
      renderMap();
      const current = { geometry: point(8, 47) };
      const control = {
        deleteAll: vi.fn(),
        set: vi.fn(),
        changeMode: vi.fn(),
        delete: vi.fn(),
        get: vi.fn((): { geometry: Geometry } | undefined => current),
      };
      dispatch({ type: "SET_DRAW", payload: { draw: control } });
      dispatch({ type: "SELECT_FEATURE", payload: { id: "f1" } });

      return { current, control };
    }

    it("enriches the geometry the draw control holds while a vertex is dragged", () => {
      const { current } = setup();
      expect(listenerCount("draw.render")).toBe(1);

      current.geometry = point(8.5, 47.5);
      act(() => emit("draw.render"));
      expect(geometries()).toEqual([point(8.5, 47.5)]);

      current.geometry = point(8.9, 47.9);
      act(() => emit("draw.render"));
      // Throttled: the second render in the same 80 ms comes with the trailing edge.
      expect(geometries()).toEqual([point(8.5, 47.5)]);
      act(() => void vi.advanceTimersByTime(80));
      expect(geometries()).toEqual([point(8.9, 47.9)]);
    });

    it("shows the saved geometry again once the feature is deselected", () => {
      const { current } = setup();
      current.geometry = point(8.5, 47.5);
      act(() => emit("draw.render"));

      dispatch({ type: "DESELECT_FEATURE", payload: null });

      expect(geometries()).toEqual([point(8, 47)]);
      expect(listenerCount("draw.render")).toBe(0);
    });

    it("keeps reading when the draw control is torn down for a moment", () => {
      const { control, current } = setup();
      control.get.mockImplementationOnce(() => {
        throw new Error("torn down");
      });

      expect(() => act(() => emit("draw.render"))).not.toThrow();
      current.geometry = point(8.6, 47.6);
      act(() => void vi.advanceTimersByTime(80));
      act(() => emit("draw.render"));

      expect(geometries()).toEqual([point(8.6, 47.6)]);
    });

    it("does not follow a feature the draw control does not hold", () => {
      const { control } = setup();
      control.get.mockReturnValue(undefined);

      act(() => emit("draw.render"));

      expect(geometries()).toEqual([point(8, 47)]);
    });
  });
});

describe("the draw control's own configuration", () => {
  it("draws with the active layer and the controls of the operator", () => {
    renderMap();

    expect(mocks.drawProps).toMatchObject({
      activeLayer: "L1",
      userProperties: true,
      defaultMode: "simple_select",
      controls: {
        polygon: true,
        trash: true,
        point: true,
        line_string: true,
        combine_features: false,
        uncombine_features: false,
      },
      styles: [{ id: "draw-style" }],
    });
  });
});
