import { fireEvent, render, screen } from "@testing-library/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LayerContext, type LayerState } from "../LayerContext";
import { FeatureLabelPopup } from "./FeatureLabelPopup";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "de", language: "de" },
  }),
}));
vi.mock("react-map-gl/maplibre", () => ({
  useMap: () => ({ current: undefined }),
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// A line has one free-text name field and needs no icon catalogue.
const line = (): Feature<Geometry, GeoJsonProperties> => ({
  type: "Feature",
  id: "f1",
  geometry: {
    type: "LineString",
    coordinates: [
      [8, 47],
      [8.1, 47.1],
    ],
  },
  properties: { lineType: "Frontline", name: "" },
});

function Popup({ feature }: { feature: Feature<Geometry, GeoJsonProperties> }) {
  const state = { layers: [], pendingFeatures: [], removedFeatures: [] } as unknown as LayerState;

  return (
    <LayerContext.Provider value={{ state, dispatch: vi.fn() }}>
      <FeatureLabelPopup selectedFeature={feature} onUpdate={vi.fn()} />
    </LayerContext.Provider>
  );
}

describe("FeatureLabelPopup", () => {
  it("keeps what is being typed when the same feature is passed in as a new object", () => {
    const { rerender } = render(<Popup feature={line()} />);
    const input = screen.getAllByRole("textbox")[0] as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Dammbruch" } });
    rerender(<Popup feature={line()} />);

    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("Dammbruch");
  });

  it("starts over when the feature itself changes", () => {
    const { rerender } = render(<Popup feature={line()} />);

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Dammbruch" } });
    rerender(<Popup feature={{ ...line(), properties: { lineType: "Frontline", name: "Neu" } }} />);

    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("Neu");
  });
});
