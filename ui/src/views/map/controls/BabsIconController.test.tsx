import { fireEvent, render, screen } from "@testing-library/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../../i18n/locales/de/translations.json";
import { LayerContext, type LayerState } from "../LayerContext";
import { MapTimeContext, type MapTime } from "../MapTimeContext";
import { BabsIconController } from "./BabsIconController";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

const mocks = vi.hoisted(() => ({
  ready: true,
  fireDrawEvent: vi.fn(),
  pending: undefined as unknown,
  fakeMap: { getMap: () => ({ id: "inner-map" }), getBearing: () => 30 },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: lookup,
    i18n: { resolvedLanguage: "de", language: "de" },
  }),
}));
vi.mock("react-map-gl/maplibre", () => ({ useMap: () => ({ current: mocks.fakeMap }) }));
vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => mocks.ready }));
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIconProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  BabsIcon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
  useBabsLang: () => ({ lang: "de", label: (id: string) => `Symbol ${id}` }),
}));
vi.mock("../drawEvents", () => ({ fireDrawEvent: mocks.fireDrawEvent }));
vi.mock("../usePendingFeature", () => ({ usePendingFeature: () => mocks.pending }));

type F = Feature<Geometry, GeoJsonProperties>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ready = true;
  mocks.pending = undefined;
});

describe("BabsIconController", () => {
  const feature: F = {
    type: "Feature",
    id: "f1",
    geometry: { type: "Point", coordinates: [8, 47] },
    properties: { icon: "babsBeschaedigung" },
  };

  function renderController({
    properties = feature.properties,
    geometry = feature.geometry,
    selected = "f1" as string | null,
    time = {},
    pendingFeatures = [] as LayerState["pendingFeatures"],
    draftFeatures = [] as LayerState["draftFeatures"],
  }: {
    properties?: GeoJsonProperties;
    geometry?: Geometry;
    selected?: string | null;
    time?: MapTime;
    pendingFeatures?: LayerState["pendingFeatures"];
    draftFeatures?: LayerState["draftFeatures"];
  } = {}) {
    const state = {
      layers: [
        {
          layer: {
            id: "layer-1",
            features: [{ id: "f1", geometry, properties }],
          },
          isVisible: true,
        },
      ],
      activeLayer: "layer-1",
      selectedFeature: selected ?? undefined,
      pendingFeatures,
      draftFeatures,
    } as unknown as LayerState;

    return render(
      <MapTimeContext.Provider value={time}>
        <LayerContext.Provider value={{ state, dispatch: vi.fn() }}>
          <BabsIconController />
        </LayerContext.Provider>
      </MapTimeContext.Provider>,
    );
  }

  it("shows the panel of the selected feature: its symbol with the form", () => {
    renderController();

    expect(screen.getByTestId("symbol-panel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ändern" })).toBeInTheDocument();
  });

  it("asks a point without a symbol for one first", () => {
    renderController({ properties: {} });

    expect(screen.getByRole("combobox", { name: "Symbol suchen" })).toBeInTheDocument();
  });

  it("offers the types of a line and of an area", () => {
    renderController({
      geometry: {
        type: "LineString",
        coordinates: [
          [8, 47],
          [9, 48],
        ],
      },
      properties: {},
    });
    expect(screen.getByTestId("type-panel")).toBeInTheDocument();
  });

  it("shows nothing when nothing is selected", () => {
    renderController({ selected: null });

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByTestId("symbol-panel")).not.toBeInTheDocument();
  });

  it("shows a saved feature with the changes drafted for it", () => {
    renderController({
      properties: { icon: "babsBeschaedigung" },
      draftFeatures: [{ id: "f1", properties: { icon: "babsBeschaedigung", name: "Entwurf" } }],
    });

    expect(screen.getByDisplayValue("Entwurf")).toBeInTheDocument();
  });

  it("gives an unsaved feature its save actions, and asks for the time it is saved with", () => {
    mocks.pending = { saving: false, onSave: vi.fn(), onDiscard: vi.fn() };
    renderController({ properties: {} });

    expect(screen.getByRole("button", { name: "Verwerfen" })).toBeInTheDocument();
  });

  it("lets a saved feature on the free map be given any time up to now: no earliest, a latest", () => {
    renderController();

    const time = screen.getByLabelText("Gültig ab");
    expect(time).not.toHaveAttribute("min");
    expect(time).toHaveAttribute("max");
  });

  it.each([
    ["looking at the past", { asOf: new Date("2026-01-01T09:00:00Z") }],
    ["drawing for a message", { drawingMessage: { id: "m", time: new Date() } }],
  ])("takes the time from the map when %s", (_name, time) => {
    renderController({ time });

    expect(screen.queryByLabelText("Gültig ab")).not.toBeInTheDocument();
  });

  it("keeps a change made in the panel as a draft, and sends it when saved", () => {
    renderController({ properties: { icon: "babsBeschaedigung" } });
    mocks.fireDrawEvent.mockClear();

    // the rotation lock is a change; it is not sent yet
    fireEvent.click(screen.getByRole("button", { name: "Signatur fixieren" }));
    expect(mocks.fireDrawEvent).toHaveBeenCalledWith(
      { id: "inner-map" },
      "draw.update",
      expect.objectContaining({ draft: true }),
    );

    // the save button is
    fireEvent.click(screen.getByRole("button", { name: "speichern" }));
    expect(mocks.fireDrawEvent).toHaveBeenLastCalledWith(
      { id: "inner-map" },
      "draw.update",
      expect.objectContaining({ draft: false, save: true }),
    );
  });
});
