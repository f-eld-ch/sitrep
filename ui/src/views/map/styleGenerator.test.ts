import type { LayerProps } from "react-map-gl/maplibre";
import { describe, expect, it } from "vitest";
import { createMapStyle } from "./styleGenerator";

/**
 * Converts an array of layer specifications to a map indexed by layer ID
 */
function layersToMap(layers: LayerProps[]): Record<string, LayerProps> {
  return layers.reduce(
    (acc, layer) => {
      if (layer.id) {
        acc[layer.id] = layer;
      }
      return acc;
    },
    {} as Record<string, LayerProps>,
  );
}

/**
 * Sentinel standing in for the generated `icon-image` expression.
 *
 * That expression is a ~630-pair `match` built from the whole BABS catalogue plus the
 * legacy name table, so inlining it here would add ~13 KB of generated data per
 * occurrence and would have to be regenerated on every catalogue bump — noise that
 * obscures the structural assertions this fixture exists to make.
 *
 * Its *contents* are covered far better by `styleImageResolution.test.ts`, which proves
 * every identifier the app can persist resolves to an image that exists in the sprite.
 * This file keeps the complementary job: pinning the style's shape. The sentinel still
 * asserts that `icon-image` is present, on the expected layer, and nowhere else.
 */
const GENERATED_ICON_IMAGE = "<generated icon-image expression>";

/** Replaces the generated icon-image expression with the sentinel, non-destructively. */
function redactIconImage(layer: LayerProps): LayerProps {
  const withLayout = layer as LayerProps & { layout?: Record<string, unknown> };
  if (!withLayout.layout || withLayout.layout["icon-image"] === undefined) return layer;
  return {
    ...layer,
    layout: { ...withLayout.layout, "icon-image": GENERATED_ICON_IMAGE },
  } as LayerProps;
}

/**
 * Compares two layer styles by ID regardless of array order
 */
function compareLayersByID(actual: LayerProps[], expected: LayerProps[]) {
  const actualMap = layersToMap(actual.map(redactIconImage));
  const expectedMap = layersToMap(expected);

  // Check that all expected layers exist in actual layers
  for (const id of Object.keys(expectedMap)) {
    expect(actualMap).toHaveProperty(id);
    expect(actualMap[id]).toEqual(expectedMap[id]);
  }

  // Check that there are no extra layers in the actual result
  expect(Object.keys(actualMap).length).toEqual(Object.keys(expectedMap).length);
}

describe("Map Style Generator", () => {
  it("should generate drawStyle with identical layer definitions", () => {
    const generatedDrawStyle = createMapStyle({ forDraw: true });
    compareLayersByID(generatedDrawStyle, drawStyle);
    expect(generatedDrawStyle.length).toEqual(drawStyle.length);
  });

  it("should generate displayStyle with identical layer definitions", () => {
    const generatedDisplayStyle = createMapStyle({ forDraw: false });
    compareLayersByID(generatedDisplayStyle, displayStyle);
    expect(generatedDisplayStyle.length).toEqual(displayStyle.length);
  });
});

const drawStyle: LayerProps[] = [
  {
    id: "gl-draw-polygon-no-fill-pattern",
    type: "fill",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["has", "user_zoneType"],
      ["in", "user_zoneType", "Schadengebiet", "Einsatzraum"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "fill-outline-color": ["coalesce", ["get", "user_color"], "#000000"],
      "fill-opacity": 0,
    },
  },
  {
    id: "gl-draw-polygon-special-fill-pattern",
    type: "fill",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["has", "user_zoneType"],
      ["in", "user_zoneType", "Brandzone", "Zerstoerung"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "fill-pattern": [
        "match",
        ["get", "user_zoneType"],
        "Brandzone",
        "babs:1110-pattern",
        "Zerstoerung",
        "babs:1112-pattern",
        "babs:1110-pattern",
      ],
      "fill-opacity": 1,
    },
  },
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["!in", "user_zoneType", "Brandzone", "Zerstoerung", "Schadengebiet", "Einsatzraum"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "fill-color": ["coalesce", ["get", "user_color"], "#000000"],
      "fill-outline-color": ["coalesce", ["get", "user_color"], "#000000"],
      "fill-opacity": 0.5,
    },
  },
  {
    id: "gl-draw-polygon-fill-active",
    type: "fill",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": "#fbb03b",
      "fill-outline-color": "#fbb03b",
      "fill-opacity": 0.3,
    },
  },
  {
    id: "gl-draw-polygon-midpoint",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
    paint: {
      "circle-radius": 4,
      "circle-color": "#fbb03b",
    },
  },
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "user_color"], "#000000"],
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-polygon-stroke-active",
    type: "line",
    filter: ["all", ["==", "active", "true"], ["==", "$type", "Polygon"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-dasharray": [0.2, 2],
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-inactive",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "LineString"],
      ["!has", "user_lineType"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "user_color"], "#000000"],
      "line-opacity": 0.7,
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-inactive-normalLine",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "LineString"],
      ["in", "user_lineType", "", "normal"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "user_color"], "#000000"],
      "line-opacity": 0.7,
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-inactive-pattern",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "LineString"],
      [
        "in",
        "user_lineType",
        "unpassierbar",
        "beabsichtigteErkundung",
        "durchgeführteErkundung",
        "Rutschgebiet",
        "RutschgebietGespiegelt",
        "rettungsAchse",
      ],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-pattern": [
        "match",
        ["get", "user_lineType"],
        "unpassierbar",
        "babs:1203-pattern",
        "beabsichtigteErkundung",
        "babs:6103a-pattern",
        "durchgeführteErkundung",
        "babs:6103b-pattern",
        "Rutschgebiet",
        "babs:1113-pattern",
        "RutschgebietGespiegelt",
        "babs:1113-pattern-b",
        "rettungsAchse",
        "babs:6106-pattern",
        "babs:1203-pattern",
      ],
      "line-opacity": 0.7,
      "line-width": ["interpolate", ["exponential", 1], ["zoom"], 12, 2, 19, 22],
    },
  },
  {
    id: "gl-draw-line-inactive-solidlines",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "LineString"],
      [
        "in",
        "user_lineType",
        "schwerBegehbar",
        "durchgeführteVerschiebung",
        "durchgeführterEinsatz",
        "brandUebergriffErfolgt",
      ],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "user_color"], "#000000"],
      "line-opacity": 0.7,
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-inactive-dashlines",
    type: "line",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "LineString"],
      [
        "in",
        "user_lineType",
        "begehbar",
        "beabsichtigteVerschiebung",
        "beabsichtigterEinsatz",
        "brandUebergriffGefahr",
      ],
      ["!=", "mode", "static"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "user_color"], "#000000"],
      "line-dasharray": [6, 4],
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-active",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["==", "active", "true"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#fbb03b",
      "line-dasharray": [0.2, 2],
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-stroke-inactive",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-inactive",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"], ["!=", "mode", "static"]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#fbb03b",
    },
  },
  {
    id: "gl-draw-point-icon",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["has", "user_icon"],
      ["!has", "user_iconRotation"],
    ],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-pitch-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 20, 2.5],
    },
  },
  {
    id: "gl-draw-point-icon-rotation",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["has", "user_icon"],
      ["has", "user_iconRotation"],
    ],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-allow-overlap": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 20, 2.5],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-rotate": ["coalesce", ["get", "user_iconRotation"], 0],
    },
  },
  {
    id: "gl-draw-text-special-placement-points-center",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["has", "user_name"],
      ["has", "user_icon"],
      ["in", "user_icon", "EingesperrteAbgeschnittene", "Obdachlose"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "user_name"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "center",
      "text-offset": [0, 0],
      "icon-text-fit": "both",
      "icon-text-fit-padding": [20, 20, 20, 20],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 4, 17, 22],
    },
    paint: {
      "text-color": "#ff0000",
    },
  },
  {
    id: "gl-draw-text-special-placement-points-right",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["has", "user_name"],
      ["has", "user_icon"],
      ["in", "user_icon", "Tote", "Vermisste", "Verletzte"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "user_name"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "left",
      "text-offset": [1.5, 0.1],
      "text-ignore-placement": true,
      "text-justify": "right",
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 4, 18, 28],
    },
    paint: {
      "text-color": ["coalesce", ["get", "user_color"], "#ff0000"],
    },
  },
  {
    id: "gl-draw-text-name-point",
    type: "symbol",
    filter: [
      "all",
      ["==", "active", "false"],
      ["has", "user_name"],
      ["has", "user_color"],
      [
        "!in",
        "user_icon",
        "EingesperrteAbgeschnittene",
        "Obdachlose",
        "Tote",
        "Vermisste",
        "Verletzte",
      ],
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "user_name"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "center",
      "text-offset": [0, 2],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 2, 17, 16],
    },
    paint: {
      "text-color": ["coalesce", ["get", "user_color"], "#000000"],
    },
  },
  {
    id: "gl-draw-text-name-Polygon",
    type: "symbol",
    filter: [
      "all",
      ["==", "active", "false"],
      ["has", "user_name"],
      ["==", "$type", "Polygon"],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "user_name"], ""],
      "text-font": ["B612 Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 2, 17, 20],
      "symbol-placement": "line",
      "text-offset": [0, 0.5],
      "text-ignore-placement": true,
      "text-anchor": "center",
    },
    paint: {
      "text-color": ["coalesce", ["get", "user_color"], "#000000"],
      "text-halo-color": "#fff",
    },
  },
  {
    id: "gl-draw-text-name-LineString",
    type: "symbol",
    filter: [
      "all",
      ["==", "active", "false"],
      ["has", "user_name"],
      ["==", "$type", "LineString"],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "user_name"], ""],
      "text-font": ["B612 Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 2, 17, 20],
      "symbol-placement": "line-center",
      "text-offset": [0, 1],
      "text-ignore-placement": true,
      "text-anchor": "center",
    },
    paint: {
      "text-color": ["coalesce", ["get", "user_color"], "#000000"],
      "text-halo-color": "#fff",
    },
  },
  {
    id: "gl-draw-point-inactive",
    type: "circle",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["!has", "user_icon"],
      ["!=", "mode", "static"],
    ],
    paint: {
      "circle-radius": 5,
      "circle-color": "#0055ff",
    },
  },
  {
    id: "gl-draw-point-stroke-active",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "active", "true"],
      ["!has", "user_icon"],
      ["!=", "meta", "midpoint"],
    ],
    paint: {
      "circle-radius": 7,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-point-active",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["!=", "meta", "midpoint"], ["==", "active", "true"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fbb03b",
    },
  },
];

const displayStyle: LayerProps[] = [
  // **
  {
    id: "gl-draw-polygon-no-fill-pattern",
    type: "fill",
    filter: [
      "all",
      ["==", "$type", "Polygon"],
      ["has", "zoneType"],
      ["in", "zoneType", "Schadengebiet", "Einsatzraum"],
    ],
    paint: {
      "fill-outline-color": ["coalesce", ["get", "color"], "#000000"],
      "fill-opacity": 0,
    },
  },
  {
    id: "gl-draw-polygon-special-fill-pattern",
    type: "fill",
    filter: [
      "all",
      ["==", "$type", "Polygon"],
      ["has", "zoneType"],
      ["in", "zoneType", "Brandzone", "Zerstoerung"],
    ],
    paint: {
      "fill-pattern": [
        "match",
        ["get", "zoneType"],
        "Brandzone",
        "babs:1110-pattern",
        "Zerstoerung",
        "babs:1112-pattern",
        "babs:1110-pattern",
      ],
      "fill-opacity": 1,
    },
  },
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: [
      "all",
      ["==", "$type", "Polygon"],
      ["!in", "zoneType", "Brandzone", "Zerstoerung", "Schadengebiet", "Einsatzraum"],
    ],
    paint: {
      "fill-color": ["coalesce", ["get", "color"], "#000000"],
      "fill-outline-color": ["coalesce", ["get", "color"], "#000000"],
      "fill-opacity": 0.5,
    },
  },
  {
    id: "gl-draw-polygon-stroke-inactive",
    type: "line",
    filter: ["all", ["==", "$type", "Polygon"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#000000"],
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-inactive",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["!has", "lineType"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#000000"],
      "line-opacity": 0.7,
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-inactive-normalLine",
    type: "line",
    filter: ["all", ["==", "$type", "LineString"], ["in", "lineType", "", "normal"]],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#000000"],
      "line-opacity": 0.7,
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-inactive-pattern",
    type: "line",
    filter: [
      "all",
      ["==", "$type", "LineString"],
      [
        "in",
        "lineType",
        "unpassierbar",
        "beabsichtigteErkundung",
        "durchgeführteErkundung",
        "Rutschgebiet",
        "RutschgebietGespiegelt",
        "rettungsAchse",
      ],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-pattern": [
        "match",
        ["get", "lineType"],
        "unpassierbar",
        "babs:1203-pattern",
        "beabsichtigteErkundung",
        "babs:6103a-pattern",
        "durchgeführteErkundung",
        "babs:6103b-pattern",
        "Rutschgebiet",
        "babs:1113-pattern",
        "RutschgebietGespiegelt",
        "babs:1113-pattern-b",
        "rettungsAchse",
        "babs:6106-pattern",
        "babs:1203-pattern",
      ],
      "line-opacity": 0.7,
      "line-width": ["interpolate", ["exponential", 1], ["zoom"], 12, 2, 19, 22],
    },
  },
  {
    id: "gl-draw-line-inactive-solidlines",
    type: "line",
    filter: [
      "all",
      ["==", "$type", "LineString"],
      [
        "in",
        "lineType",
        "schwerBegehbar",
        "durchgeführteVerschiebung",
        "durchgeführterEinsatz",
        "brandUebergriffErfolgt",
      ],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#000000"],
      "line-opacity": 0.7,
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-line-inactive-dashlines",
    type: "line",
    filter: [
      "all",
      ["==", "$type", "LineString"],
      [
        "in",
        "lineType",
        "begehbar",
        "beabsichtigteVerschiebung",
        "beabsichtigterEinsatz",
        "brandUebergriffGefahr",
      ],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": ["coalesce", ["get", "color"], "#000000"],
      "line-dasharray": [6, 4],
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-stroke-inactive",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 5,
      "circle-color": "#fff",
    },
  },
  {
    id: "gl-draw-polygon-and-line-vertex-inactive",
    type: "circle",
    filter: ["all", ["==", "meta", "vertex"], ["==", "$type", "Point"]],
    paint: {
      "circle-radius": 3,
      "circle-color": "#fbb03b",
    },
  },
  {
    id: "gl-draw-point-icon",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],

      ["has", "icon"],
      ["!has", "iconRotation"],
    ],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-pitch-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 20, 2.5],
    },
  },
  {
    id: "gl-draw-point-icon-rotation",
    type: "symbol",
    filter: ["all", ["==", "$type", "Point"], ["has", "icon"], ["has", "iconRotation"]],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-allow-overlap": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 20, 2.5],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-rotate": ["coalesce", ["get", "iconRotation"], 0],
    },
  },
  {
    id: "gl-draw-text-special-placement-points-center",
    type: "symbol",
    filter: [
      "all",

      ["==", "$type", "Point"],

      ["has", "name"],
      ["has", "icon"],
      ["in", "icon", "EingesperrteAbgeschnittene", "Obdachlose"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "center",
      "text-offset": [0, 0],
      "icon-text-fit": "both",
      "icon-text-fit-padding": [20, 20, 20, 20],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 4, 17, 22],
    },
    paint: {
      "text-color": "#ff0000",
    },
  },
  {
    id: "gl-draw-text-special-placement-points-right",
    type: "symbol",
    filter: [
      "all",

      ["==", "$type", "Point"],
      ["has", "name"],
      ["has", "icon"],
      ["in", "icon", "Tote", "Vermisste", "Verletzte"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "left",
      "text-offset": [1.5, 0.1],
      "text-ignore-placement": true,
      "text-justify": "right",
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 4, 18, 28],
    },
    paint: {
      "text-color": ["coalesce", ["get", "color"], "#ff0000"],
    },
  },
  {
    id: "gl-draw-text-name-point",
    type: "symbol",
    filter: [
      "all",
      ["has", "name"],
      ["has", "color"],
      ["!in", "icon", "EingesperrteAbgeschnittene", "Obdachlose", "Tote", "Vermisste", "Verletzte"],
      ["==", "$type", "Point"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "center",
      "text-offset": [0, 2],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 2, 17, 16],
    },
    paint: {
      "text-color": ["coalesce", ["get", "color"], "#000000"],
    },
  },
  {
    id: "gl-draw-text-name-Polygon",
    type: "symbol",
    filter: ["all", ["has", "name"], ["==", "$type", "Polygon"]],
    layout: {
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-font": ["B612 Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 2, 17, 20],
      "symbol-placement": "line",
      "text-offset": [0, 0.5],
      "text-ignore-placement": true,
      "text-anchor": "center",
    },
    paint: {
      "text-color": ["coalesce", ["get", "color"], "#000000"],
      "text-halo-color": "#fff",
    },
  },
  {
    id: "gl-draw-text-name-LineString",
    type: "symbol",
    filter: ["all", ["has", "name"], ["==", "$type", "LineString"]],
    layout: {
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-font": ["B612 Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 2, 17, 20],
      "symbol-placement": "line-center",
      "text-offset": [0, 1],
      "text-ignore-placement": true,
      "text-anchor": "center",
    },
    paint: {
      "text-color": ["coalesce", ["get", "color"], "#000000"],
      "text-halo-color": "#fff",
    },
  },
];
