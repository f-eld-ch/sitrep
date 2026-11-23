import { getLabel } from "@f-eld-ch/babs-core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LineTypes, ZoneTypes } from "components/babs/lineAndZoneTypes";
import de from "../../../i18n/locales/de/translations.json";
import { FeaturePanel } from "./FeaturePanel";

type F = Feature<Geometry, GeoJsonProperties>;

function t(key: string): string {
  const raw = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], de);

  return typeof raw === "string" ? raw : key;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t, i18n: { resolvedLanguage: "de", language: "de" } }),
}));
vi.mock("components/babs/useBabsIcons", () => ({ useBabsIcons: () => true }));
vi.mock("@f-eld-ch/babs-react", () => ({
  BabsIcon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
  useBabsLang: () => ({ lang: "de", label: (id: never) => getLabel(id, "de") }),
}));
vi.mock("./FeatureForm", () => ({ FeatureForm: () => <div data-testid="form" /> }));
const keepVisible = vi.hoisted(() => vi.fn());
vi.mock("./useKeepFeatureVisible", () => ({ useKeepFeatureVisible: keepVisible }));

const onUpdate = vi.fn();
const onDiscard = vi.fn();
const pending = { saving: false, onSave: vi.fn(), onDiscard };

const line = (properties: GeoJsonProperties = {}): F => ({
  type: "Feature",
  id: "l1",
  geometry: {
    type: "LineString",
    coordinates: [
      [8, 47],
      [9, 48],
    ],
  },
  properties,
});

const zone = (properties: GeoJsonProperties = {}): F => ({
  type: "Feature",
  id: "z1",
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

const point = (properties: GeoJsonProperties = {}): F => ({
  type: "Feature",
  id: "p1",
  geometry: { type: "Point", coordinates: [8, 47] },
  properties,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("FeaturePanel", () => {
  it("keeps the selected feature in view", () => {
    render(<FeaturePanel selectedFeature={point()} onUpdate={onUpdate} />);
    expect(keepVisible).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });

  it("shows the symbol of a point with its form", () => {
    render(<FeaturePanel selectedFeature={point({ icon: "4103" })} onUpdate={onUpdate} />);

    expect(screen.getByText("Zug-P")).toBeInTheDocument();
    expect(screen.getByTestId("form")).toBeInTheDocument();
  });

  it("asks for the symbol of a new point first, and can drop it while it is pending", () => {
    render(<FeaturePanel selectedFeature={point()} onUpdate={onUpdate} pending={pending} />);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("offers no discard for a feature that is not pending (the message map)", () => {
    render(<FeaturePanel selectedFeature={point()} onUpdate={onUpdate} />);
    expect(screen.queryByRole("button", { name: "Verwerfen" })).not.toBeInTheDocument();
  });

  describe("a line", () => {
    it("lists the types with their names", () => {
      render(<FeaturePanel selectedFeature={line()} onUpdate={onUpdate} pending={pending} />);

      expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(
        Object.keys(LineTypes).length,
      );
      expect(screen.getByText(/gesperrt/)).toBeInTheDocument();
      expect(screen.getByText("Rutschgebiet")).toBeInTheDocument();
      expect(screen.queryByTestId("form")).not.toBeInTheDocument();
    });

    it("sets the type and its colour, then shows the form", () => {
      const first = Object.values(LineTypes)[0];
      const { rerender } = render(<FeaturePanel selectedFeature={line()} onUpdate={onUpdate} />);

      fireEvent.click(screen.getAllByRole("button", { pressed: false })[0]);
      const update = onUpdate.mock.calls[0][0];
      expect(update.action).toBe("featureDetail");
      expect(update.features[0].properties.lineType).toBeDefined();
      expect(update.features[0].properties.color).toBe(first.color ?? undefined);

      rerender(
        <FeaturePanel
          selectedFeature={line({ lineType: update.features[0].properties.lineType })}
          onUpdate={onUpdate}
        />,
      );
      expect(screen.getByTestId("form")).toBeInTheDocument();
    });

    it("shows the chosen type, and lets it be changed and the change be taken back", () => {
      const name = Object.keys(LineTypes)[2];
      render(<FeaturePanel selectedFeature={line({ lineType: name })} onUpdate={onUpdate} />);

      expect(screen.getByTestId("form")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
      // kept, so what was typed survives looking at the types, but out of sight
      expect(screen.getByTestId("form")).not.toBeVisible();
      expect(screen.getByRole("button", { pressed: true })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
      expect(screen.getByTestId("form")).toBeVisible();
    });

    it("still offers the form for a saved line whose type this version does not list", () => {
      render(
        <FeaturePanel selectedFeature={line({ lineType: "Aelterer Typ" })} onUpdate={onUpdate} />,
      );

      expect(screen.getByTestId("form")).toBeVisible();
      expect(screen.getByText("Aelterer Typ")).toBeInTheDocument();
      // the list is behind "Ändern", and choosing from it replaces the old type
      fireEvent.click(screen.getByRole("button", { name: "Ändern" }));
      fireEvent.click(screen.getAllByRole("button", { pressed: false })[0]);
      expect(onUpdate.mock.calls[0][0].features[0].properties.lineType).not.toBe("Aelterer Typ");
    });

    it("can drop a pending line before a type is chosen", () => {
      render(<FeaturePanel selectedFeature={line()} onUpdate={onUpdate} pending={pending} />);
      fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
      expect(onDiscard).toHaveBeenCalled();
    });
  });

  it("sets the type of an area", () => {
    render(<FeaturePanel selectedFeature={zone()} onUpdate={onUpdate} />);

    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(
      Object.keys(ZoneTypes).length,
    );
    fireEvent.click(screen.getAllByRole("button", { pressed: false })[0]);
    expect(onUpdate.mock.calls[0][0].features[0].properties.zoneType).toBeDefined();
  });
});

describe("long names", () => {
  it("wrap instead of being cut off with an ellipsis", () => {
    // "Beabsichtigter Einsatz" and its like do not fit one line of the panel
    const name =
      Object.keys(LineTypes).find((n) => /Einsatz/i.test(n)) ?? Object.keys(LineTypes)[0];
    render(<FeaturePanel selectedFeature={line({ lineType: name })} onUpdate={onUpdate} />);

    const title = screen.getByText(/./, { selector: "span.text-sm" });
    expect(title.className).not.toMatch(/truncate|text-ellipsis|overflow-hidden/);
    expect(title.className).toMatch(/wrap-break-word/);
  });

  it("wrap in the symbol header too", () => {
    render(<FeaturePanel selectedFeature={point({ icon: "4103" })} onUpdate={onUpdate} />);

    const title = screen.getByText("Zug-P");
    expect(title.className).not.toMatch(/truncate|text-ellipsis|overflow-hidden/);
    expect(title.className).toMatch(/wrap-break-word/);
  });
});
