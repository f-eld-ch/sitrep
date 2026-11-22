import { getGroup } from "@f-eld-ch/babs-core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aliasFor } from "components/babs/iconResolver";
import { ColorForCategory, LineTypes, ZoneTypes } from "components/babs/lineAndZoneTypes";
import { IncidentContext } from "utils";
import de from "../../../i18n/locales/de/translations.json";
import { LayerContext, type LayerState } from "../LayerContext";
import { MapTimeContext, type MapTime } from "../MapTimeContext";
import {
  BabsIconController,
  FeatureDetailControlPanel,
  IconController,
  LineController,
  ZoneController,
} from "./BabsIconController";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

const mocks = vi.hoisted(() => ({
  ready: true,
  iconPickerV2: false,
  fireDrawEvent: vi.fn(),
  pending: undefined as unknown,
  popup: { current: undefined as Record<string, unknown> | undefined },
  fakeMap: { getMap: () => ({ id: "inner-map" }) },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: lookup,
    i18n: { resolvedLanguage: "de", language: "de" },
  }),
}));
vi.mock("@openfeature/react-sdk", () => ({
  useBooleanFlagValue: (key: string) => key === "icon-picker-v2" && mocks.iconPickerV2,
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
vi.mock("./FeatureLabelPopup", () => ({
  FeatureLabelPopup: (props: Record<string, unknown>) => {
    mocks.popup.current = props;
    return <div data-testid="popup" />;
  },
}));

type F = Feature<Geometry, GeoJsonProperties>;

const point = (properties: GeoJsonProperties = {}): F => ({
  type: "Feature",
  id: "f1",
  geometry: { type: "Point", coordinates: [8, 47] },
  properties,
});
const line = (properties: GeoJsonProperties = {}): F => ({
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
const polygon = (type: "Polygon" | "MultiPolygon" = "Polygon"): F => ({
  type: "Feature",
  id: "f1",
  geometry:
    type === "Polygon"
      ? {
          type,
          coordinates: [
            [
              [8, 47],
              [9, 47],
              [9, 48],
              [8, 47],
            ],
          ],
        }
      : {
          type,
          coordinates: [
            [
              [
                [8, 47],
                [9, 47],
                [9, 48],
                [8, 47],
              ],
            ],
          ],
        },
  properties: {},
});

const onUpdate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ready = true;
  mocks.iconPickerV2 = false;
  mocks.pending = undefined;
  mocks.popup.current = undefined;
});

describe("IconController", () => {
  const renderIcons = (feature: F | undefined) =>
    render(<IconController selectedFeature={feature} onUpdate={onUpdate} />);

  it.each([
    ["no feature", undefined],
    ["a line", line()],
    ["a polygon", polygon()],
  ])("offers no icons for %s", (_name, feature) => {
    const { container } = renderIcons(feature);

    expect(container).toBeEmptyDOMElement();
  });

  it("waits for the icon catalogue", () => {
    mocks.ready = false;

    const { container } = renderIcons(point());

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector("i")).toBeNull();
  });

  it("offers every category as a collapsed button", () => {
    renderIcons(point());

    const buttons = screen.getAllByRole("button");
    // the catalogue has nine categories; the ones the picker does not own are left out
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    expect(buttons.every((b) => b.querySelector("i[data-icon]"))).toBe(true);
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toContain("Auswirkungen");
  });

  it("opens a category and places an icon with its alias and the colour of the category", () => {
    renderIcons(point({ name: "Mitte", iconRotation: 45 }));

    fireEvent.click(screen.getByRole("button", { name: "Auswirkungen" }));
    fireEvent.click(screen.getByTitle("Symbol 1101"));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      features: [
        {
          ...point(),
          properties: {
            name: "Mitte",
            iconRotation: 45,
            icon: aliasFor("1101"),
            color: ColorForCategory["1"],
          },
        },
      ],
      action: "featureDetail",
    });
    // the picker folds back into its collapsed state
    expect(screen.queryByTitle("Symbol 1101")).not.toBeInTheDocument();
  });

  it("drops the rotation for an icon that must stay upright", () => {
    renderIcons(point({ iconRotation: 45 }));

    fireEvent.click(screen.getByRole("button", { name: "Fahrzeuge" }));
    fireEvent.click(within(document.body).getAllByTitle(/^Symbol 7/)[0]);

    const [{ features }] = onUpdate.mock.calls[0];
    expect(features[0].properties).not.toHaveProperty("iconRotation");
  });

  it("clears the labels the new icon has no field for", () => {
    renderIcons(point({ nameLeft: "links", name: "mitte", nameRight: "rechts" }));

    // category 1 annotates only below the icon
    fireEvent.click(screen.getByRole("button", { name: "Auswirkungen" }));
    fireEvent.click(screen.getByTitle("Symbol 1101"));

    const [{ features }] = onUpdate.mock.calls[0];
    expect(features[0].properties).toMatchObject({ name: "mitte" });
    expect(features[0].properties).not.toHaveProperty("nameLeft");
    expect(features[0].properties).not.toHaveProperty("nameRight");
  });

  it("goes back from an open category without placing anything", () => {
    renderIcons(point());
    fireEvent.click(screen.getByRole("button", { name: "Auswirkungen" }));

    fireEvent.click(screen.getByRole("button", { name: "Zurück" }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Auswirkungen" })).toBeInTheDocument();
  });

  describe("a category with groups (Formationen)", () => {
    const openFormations = () =>
      fireEvent.click(screen.getByRole("button", { name: "Formationen" }));

    it("first offers the groups, named after the group rather than the symbol", () => {
      renderIcons(point());

      openFormations();

      expect(screen.getByRole("button", { name: getGroup("41").labels.de })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: getGroup("42").labels.de })).toBeInTheDocument();
    });

    it("places an icon from the chosen group, led by the group's own symbol", () => {
      renderIcons(point());
      openFormations();

      fireEvent.click(screen.getByRole("button", { name: getGroup("41").labels.de }));
      const icons = screen.getAllByTitle(/^Symbol /).map((b) => b.getAttribute("title"));
      expect(icons[0]).toBe("Symbol 4701");

      fireEvent.click(screen.getByTitle("Symbol 4101"));

      const [{ features, action }] = onUpdate.mock.calls[0];
      expect(action).toBe("featureDetail");
      expect(features[0].properties).toMatchObject({
        icon: aliasFor("4101"),
        color: ColorForCategory["4"],
      });
    });

    it("steps back one level at a time", () => {
      renderIcons(point());
      openFormations();
      fireEvent.click(screen.getByRole("button", { name: getGroup("41").labels.de }));

      // group -> list of groups
      fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
      expect(screen.getByRole("button", { name: getGroup("42").labels.de })).toBeInTheDocument();

      // list of groups -> collapsed
      fireEvent.click(screen.getByRole("button", { name: "Zurück" }));
      expect(screen.getByRole("button", { name: "Formationen" })).toBeInTheDocument();
    });
  });
});

describe.each([
  ["LineController", LineController, line(), LineTypes, "lineType"],
  ["ZoneController", ZoneController, polygon(), ZoneTypes, "zoneType"],
] as const)("%s", (_name, Controller, feature, types, property) => {
  const entries = Object.values(types);

  it("offers every type and applies the chosen one with its colour", () => {
    render(<Controller selectedFeature={feature} onUpdate={onUpdate} />);

    expect(screen.getAllByRole("button")).toHaveLength(entries.length);

    const target = entries[0];
    fireEvent.click(screen.getByTitle(`Symbol ${target.thumbnail}`));

    expect(onUpdate).toHaveBeenCalledWith({
      features: [{ ...feature, properties: { [property]: target.name, color: target.color } }],
      action: "featureDetail",
    });
  });

  it("keeps the other properties of the feature", () => {
    const named = { ...feature, properties: { name: "Damm", color: "#123456" } };
    render(<Controller selectedFeature={named} onUpdate={onUpdate} />);

    const target = entries[1];
    fireEvent.click(screen.getByTitle(`Symbol ${target.thumbnail}`));

    expect(onUpdate.mock.calls[0][0].features[0].properties).toEqual({
      name: "Damm",
      [property]: target.name,
      color: target.color,
    });
  });

  it("offers nothing while the catalogue is loading", () => {
    mocks.ready = false;

    render(<Controller selectedFeature={feature} onUpdate={onUpdate} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("offers nothing without a feature or for a point", () => {
    const { rerender } = render(<Controller selectedFeature={undefined} onUpdate={onUpdate} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    rerender(<Controller selectedFeature={point()} onUpdate={onUpdate} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("ZoneController geometries", () => {
  it("also offers zones for a multi polygon", () => {
    render(<ZoneController selectedFeature={polygon("MultiPolygon")} onUpdate={onUpdate} />);

    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("offers nothing for a line", () => {
    render(<ZoneController selectedFeature={line()} onUpdate={onUpdate} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("FeatureDetailControlPanel", () => {
  const open = () => fireEvent.click(screen.getByRole("button"));

  it("renders nothing without a feature or for a line", () => {
    const { container, rerender } = render(
      <FeatureDetailControlPanel selectedFeature={undefined} onUpdate={onUpdate} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<FeatureDetailControlPanel selectedFeature={line()} onUpdate={onUpdate} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens a name field with the current name and saves what is entered", () => {
    render(
      <FeatureDetailControlPanel selectedFeature={point({ name: "Alt" })} onUpdate={onUpdate} />,
    );
    open();

    const input = screen.getByPlaceholderText("Name");
    expect(input).toHaveValue("Alt");
    fireEvent.change(input, { target: { value: "Neu" } });
    fireEvent.click(screen.getByRole("button", { name: "speichern" }));

    expect(onUpdate).toHaveBeenCalledWith({
      features: [{ ...point(), properties: { name: "Neu" } }],
      action: "featureDetail",
    });
  });

  it("saves with Enter, and an emptied name removes the label", () => {
    render(
      <FeatureDetailControlPanel selectedFeature={point({ name: "Alt" })} onUpdate={onUpdate} />,
    );
    open();

    const input = screen.getByPlaceholderText("Name");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "a" });
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onUpdate).toHaveBeenCalledWith({
      features: [{ ...point(), properties: {} }],
      action: "featureDetail",
    });
  });
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
    children,
  }: {
    properties?: GeoJsonProperties;
    geometry?: Geometry;
    selected?: string | null;
    time?: MapTime;
    pendingFeatures?: LayerState["pendingFeatures"];
    children?: ReactNode;
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
    } as unknown as LayerState;

    return render(
      <IncidentContext.Provider
        value={
          {
            state: { incident: { createdAt: new Date("2026-01-01T08:00:00Z") }, loadedForId: "i" },
            dispatch: vi.fn(),
          } as never
        }
      >
        <MapTimeContext.Provider value={time}>
          <LayerContext.Provider value={{ state, dispatch: vi.fn() }}>
            <BabsIconController />
            {children}
          </LayerContext.Provider>
        </MapTimeContext.Provider>
      </IncidentContext.Provider>,
    );
  }

  it("shows the picker for the selected point", () => {
    renderController();

    expect(screen.getByRole("button", { name: "Auswirkungen" })).toBeInTheDocument();
  });

  it("offers the searchable symbol panel instead of the category overlay when the flag is on", () => {
    mocks.iconPickerV2 = true;
    renderController({ properties: {} });

    expect(screen.getByTestId("symbol-panel")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Symbol suchen" })).toBeInTheDocument();
  });

  it("offers the type panel for a line, and no popup, when the flag is on", () => {
    mocks.iconPickerV2 = true;
    renderController({
      properties: { lineType: "Rutschgebiet" },
      geometry: {
        type: "LineString",
        coordinates: [
          [8, 47],
          [9, 48],
        ],
      },
    });

    expect(screen.queryByTestId("symbol-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("type-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("popup")).not.toBeInTheDocument();
  });

  it("shows no picker and no popup when nothing is selected", () => {
    renderController({ selected: null });

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByTestId("popup")).not.toBeInTheDocument();
  });

  it("opens the label popup for a feature that has its type", () => {
    renderController();

    expect(screen.getByTestId("popup")).toBeInTheDocument();
    expect(mocks.popup.current?.selectedFeature).toMatchObject({ id: "f1" });
  });

  it("holds the popup back until the feature has a type", () => {
    renderController({ properties: {} });

    expect(screen.queryByTestId("popup")).not.toBeInTheDocument();
  });

  it("gives an unsaved feature the popup at once, with its save actions", () => {
    const actions = { saving: false, onSave: vi.fn(), onDiscard: vi.fn() };
    mocks.pending = actions;

    renderController({ properties: {} });

    expect(screen.getByTestId("popup")).toBeInTheDocument();
    expect(mocks.popup.current?.pending).toBe(actions);
    // a pending feature takes the time it is saved with, not a change time
    expect(mocks.popup.current?.changeTime).toBeUndefined();
  });

  it("lets a saved feature on the free map be changed as of a time after the incident began", () => {
    renderController();

    expect(mocks.popup.current?.changeTime).toEqual({
      earliest: new Date("2026-01-01T08:00:00Z"),
    });
  });

  it.each([
    ["looking at the past", { asOf: new Date("2026-01-01T09:00:00Z") }],
    ["drawing for a message", { drawingMessage: { id: "m", time: new Date() } }],
  ])("takes the time from the map when %s", (_name, time) => {
    renderController({ time });

    expect(mocks.popup.current?.changeTime).toBeUndefined();
  });

  it("feeds a change back through the draw control's update event", () => {
    renderController();
    const update = mocks.popup.current?.onUpdate as (e: unknown) => void;
    const effectiveAt = new Date("2026-01-01T10:00:00Z");

    update({ features: [feature], action: "featureDetail", effectiveAt });

    expect(mocks.fireDrawEvent).toHaveBeenCalledWith({ id: "inner-map" }, "draw.update", {
      features: [feature],
      action: "featureDetail",
      effectiveAt,
      target: mocks.fakeMap,
    });
  });
});
