import { listIcons } from "@f-eld-ch/babs-core";
import { KEMLER_CODES } from "@f-eld-ch/babs-core/kemler-codes";
import type { LayerProps } from "react-map-gl/maplibre";
import { describe, expect, it } from "vitest";
import { iconIdentifiers } from "components/babs/iconResolver";
import { ANNOTATED_CATEGORIES } from "components/babs/labelSchema";
import { Colors } from "components/babs/lineAndZoneTypes";
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

/**
 * Casualty and text-fit icons, expanded to every identifier that can denote them.
 *
 * Referenced rather than inlined for the same reason as GENERATED_ICON_IMAGE: the list is
 * derived from the catalogue and the legacy mapping, so writing 15 strings out six times
 * here would only pin today's catalogue. What these filters actually *do* is verified
 * behaviourally in casualtyLabels.test.ts, which drives real features through them.
 */
const CASUALTIES_RIGHT = iconIdentifiers(["1305", "1302", "1301"]);
const TEXT_FIT_CASUALTY_ICONS = iconIdentifiers(["1303", "1304"]);
const TEXT_FIT_PLATE_ICONS = iconIdentifiers(["2109a"]);
/** Both families, in the order the source builds them — `gl-draw-point-icon` excludes all. */
const TEXT_FIT_ICONS = iconIdentifiers(["1303", "1304", "2109a"]);
const SPECIALLY_LABELLED = [...CASUALTIES_RIGHT, ...TEXT_FIT_ICONS];
const UN_SIGN_ICONS = KEMLER_CODES.map((code) => `un:${code}`);

/** Every identifier of an icon that annotates left and right — Formationen and Fahrzeuge. */
const ANNOTATED_ICONS = iconIdentifiers(
  ANNOTATED_CATEGORIES.flatMap((category) => listIcons({ category }).map((meta) => meta.id)),
);

/**
 * The expected shape of a text-fit layer.
 *
 * There is one per icon family, differing only in the values passed here — everything else is
 * spelled out so the structure stays pinned. `icon-size` is deliberately the same plain zoom
 * ramp every other point layer uses: the frame is sized by its label through the stretch, so
 * scaling the symbol by label length as well would inflate the artwork and the padding along
 * with it.
 */
const expectedTextFitLayer = (
  prefix: string,
  id: string,
  icons: string[],
  padding: unknown,
  textSize: unknown,
  defaultTextColor: string,
  textOffset: [number, number] = [0, 0],
  // Cast for the same reason the layers below are contextually typed by `drawStyle`: an
  // object literal returned from a function loses that context, and spelling out every
  // MapLibre expression type here would bury the structure this fixture exists to show.
): LayerProps =>
  ({
    id,
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ...(prefix === "user_" ? [["==", "meta", "feature"]] : []),
      ["has", `${prefix}icon`],
      ["has", `${prefix}name`],
      ["!has", `${prefix}iconRotation`],
      ...(id.endsWith("plate")
        ? [["any", ["in", `${prefix}icon`, ...icons], ["in", `${prefix}icon`, ...UN_SIGN_ICONS]]]
        : [["in", `${prefix}icon`, ...icons]]),
    ],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-text-fit": "both",
      "icon-text-fit-padding": padding,
      "icon-pitch-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-size": 1,
      "text-field": ["coalesce", ["get", `${prefix}name`], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "center",
      "text-offset": textOffset,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      "text-size": textSize,
    },
    paint: {
      "text-color": ["coalesce", ["get", `${prefix}color`], defaultTextColor],
    },
  }) as unknown as LayerProps;

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
      ["in", "user_zoneType", "Einsatzraum", "Schadengebiet", "UeberschwemmtesGebiet"],
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
    id: "gl-draw-polygon-flat-fill",
    type: "fill",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["has", "user_zoneType"],
      [
        "in",
        "user_zoneType",
        "BiologischVerseucht",
        "ChemieVerseuchtFluessig",
        "ChemieVerseuchtGasfoermig",
        "Radioaktiv",
      ],
      ["!=", "mode", "static"],
    ],
    paint: {
      "fill-color": [
        "match",
        ["get", "user_zoneType"],
        "BiologischVerseucht",
        Colors.LightGray,
        "ChemieVerseuchtFluessig",
        Colors.LightGray,
        "ChemieVerseuchtGasfoermig",
        Colors.LightGray,
        "Radioaktiv",
        Colors.LightGray,
        Colors.LightGray,
      ],
      "fill-opacity": 0.5,
    },
  },
  {
    id: "gl-draw-polygon-zone-icon",
    type: "symbol",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      ["has", "user_zoneType"],
      [
        "in",
        "user_zoneType",
        "BiologischVerseucht",
        "ChemieVerseuchtFluessig",
        "ChemieVerseuchtGasfoermig",
        "Radioaktiv",
      ],
      ["!=", "mode", "static"],
    ],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-allow-overlap": true,
      // 1.5x the point-icon scale: a zone symbol labels an area, not a position.
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 20, 2.5],
    },
  },
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Polygon"],
      [
        "!in",
        "user_zoneType",
        "Brandzone",
        "Zerstoerung",
        "BiologischVerseucht",
        "ChemieVerseuchtFluessig",
        "ChemieVerseuchtGasfoermig",
        "Radioaktiv",
        "Einsatzraum",
        "Schadengebiet",
        "UeberschwemmtesGebiet",
      ],
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
        "babs:1113-pattern",
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
        "Truemmerbereich",
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
      [
        "any",
        [
          "all",
          ["!in", "user_icon", ...TEXT_FIT_ICONS],
          ["!in", "user_icon", ...UN_SIGN_ICONS],
        ],
        ["!has", "user_name"],
      ],
    ],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-pitch-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 20, 1.667],
    },
  },
  expectedTextFitLayer(
    "user_",
    "gl-draw-point-icon-text-fit-casualty",
    TEXT_FIT_CASUALTY_ICONS,
    [
      "interpolate",
      ["linear"],
      ["zoom"],
      12,
      ["literal", [1.25, 2.5, 1.25, 2.5]],
      14,
      ["literal", [2.5, 6, 2.5, 6]],
      17,
      ["literal", [3.2, 8, 3.2, 8]],
    ],
    ["interpolate", ["linear"], ["zoom"], 12, 4, 17, 22],
    "#ff0000",
  ),
  expectedTextFitLayer(
    "user_",
    "gl-draw-point-icon-text-fit-plate",
    TEXT_FIT_PLATE_ICONS,
    [
      "interpolate",
      ["linear"],
      ["zoom"],
      12,
      ["literal", [0.7, 2.5, 0.7, 2.5]],
      14,
      ["literal", [1.3, 5.5, 1.3, 5.5]],
      17,
      ["literal", [1.6, 7, 1.6, 7]],
    ],
    ["interpolate", ["linear"], ["zoom"], 12, 3, 17, 14],
    "#000000",
    [0, -0.15],
  ),
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
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 20, 1.667],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-rotate": ["coalesce", ["get", "user_iconRotation"], 0],
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
      ["in", "user_icon", ...CASUALTIES_RIGHT],
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
    id: "gl-draw-text-name-point-left",
    type: "symbol",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Point"],
      ["has", "user_nameLeft"],
      ["in", "user_icon", ...ANNOTATED_ICONS],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "user_nameLeft"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "right",
      "text-offset": [-2, 0],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 14],
    },
    paint: {
      "text-color": ["coalesce", ["get", "user_color"], "#000000"],
    },
  },
  {
    id: "gl-draw-text-name-point-right",
    type: "symbol",
    filter: [
      "all",
      ["==", "active", "false"],
      ["==", "$type", "Point"],
      ["has", "user_nameRight"],
      ["in", "user_icon", ...ANNOTATED_ICONS],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "user_nameRight"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "left",
      "text-offset": [2, 0],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 14],
    },
    paint: {
      "text-color": ["coalesce", ["get", "user_color"], "#000000"],
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
      ["!in", "user_icon", ...SPECIALLY_LABELLED],
      ["!in", "user_icon", ...UN_SIGN_ICONS],
      ["==", "$type", "Point"],
      ["==", "meta", "feature"],
      ["!=", "mode", "static"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "user_name"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "center",
      "text-offset": [0, 2.5],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 14],
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
      ["in", "zoneType", "Einsatzraum", "Schadengebiet", "UeberschwemmtesGebiet"],
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
    id: "gl-draw-polygon-flat-fill",
    type: "fill",
    filter: [
      "all",
      ["==", "$type", "Polygon"],
      ["has", "zoneType"],
      [
        "in",
        "zoneType",
        "BiologischVerseucht",
        "ChemieVerseuchtFluessig",
        "ChemieVerseuchtGasfoermig",
        "Radioaktiv",
      ],
    ],
    paint: {
      "fill-color": [
        "match",
        ["get", "zoneType"],
        "BiologischVerseucht",
        Colors.LightGray,
        "ChemieVerseuchtFluessig",
        Colors.LightGray,
        "ChemieVerseuchtGasfoermig",
        Colors.LightGray,
        "Radioaktiv",
        Colors.LightGray,
        Colors.LightGray,
      ],
      "fill-opacity": 0.5,
    },
  },
  {
    id: "gl-draw-polygon-zone-icon",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Polygon"],
      ["has", "zoneType"],
      [
        "in",
        "zoneType",
        "BiologischVerseucht",
        "ChemieVerseuchtFluessig",
        "ChemieVerseuchtGasfoermig",
        "Radioaktiv",
      ],
    ],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-allow-overlap": true,
      // 1.5x the point-icon scale: a zone symbol labels an area, not a position.
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 20, 2.5],
    },
  },
  {
    id: "gl-draw-polygon-fill-inactive",
    type: "fill",
    filter: [
      "all",
      ["==", "$type", "Polygon"],
      [
        "!in",
        "zoneType",
        "Brandzone",
        "Zerstoerung",
        "BiologischVerseucht",
        "ChemieVerseuchtFluessig",
        "ChemieVerseuchtGasfoermig",
        "Radioaktiv",
        "Einsatzraum",
        "Schadengebiet",
        "UeberschwemmtesGebiet",
      ],
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
        "babs:1113-pattern",
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
        "Truemmerbereich",
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
      [
        "any",
        [
          "all",
          ["!in", "icon", ...TEXT_FIT_ICONS],
          ["!in", "icon", ...UN_SIGN_ICONS],
        ],
        ["!has", "name"],
      ],
    ],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-pitch-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 20, 1.667],
    },
  },
  expectedTextFitLayer(
    "",
    "gl-draw-point-icon-text-fit-casualty",
    TEXT_FIT_CASUALTY_ICONS,
    [
      "interpolate",
      ["linear"],
      ["zoom"],
      12,
      ["literal", [1.25, 2.5, 1.25, 2.5]],
      14,
      ["literal", [2.5, 6, 2.5, 6]],
      17,
      ["literal", [3.2, 8, 3.2, 8]],
    ],
    ["interpolate", ["linear"], ["zoom"], 12, 4, 17, 22],
    "#ff0000",
  ),
  expectedTextFitLayer(
    "",
    "gl-draw-point-icon-text-fit-plate",
    TEXT_FIT_PLATE_ICONS,
    [
      "interpolate",
      ["linear"],
      ["zoom"],
      12,
      ["literal", [0.7, 2.5, 0.7, 2.5]],
      14,
      ["literal", [1.3, 5.5, 1.3, 5.5]],
      17,
      ["literal", [1.6, 7, 1.6, 7]],
    ],
    ["interpolate", ["linear"], ["zoom"], 12, 3, 17, 14],
    "#000000",
    [0, -0.15],
  ),
  {
    id: "gl-draw-point-icon-rotation",
    type: "symbol",
    filter: ["all", ["==", "$type", "Point"], ["has", "icon"], ["has", "iconRotation"]],
    layout: {
      "icon-image": GENERATED_ICON_IMAGE,
      "icon-allow-overlap": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 20, 1.667],
      "icon-rotation-alignment": "map",
      "icon-pitch-alignment": "map",
      "icon-rotate": ["coalesce", ["get", "iconRotation"], 0],
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
      ["in", "icon", ...CASUALTIES_RIGHT],
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
    id: "gl-draw-text-name-point-left",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["has", "nameLeft"],
      ["in", "icon", ...ANNOTATED_ICONS],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "nameLeft"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "right",
      "text-offset": [-2, 0],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 14],
    },
    paint: {
      "text-color": ["coalesce", ["get", "color"], "#000000"],
    },
  },
  {
    id: "gl-draw-text-name-point-right",
    type: "symbol",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["has", "nameRight"],
      ["in", "icon", ...ANNOTATED_ICONS],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "nameRight"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "left",
      "text-offset": [2, 0],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 14],
    },
    paint: {
      "text-color": ["coalesce", ["get", "color"], "#000000"],
    },
  },
  {
    id: "gl-draw-text-name-point",
    type: "symbol",
    filter: [
      "all",
      ["has", "name"],
      ["has", "color"],
      ["!in", "icon", ...SPECIALLY_LABELLED],
      ["!in", "icon", ...UN_SIGN_ICONS],
      ["==", "$type", "Point"],
    ],
    layout: {
      "text-field": ["coalesce", ["get", "name"], ""],
      "text-font": ["B612 Bold"],
      "text-anchor": "center",
      "text-offset": [0, 2.5],
      "text-ignore-placement": true,
      "text-size": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 14],
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
