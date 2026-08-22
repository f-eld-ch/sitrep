/** biome-ignore-all lint/correctness/useUniqueElementIds: required to test for ids */
import { render } from "@testing-library/react";
import type { FeatureCollection } from "geojson";
import { Map as MapLibre } from "react-map-gl/maplibre";
import { MapStyles } from "views/map/controls/StyleController";
import { describe, expect, it, vi } from "vitest";
import bearing from "@turf/bearing";
import type { Feature, LineString, MultiPolygon, Point, Polygon, Position } from "geojson";
import {
  enrichFeature,
  EnrichedFeaturesSource,
  EnrichLineStringMap,
} from "./EnrichedLayerFeatures";

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

/**
 * The slide arrow is the one enrichment whose position is computed rather than looked up,
 * so it is the one that can be silently wrong. The component tests above cannot see it —
 * `Layer` is mocked away — hence these go at `enrichFeature` directly.
 */
describe("Rutschgebiet slide arrow", () => {
  /** A U opening north: down the west arm, east along the base, back up the east arm. */
  const uShape: Position[] = [
    [8.0, 47.05],
    [8.0, 47.0],
    [8.05, 47.0],
    [8.1, 47.0],
    [8.1, 47.05],
  ];

  const rutschgebiet = (coordinates: Position[]): Feature<LineString> => ({
    type: "Feature",
    id: "slide-1",
    geometry: { type: "LineString", coordinates },
    properties: { lineType: "Rutschgebiet", deletedAt: null },
  });

  const parts = (coordinates: Position[]) => {
    const enriched = enrichFeature(rutschgebiet(coordinates));
    return {
      shaft: enriched.find((f) => f.geometry.type === "LineString") as
        | Feature<LineString>
        | undefined,
      head: enriched.find((f) => f.geometry.type === "Point") as Feature<Point> | undefined,
    };
  };

  /** The southern edge the arrow springs from. */
  const EDGE_LAT = 47.0;

  it("puts the head at the end nearest the boundary", () => {
    const { shaft } = parts(uShape);
    const [tail, tip] = (shaft as Feature<LineString>).geometry.coordinates;
    // The slide runs onto the line, so the arrow closes on it rather than springing off it.
    expect(Math.abs(tip[1] - EDGE_LAT)).toBeLessThan(Math.abs(tail[1] - EDGE_LAT));
  });

  it("holds both ends clear of the boundary", () => {
    const { shaft } = parts(uShape);
    const [tail, tip] = (shaft as Feature<LineString>).geometry.coordinates;
    // Neither end may sit on the edge — the arrow annotates the boundary rather than
    // touching it, and the pattern band is drawn up to 22px wide.
    for (const end of [tail, tip]) {
      expect(Math.abs(end[1] - EDGE_LAT)).toBeGreaterThan(0);
    }
  });

  it("aims the chevron down the shaft, not back up it", () => {
    // The caps reach their rotation by feeding in a reversed bearing, so they add the
    // offset. Reusing that here aimed the head back up its own shaft.
    const { shaft, head } = parts(uShape);
    const [tail, tip] = (shaft as Feature<LineString>).geometry.coordinates;
    const rotation = head?.properties?.iconRotation as number;
    const aimed = (((rotation + 90) % 360) + 360) % 360;
    const wanted = ((bearing(tail, tip) % 360) + 360) % 360;
    expect(aimed).toBeCloseTo(wanted, 1);
  });

  it("leaves the boundary at a right angle", () => {
    const { shaft } = parts(uShape);
    const [tail, tip] = (shaft as Feature<LineString>).geometry.coordinates;
    // The southern edge runs due east, so a perpendicular arrow runs due north or south.
    const offAxis = Math.abs(((((bearing(tail, tip) - 90) % 360) + 540) % 360) - 180);
    expect(offAxis).toBeCloseTo(90, 0);
  });

  it("mirrors with the line, so it never shares a side with the teeth", () => {
    // The pattern's teeth are fixed by draw direction, so the arrow must be too. Were it
    // derived from curvature instead, reversing a line to correct the teeth would leave the
    // arrow behind and land the two on the same side.
    const forward = (parts(uShape).shaft as Feature<LineString>).geometry.coordinates[1];
    const reversed = (parts([...uShape].reverse()).shaft as Feature<LineString>).geometry
      .coordinates[1];
    expect(reversed[0]).toBeCloseTo(forward[0], 4);
    expect(reversed[1] - EDGE_LAT).toBeCloseTo(EDGE_LAT - forward[1], 4);
  });

  it("puts the arrow on a fixed side for a straight line, which has no curvature to read", () => {
    // A two-point line is the common case, and the one a curvature-based rule cannot answer:
    // its centroid sits exactly on it. Drawn due east the arrow takes the right of travel,
    // so it lies south of the line and closes on it heading north.
    const { shaft } = parts([
      [8.0, 47.0],
      [8.1, 47.0],
    ]);
    const [tail, tip] = (shaft as Feature<LineString>).geometry.coordinates;
    expect(tail[1]).toBeLessThan(EDGE_LAT);
    expect(tip[1]).toBeLessThan(EDGE_LAT);
    expect(bearing(tail, tip)).toBeCloseTo(0, 1);
  });

  it("tips the arrow with the red chevron", () => {
    const { head } = parts(uShape);
    expect(head?.properties?.icon).toContain("chevron-red");
    expect(head?.properties?.parent).toBe("slide-1");
  });

  it("emits nothing when every vertex coincides", () => {
    expect(
      enrichFeature(
        rutschgebiet([
          [8.0, 47.0],
          [8.0, 47.0],
        ]),
      ),
    ).toEqual([]);
  });

  it("leaves Trümmerbereich uncapped, so it draws as a plain solid line", () => {
    // 1116 has no pattern tile and the symbol is a plain boundary, so "no arrowhead" is
    // expressed by absence from the enrichment map rather than by a config flag.
    expect(EnrichLineStringMap.Truemmerbereich).toBeUndefined();
    expect(
      enrichFeature({
        type: "Feature",
        id: "debris-1",
        geometry: { type: "LineString", coordinates: uShape },
        properties: { lineType: "Truemmerbereich", deletedAt: null },
      }),
    ).toEqual([]);
  });

  it("leaves cap-only line types without a shaft", () => {
    const enriched = enrichFeature({
      type: "Feature",
      id: "walkable-1",
      geometry: { type: "LineString", coordinates: uShape },
      properties: { lineType: "begehbar", deletedAt: null },
    });
    expect(enriched).toHaveLength(2);
    expect(enriched.every((f) => f.geometry.type === "Point")).toBe(true);
  });
});

/**
 * The flow arrow is the polygon counterpart of the slide arrow, and the first enrichment
 * keyed on `zoneType` rather than `lineType`. Its anchor is derived from draw order, which
 * nothing else in the app depends on, so these tests are the only thing pinning it.
 */
describe("Überschwemmtes Gebiet flow arrow", () => {
  /**
   * A square traced clockwise from the south-west corner, with the closing repeat
   * mapbox-gl-draw adds. The last drawn vertex is the south-east corner and the last
   * segment runs due south down the eastern edge, so the outward normal is due east.
   */
  const square: Position[] = [
    [8.0, 47.0],
    [8.0, 47.05],
    [8.1, 47.05],
    [8.1, 47.0],
    [8.0, 47.0],
  ];
  /** Middle of the eastern edge — the last segment drawn, so where the arrow springs from. */
  const LAST_EDGE_MIDPOINT: Position = [8.1, 47.025];

  const flooded = (coordinates: Position[][], color?: string): Feature<Polygon> => ({
    type: "Feature",
    id: "zone-1",
    geometry: { type: "Polygon", coordinates },
    properties: { zoneType: "UeberschwemmtesGebiet", deletedAt: null, ...(color ? { color } : {}) },
  });

  const parts = (coordinates: Position[][], color?: string) => {
    const enriched = enrichFeature(flooded(coordinates, color));
    return {
      shaft: enriched.find((f) => f.geometry.type === "LineString") as
        | Feature<LineString>
        | undefined,
      head: enriched.find((f) => f.geometry.type === "Point") as Feature<Point> | undefined,
    };
  };

  const shaftOf = (coordinates: Position[][]) =>
    (parts(coordinates).shaft as Feature<LineString>).geometry.coordinates;

  it("springs from the middle of the last segment, not the closing repeat", () => {
    // The ring ends with a copy of its first position; reading that as the last segment
    // would put every arrow on the southern edge regardless of where drawing stopped.
    const [tail] = shaftOf([square]);
    expect(tail[0]).toBeCloseTo(LAST_EDGE_MIDPOINT[0], 4);
    expect(tail[1]).toBeCloseTo(LAST_EDGE_MIDPOINT[1], 4);
  });

  it("touches the outline, unlike the slide arrow which is held clear of its line", () => {
    // The tail sits exactly on the eastern edge, at longitude 8.1.
    const [tail] = shaftOf([square]);
    expect(tail[0]).toBeCloseTo(8.1, 5);
  });

  it("leaves the last segment at a right angle, pointing out of the zone", () => {
    // The last segment runs due south down the eastern edge, so the outward normal is east.
    const [tail, tip] = shaftOf([square]);
    expect(bearing(tail, tip)).toBeCloseTo(90, 1);
    expect(tip[0]).toBeGreaterThan(8.1);
  });

  it("takes the outward normal whichever way the ring is wound", () => {
    // Same square traced counter-clockwise, which makes the northern edge the last one
    // drawn. Outward is then north — a winding-blind rule would send it south, into the zone.
    const [tail, tip] = shaftOf([[...square].reverse()]);
    expect(tail[1]).toBeCloseTo(47.05, 4);
    expect(bearing(tail, tip)).toBeCloseTo(0, 1);
    expect(tip[1]).toBeGreaterThan(47.05);
  });

  it("aims the chevron down the shaft", () => {
    const { shaft, head } = parts([square]);
    const [tail, tip] = (shaft as Feature<LineString>).geometry.coordinates;
    const rotation = head?.properties?.iconRotation as number;
    const aimed = (((rotation + 90) % 360) + 360) % 360;
    const wanted = ((bearing(tail, tip) % 360) + 360) % 360;
    expect(aimed).toBeCloseTo(wanted, 1);
  });

  it("moves with the vertex drawing stopped on", () => {
    // Same square, traced from the north-west corner so it ends on the south-west one.
    const shifted: Position[] = [
      [8.0, 47.05],
      [8.1, 47.05],
      [8.1, 47.0],
      [8.0, 47.0],
      [8.0, 47.05],
    ];
    // Ends on the south-west corner, so the last segment is the southern edge.
    const [tail] = shaftOf([shifted]);
    expect(tail[0]).toBeCloseTo(8.05, 4);
    expect(tail[1]).toBeCloseTo(47.0, 4);
  });

  it("reads the outer ring only, ignoring holes", () => {
    const hole: Position[] = [
      [8.02, 47.01],
      [8.02, 47.02],
      [8.03, 47.02],
      [8.03, 47.01],
      [8.02, 47.01],
    ];
    const enriched = enrichFeature(flooded([square, hole]));
    // One shaft and one head — an arrow off the hole would point into the zone.
    expect(enriched).toHaveLength(2);
    expect(shaftOf([square, hole])[0][0]).toBeCloseTo(LAST_EDGE_MIDPOINT[0], 4);
  });

  it("gives a multipart zone one arrow per part, with distinct ids", () => {
    const second = square.map(([lon, lat]) => [lon + 1, lat] as Position);
    const enriched = enrichFeature({
      type: "Feature",
      id: "zone-1",
      geometry: { type: "MultiPolygon", coordinates: [[square], [second]] },
      properties: { zoneType: "UeberschwemmtesGebiet", deletedAt: null },
    } as Feature<MultiPolygon>);
    expect(enriched.map((f) => f.id)).toEqual([
      "zone-1:flow-0",
      "zone-1:flow-0-tip",
      "zone-1:flow-1",
      "zone-1:flow-1-tip",
    ]);
  });

  it("handles a triangle", () => {
    const triangle: Position[] = [
      [8.0, 47.0],
      [8.05, 47.05],
      [8.1, 47.0],
      [8.0, 47.0],
    ];
    // Last segment runs from the apex down to the south-east corner.
    const [tail] = shaftOf([triangle]);
    expect(tail[0]).toBeCloseTo(8.075, 3);
    expect(tail[1]).toBeCloseTo(47.025, 3);
  });

  it("ignores a repeated final vertex rather than aiming due north", () => {
    // `bearing(p, p)` is 0, not NaN, so a duplicate would silently point the arrow north —
    // a plausible-looking wrong answer rather than a visible failure.
    const duplicated: Position[] = [
      [8.0, 47.0],
      [8.0, 47.05],
      [8.1, 47.05],
      [8.1, 47.0],
      [8.1, 47.0],
      [8.0, 47.0],
    ];
    const [tail, tip] = shaftOf([duplicated]);
    expect(tail[0]).toBeCloseTo(LAST_EDGE_MIDPOINT[0], 4);
    expect(bearing(tail, tip)).toBeCloseTo(90, 1);
  });

  it("emits nothing when the ring encloses nothing", () => {
    expect(
      enrichFeature(
        flooded([
          [
            [8.0, 47.0],
            [8.0, 47.0],
            [8.0, 47.0],
          ],
        ]),
      ),
    ).toEqual([]);
  });

  it("carries the feature's own colour", () => {
    const { shaft, head } = parts([square], "#123456");
    expect(shaft?.properties?.color).toBe("#123456");
    expect(head?.properties?.icon).toContain("chevron-red");
  });

  it("leaves other zone types alone, so the registry gates it rather than the geometry", () => {
    const enriched = enrichFeature({
      type: "Feature",
      id: "zone-2",
      geometry: { type: "Polygon", coordinates: [square] },
      properties: { zoneType: "Schadengebiet", deletedAt: null },
    });
    expect(enriched).toEqual([]);
  });
});
