import { getIcon } from "@f-eld-ch/babs-core";
import { KEMLER_CODES } from "@f-eld-ch/babs-core/kemler-codes";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aliasFor } from "components/babs/iconResolver";
import de from "../../../i18n/locales/de/translations.json";
import { LayerContext, type LayerState } from "../LayerContext";
import { FeatureLabelPopup, type PendingFeatureActions } from "./FeatureLabelPopup";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

const mocks = vi.hoisted(() => ({
  map: undefined as Record<string, unknown> | undefined,
  dispatch: undefined as unknown,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: lookup,
    i18n: { resolvedLanguage: "de", language: "de" },
  }),
}));
vi.mock("react-map-gl/maplibre", () => ({
  useMap: () => ({ current: mocks.map }),
  Popup: ({
    children,
    longitude,
    latitude,
    anchor,
  }: {
    children: ReactNode;
    longitude: number;
    latitude: number;
    anchor: string;
  }) => (
    <div
      data-testid="popup"
      data-popup="feature-label"
      data-lng={longitude}
      data-lat={latitude}
      data-anchor={anchor}
    >
      {children}
    </div>
  ),
}));

type F = Feature<Geometry, GeoJsonProperties>;

const point = (properties: GeoJsonProperties): F => ({
  type: "Feature",
  id: "f1",
  geometry: { type: "Point", coordinates: [8, 47] },
  properties,
});
const line = (properties: GeoJsonProperties): F => ({
  type: "Feature",
  id: "f1",
  geometry: {
    type: "LineString",
    coordinates: [
      [8, 47],
      [9, 48],
    ],
  },
  properties,
});
const polygon = (properties: GeoJsonProperties): F => ({
  type: "Feature",
  id: "f1",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [8, 47],
        [9, 47],
        [9, 48],
        [8, 47],
      ],
    ],
  },
  properties,
});

const onUpdate = vi.fn();
const dispatch = vi.fn();

function renderPopup(
  feature: F,
  extra: { pending?: PendingFeatureActions; changeTime?: { earliest?: Date } } = {},
) {
  const state = { layers: [], pendingFeatures: [], removedFeatures: [] } as unknown as LayerState;
  const tree = (f: F) => (
    <LayerContext.Provider value={{ state, dispatch }}>
      <FeatureLabelPopup selectedFeature={f} onUpdate={onUpdate} {...extra} />
    </LayerContext.Provider>
  );
  const result = render(tree(feature));
  return { ...result, rerenderWith: (f: F) => result.rerender(tree(f)) };
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "speichern" }));
const label = (text: string) => screen.getByLabelText(text) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.map = undefined;
});

describe("FeatureLabelPopup title", () => {
  it("names a point after its symbol in the catalogue", () => {
    renderPopup(point({ icon: aliasFor("1101") }));

    expect(screen.getByText(getIcon("1101").labels.de)).toBeInTheDocument();
  });

  it("names a zone after its type", () => {
    renderPopup(polygon({ zoneType: "Schadengebiet" }));

    expect(screen.getByText(getIcon("1114").labels.de)).toBeInTheDocument();
  });

  it("names a line after its type", () => {
    renderPopup(line({ lineType: "Rutschgebiet" }));

    expect(screen.getByText(getIcon("1113").labels.de)).toBeInTheDocument();
  });

  it("shows the stored type for one the catalogue does not know", () => {
    renderPopup(line({ lineType: "Frontline" }));

    expect(screen.getByText("Frontline")).toBeInTheDocument();
  });
});

describe("FeatureLabelPopup fields", () => {
  it("asks for a description for an ordinary symbol", () => {
    renderPopup(point({ icon: aliasFor("1101"), name: "Mitte" }));

    expect(label("Beschreibung / Details")).toHaveValue("Mitte");
  });

  it("asks for a number of people for a casualty symbol", () => {
    renderPopup(point({ icon: aliasFor("1301") }));

    expect(label("Anzahl Personen")).toBeInTheDocument();
  });

  it("annotates a formation in three positions", () => {
    renderPopup(point({ icon: aliasFor("4101"), nameLeft: "L", name: "M", nameRight: "R" }));

    expect(label("Nähere Kennzeichnung")).toHaveValue("L");
    expect(label("Ortsbezeichnung")).toHaveValue("M");
    expect(label("Zusatzangaben")).toHaveValue("R");
  });

  it("saves the entered values, leaves out the empty ones and closes", () => {
    renderPopup(point({ icon: aliasFor("4101"), nameLeft: "L", name: "M", nameRight: "R" }));

    fireEvent.change(label("Ortsbezeichnung"), { target: { value: "Bern" } });
    fireEvent.change(label("Zusatzangaben"), { target: { value: "" } });
    save();

    expect(onUpdate).toHaveBeenCalledWith({
      features: [
        { ...point({}), properties: { icon: aliasFor("4101"), nameLeft: "L", name: "Bern" } },
      ],
      action: "featureDetail",
      effectiveAt: undefined,
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "DESELECT_FEATURE", payload: null });
  });

  it("saves with Enter and closes without saving with Escape", () => {
    renderPopup(point({ icon: aliasFor("1101") }));
    const input = label("Beschreibung / Details");

    fireEvent.change(input, { target: { value: "x" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "DESELECT_FEATURE", payload: null });

    dispatch.mockClear();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "DESELECT_FEATURE", payload: null });
  });

  it("closes with the close button without saving", () => {
    renderPopup(point({ icon: aliasFor("1101") }));

    fireEvent.click(screen.getByRole("button", { name: "schliessen" }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "DESELECT_FEATURE", payload: null });
  });
});

describe("FeatureLabelPopup hazard sign", () => {
  const code = KEMLER_CODES[1];
  const unSign = () => point({ icon: `un:${code}`, name: "1203", stoffbezeichnung: "Benzin" });

  it("shows the Kemler number, UN number and substance of the sign", () => {
    renderPopup(unSign());

    expect(label("Gefahrennummer")).toHaveValue(code);
    expect(label("Stoffnummer")).toHaveValue("1203");
    expect(label("Stoffnummer")).toHaveAttribute("maxlength", "4");
    expect(label("Stoffbezeichnung")).toHaveValue("Benzin");
  });

  it("stores the Kemler number in the icon and the UN number as the name", () => {
    renderPopup(unSign());

    fireEvent.change(label("Gefahrennummer"), { target: { value: KEMLER_CODES[2] } });
    fireEvent.change(label("Stoffnummer"), { target: { value: "1993" } });
    save();

    expect(onUpdate.mock.calls[0][0].features[0].properties).toEqual({
      icon: `un:${KEMLER_CODES[2]}`,
      name: "1993",
      stoffbezeichnung: "Benzin",
    });
  });

  it("falls back to the plain sign without a Kemler number", () => {
    renderPopup(unSign());

    fireEvent.change(label("Gefahrennummer"), { target: { value: "" } });
    save();

    expect(onUpdate.mock.calls[0][0].features[0].properties.icon).toBe("2109a");
  });
});

describe("FeatureLabelPopup rotation", () => {
  beforeEach(() => {
    mocks.map = {
      getBearing: () => 30,
      getPitch: () => 0,
      project: ([lng, lat]: [number, number]) => ({ x: lng, y: lat }),
      fitBounds: vi.fn(),
      getContainer: () => ({ clientWidth: 2000, clientHeight: 2000 }),
    };
  });

  it("fixes the symbol to the map's current bearing", () => {
    renderPopup(point({ icon: aliasFor("1101") }));

    fireEvent.click(screen.getByRole("button", { name: "Signatur fixieren" }));

    expect(onUpdate).toHaveBeenCalledWith({
      features: [{ ...point({}), properties: { icon: aliasFor("1101"), iconRotation: 30 } }],
      action: "featureDetail",
    });
    expect(screen.getByRole("slider", { name: "Drehung" })).toHaveValue("30");
  });

  it("turns a fixed symbol with the slider and releases it again", () => {
    renderPopup(point({ icon: aliasFor("1101"), iconRotation: 90 }));

    fireEvent.change(screen.getByRole("slider", { name: "Drehung" }), { target: { value: "120" } });
    expect(onUpdate.mock.calls[0][0].features[0].properties.iconRotation).toBe(120);

    fireEvent.click(screen.getByRole("button", { name: "Fixierte Signatur lösen" }));

    const properties = onUpdate.mock.calls[1][0].features[0].properties;
    expect(properties).toEqual({ icon: aliasFor("1101") });
    expect(screen.getByRole("button", { name: "Signatur fixieren" })).toBeInTheDocument();
  });

  it("does not fix a symbol without a map", () => {
    mocks.map = undefined;
    renderPopup(point({ icon: aliasFor("1101") }));

    fireEvent.click(screen.getByRole("button", { name: "Signatur fixieren" }));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["a formation", point({ icon: aliasFor("4101") })],
    ["a casualty symbol", point({ icon: aliasFor("1301") })],
    ["a line", line({ lineType: "Rutschgebiet" })],
    ["a zone", polygon({ zoneType: "Schadengebiet" })],
  ])("offers no rotation for %s", (_name, feature) => {
    renderPopup(feature);

    expect(screen.queryByRole("button", { name: "Signatur fixieren" })).not.toBeInTheDocument();
  });

  it("keeps the rotation of a symbol when its text is saved", () => {
    renderPopup(point({ icon: aliasFor("1101"), iconRotation: 45 }));

    fireEvent.change(label("Beschreibung / Details"), { target: { value: "x" } });
    save();

    expect(onUpdate.mock.calls[0][0].features[0].properties).toMatchObject({ iconRotation: 45 });
  });
});

describe("FeatureLabelPopup reversing a line", () => {
  it("reverses the coordinates of a directional line", () => {
    renderPopup(line({ lineType: "Rutschgebiet" }));

    fireEvent.click(screen.getByRole("button", { name: "Richtung drehen" }));

    expect(onUpdate).toHaveBeenCalledWith({
      features: [
        {
          ...line({ lineType: "Rutschgebiet" }),
          geometry: {
            type: "LineString",
            coordinates: [
              [9, 48],
              [8, 47],
            ],
          },
        },
      ],
      action: "reverseDirection",
    });
  });

  it("offers it for no other line", () => {
    renderPopup(line({ lineType: "Frontline" }));

    expect(screen.queryByRole("button", { name: "Richtung drehen" })).not.toBeInTheDocument();
  });
});

describe("FeatureLabelPopup time", () => {
  const earliest = new Date(2026, 0, 1, 8, 0);

  it("does not ask for a time for a feature that is saved and changed as of now", () => {
    renderPopup(point({ icon: aliasFor("1101") }));

    expect(screen.queryByLabelText("Gültig ab")).not.toBeInTheDocument();
  });

  it("changes a saved feature as of now unless another time is picked", () => {
    renderPopup(point({ icon: aliasFor("1101") }), { changeTime: { earliest } });

    expect(label("Gültig ab")).toHaveAttribute("min", "2026-01-01T08:00");
    save();

    expect(onUpdate.mock.calls[0][0].effectiveAt).toBeUndefined();
  });

  it("changes a saved feature as of the picked time", () => {
    renderPopup(point({ icon: aliasFor("1101") }), { changeTime: { earliest } });

    fireEvent.change(label("Gültig ab"), { target: { value: "2026-01-02T09:30" } });
    save();

    expect(onUpdate.mock.calls[0][0].effectiveAt).toEqual(new Date("2026-01-02T09:30"));
  });

  it("ignores an unreadable time", () => {
    renderPopup(point({ icon: aliasFor("1101") }), { changeTime: { earliest } });

    fireEvent.change(label("Gültig ab"), { target: { value: "" } });
    save();

    expect(onUpdate.mock.calls[0][0].effectiveAt).toBeUndefined();
  });
});

describe("FeatureLabelPopup unsaved feature", () => {
  const pendingActions = (over: Partial<PendingFeatureActions> = {}): PendingFeatureActions => ({
    saving: false,
    earliest: new Date(2026, 0, 1, 8, 0),
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    ...over,
  });

  it("creates the feature on save instead of updating it, and stays open", () => {
    const pending = pendingActions();
    renderPopup(point({ icon: aliasFor("1101") }), { pending });

    expect(screen.getByText(de.mapview.pending.hint)).toBeInTheDocument();
    fireEvent.change(label("Beschreibung / Details"), { target: { value: "Neu" } });
    save();

    expect(pending.onSave).toHaveBeenCalledWith({ icon: aliasFor("1101"), name: "Neu" }, undefined);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("saves it as of the picked time", () => {
    const pending = pendingActions();
    renderPopup(point({ icon: aliasFor("1101") }), { pending });

    fireEvent.change(label("Zeitpunkt"), { target: { value: "2026-01-02T09:30" } });
    save();

    expect(pending.onSave).toHaveBeenCalledWith(
      { icon: aliasFor("1101") },
      new Date("2026-01-02T09:30"),
    );
  });

  it("can be discarded", () => {
    const pending = pendingActions();
    renderPopup(point({ icon: aliasFor("1101") }), { pending });

    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));

    expect(pending.onDiscard).toHaveBeenCalledTimes(1);
  });

  it("shows why saving failed", () => {
    renderPopup(point({ icon: aliasFor("1101") }), {
      pending: pendingActions({ error: "Keine Berechtigung" }),
    });

    expect(screen.getByText("Keine Berechtigung")).toBeInTheDocument();
  });

  it("cannot be saved or discarded twice while saving", () => {
    renderPopup(point({ icon: aliasFor("1101") }), { pending: pendingActions({ saving: true }) });

    expect(screen.getByRole("button", { name: "speichern" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verwerfen" })).toBeDisabled();
  });
});

describe("FeatureLabelPopup form state", () => {
  it("resets the form when the feature changes on the server", () => {
    const { rerenderWith } = renderPopup(point({ icon: aliasFor("1101"), name: "Alt" }));
    fireEvent.change(label("Beschreibung / Details"), { target: { value: "Tippen" } });

    rerenderWith(point({ icon: aliasFor("1101"), name: "Neu" }));

    expect(label("Beschreibung / Details")).toHaveValue("Neu");
  });
});

describe("FeatureLabelPopup placement", () => {
  it("opens a point's popup above its symbol", () => {
    renderPopup(point({ icon: aliasFor("1101") }));

    const popup = screen.getByTestId("popup");
    expect(popup).toHaveAttribute("data-anchor", "bottom");
    expect(popup).toHaveAttribute("data-lng", "8");
    expect(popup).toHaveAttribute("data-lat", "47");
  });

  it("opens a line's popup to the right of its rightmost point", () => {
    mocks.map = {
      project: ([lng, lat]: [number, number]) => ({ x: lng * 100, y: lat }),
      getContainer: () => ({ clientWidth: 2000, clientHeight: 2000 }),
      getBearing: () => 0,
      getPitch: () => 0,
      fitBounds: vi.fn(),
    };

    renderPopup(line({ lineType: "Rutschgebiet" }));

    const popup = screen.getByTestId("popup");
    expect(popup).toHaveAttribute("data-anchor", "left");
    expect(popup).toHaveAttribute("data-lng", "9");
    expect(popup).toHaveAttribute("data-lat", "48");
  });

  it("opens a line's popup at the middle of the right edge of its box without a map", () => {
    renderPopup(line({ lineType: "Rutschgebiet" }));

    const popup = screen.getByTestId("popup");
    expect(popup).toHaveAttribute("data-anchor", "left");
    expect(popup).toHaveAttribute("data-lng", "9");
    expect(popup).toHaveAttribute("data-lat", "47.5");
  });

  describe("keeping the popup in view", () => {
    const fitBounds = vi.fn();
    const panBy = vi.fn();
    let project: (p: [number, number]) => { x: number; y: number };
    let popupRect: Partial<DOMRect>;

    beforeEach(() => {
      vi.useFakeTimers();
      project = ([lng, lat]) => ({ x: lng * 10, y: lat * 10 });
      popupRect = { left: 100, right: 300, top: 100, bottom: 300 };
      mocks.map = {
        project: (p: [number, number]) => project(p),
        fitBounds,
        panBy,
        getBearing: () => 15,
        getPitch: () => 5,
        getContainer: () => ({
          clientWidth: 1000,
          clientHeight: 800,
          getBoundingClientRect: () => ({ left: 0, right: 1000, top: 0, bottom: 800 }),
          querySelector: () => ({ getBoundingClientRect: () => popupRect }),
        }),
      };
    });

    afterEach(() => vi.useRealTimers());

    const settle = () => act(() => vi.advanceTimersByTime(50));

    it("leaves a popup that fits where it is", () => {
      renderPopup(point({ icon: aliasFor("1101") }));
      settle();

      expect(panBy).not.toHaveBeenCalled();
    });

    it.each([
      ["left", { left: -20, right: 180 }, [36, 0]],
      ["right", { left: 850, right: 1050 }, [-66, 0]],
      ["top", { top: -20, bottom: 180 }, [0, 36]],
      ["bottom", { top: 700, bottom: 900 }, [0, -116]],
    ] as const)("pans back a popup that sticks out at the %s", (_edge, rect, [dx, dy]) => {
      popupRect = { ...popupRect, ...rect };

      renderPopup(point({ icon: aliasFor("1101") }));
      settle();

      // the map moves opposite to the correction the popup needs
      expect(panBy).toHaveBeenCalledWith([-dx, -dy], { duration: 300 });
    });

    it("frames a line that is out of view, keeping bearing and pitch", () => {
      project = () => ({ x: -50, y: -50 });

      renderPopup(line({ lineType: "Rutschgebiet" }));

      expect(fitBounds).toHaveBeenCalledWith(
        [
          [8, 47],
          [9, 48],
        ],
        { padding: { top: 60, right: 340, bottom: 60, left: 60 }, bearing: 15, pitch: 5 },
      );
    });

    it("frames a line whose popup would not fit to the right", () => {
      project = ([lng]) => ({ x: lng === 9 ? 900 : 800, y: 100 });

      renderPopup(line({ lineType: "Rutschgebiet" }));

      expect(fitBounds).toHaveBeenCalledTimes(1);
    });

    it("leaves a line that is in view with room for the popup", () => {
      renderPopup(line({ lineType: "Rutschgebiet" }));

      expect(fitBounds).not.toHaveBeenCalled();
    });
  });
});

describe("FeatureLabelPopup moving the flow arrow of a flooded area", () => {
  const ring = [
    [8, 47],
    [8.1, 47],
    [8.1, 47.1],
    [8, 47.1],
    [8, 47],
  ];
  const flooded = (zoneType: string, arrowAt?: number): F => ({
    type: "Feature",
    id: "z1",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: { zoneType, ...(arrowAt === undefined ? {} : { arrowAt }) },
  });

  it("offers the same slider as a line, starting at the default position", () => {
    renderPopup(flooded("UeberschwemmtesGebiet"));

    const slider = screen.getByLabelText(/Pfeilposition/);
    // the middle of the closing (western) edge of the square, drawn as a curve: about 86% round
    expect(slider).toHaveValue("86");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "100");
  });

  it("stores where the arrow is as a fraction, and nothing for the default", () => {
    renderPopup(flooded("UeberschwemmtesGebiet"));

    fireEvent.change(screen.getByLabelText(/Pfeilposition/), { target: { value: "25" } });
    expect(onUpdate.mock.calls[0][0].action).toBe("featureDetail");
    expect(onUpdate.mock.calls[0][0].features[0].properties).toMatchObject({ arrowAt: 0.25 });
    // the geometry is left alone
    expect(onUpdate.mock.calls[0][0].features[0].geometry.coordinates[0]).toEqual(ring);

    fireEvent.change(screen.getByLabelText(/Pfeilposition/), { target: { value: "86" } });
    expect(onUpdate.mock.calls[1][0].features[0].properties).not.toHaveProperty("arrowAt");
  });

  it("shows the stored position", () => {
    renderPopup(flooded("UeberschwemmtesGebiet", 0.3));
    expect(screen.getByLabelText(/Pfeilposition/)).toHaveValue("30");
  });

  it("offers it for no zone without a flow arrow", () => {
    renderPopup(flooded("Einsatzraum"));
    expect(screen.queryByLabelText(/Pfeilposition/)).not.toBeInTheDocument();
  });
});

describe("FeatureLabelPopup moving the slide arrow", () => {
  const slide = (arrowAt?: number): F =>
    line({ lineType: "Rutschgebiet", ...(arrowAt === undefined ? {} : { arrowAt }) });

  it("offers a slider at the middle for a line with a slide arrow", () => {
    renderPopup(slide());

    expect(screen.getByLabelText(/Pfeilposition/)).toHaveValue("50");
  });

  it("stores where the arrow is as a fraction, and nothing for the middle", () => {
    renderPopup(slide());

    fireEvent.change(screen.getByLabelText(/Pfeilposition/), { target: { value: "25" } });
    expect(onUpdate.mock.calls[0][0].action).toBe("featureDetail");
    expect(onUpdate.mock.calls[0][0].features[0].properties).toMatchObject({ arrowAt: 0.25 });

    fireEvent.change(screen.getByLabelText(/Pfeilposition/), { target: { value: "50" } });
    expect(onUpdate.mock.calls[1][0].features[0].properties).not.toHaveProperty("arrowAt");
  });

  it("shows the stored position", () => {
    renderPopup(slide(0.8));
    expect(screen.getByLabelText(/Pfeilposition/)).toHaveValue("80");
  });

  it("offers it for no other line", () => {
    renderPopup(line({ lineType: "Frontline" }));
    expect(screen.queryByLabelText(/Pfeilposition/)).not.toBeInTheDocument();
  });
});
