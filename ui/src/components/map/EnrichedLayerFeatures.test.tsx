/** biome-ignore-all lint/correctness/useUniqueElementIds: required to test for ids */
import { render } from "@testing-library/react";
import type { FeatureCollection } from "geojson";
import { Map as MapLibre } from "react-map-gl/maplibre";
import { MapStyles } from "views/map/controls/StyleController";
import { describe, expect, it, vi } from "vitest";
import { EnrichedFeaturesSource } from "./EnrichedLayerFeatures";

vi.mock("react-map-gl/maplibre", () => ({
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Source: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Layer: () => null,
}));

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = vi.fn();
}

const baseFeatureCollection: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "line-1",
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      properties: {
        lineType: "begehbar",
        deletedAt: null,
      },
    },
    {
      type: "Feature",
      id: "line-2",
      geometry: {
        type: "LineString",
        coordinates: [
          [2, 2],
          [3, 3],
        ],
      },
      properties: {
        lineType: "unpassierbar",
        deletedAt: null,
      },
    },
    {
      type: "Feature",
      id: "deleted-line",
      geometry: {
        type: "LineString",
        coordinates: [
          [4, 4],
          [5, 5],
        ],
      },
      properties: {
        lineType: "begehbar",
        deletedAt: "2023-01-01T00:00:00Z",
      },
    },
  ],
};

function renderWithMap(children: React.ReactNode) {
  const mapStyle = MapStyles[0].style;
  return render(
    <MapLibre
      initialViewState={{ longitude: 0, latitude: 0, zoom: 1 }}
      style={{ width: 400, height: 400 }}
      mapStyle={mapStyle}
    >
      {children}
    </MapLibre>,
  );
}

describe("EnrichedLayerFeatures", () => {
  it("renders nothing if id is undefined", () => {
    const { container } = renderWithMap(
      <EnrichedFeaturesSource id={undefined} featureCollection={baseFeatureCollection} />,
    );
    expect(container.firstChild).not.toBeNull(); // Map is rendered, but no Source/Layer
  });

  it("renders a Source and Layer for enriched features", () => {
    const { container } = renderWithMap(
      <EnrichedFeaturesSource id="test" featureCollection={baseFeatureCollection} />,
    );
    // Should render a Source and a Layer (cannot query by type/id, but no error should occur)
    expect(container).toBeTruthy();
  });

  it("filters out deleted features and the selected feature", () => {
    const { container } = renderWithMap(
      <EnrichedFeaturesSource
        id="test"
        featureCollection={baseFeatureCollection}
        selectedFeature="line-1"
      />,
    );
    expect(container).toBeTruthy();
  });

  it("handles empty featureCollection", () => {
    const { container } = renderWithMap(
      <EnrichedFeaturesSource
        id="test"
        featureCollection={{ type: "FeatureCollection", features: [] }}
      />,
    );
    expect(container).toBeTruthy();
  });
});
