import { type BabsIconId, markerSpriteKey, patternSpriteKey } from "@f-eld-ch/babs-core";
import {
  babsImage,
  iconIdentifiers,
  legacyIconMatchExpression,
} from "components/babs/iconResolver";
import { ZoneTypes } from "components/babs/lineAndZoneTypes";
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type { LayerProps } from "react-map-gl/maplibre";

/**
 * Options for map style generation
 */
export interface MapStyleOptions {
  /** When true, generates styles for drawing mode with user_ prefixes and editing states */
  forDraw: boolean;
}

type FilterCondition = Array<string | number | boolean | FilterCondition>;

/**
 * Zone types with a flat fill colour, and those with a symbol drawn inside the polygon.
 *
 * Derived from `ZoneTypes` rather than listed here, so adding a zone type cannot silently
 * miss a layer — `lineAndZoneTypes.test.ts` asserts every zone type is drawn by something.
 */
const ZONES = Object.values(ZoneTypes);
const PATTERN_ZONES = ZONES.filter((zone) => zone.pattern !== undefined);
const FLAT_FILL_ZONES = ZONES.filter((zone) => zone.fill !== undefined);
const OUTLINE_ONLY_ZONES = ZONES.filter((zone) => zone.outlineOnly);
const ICON_ZONES = ZONES.filter((zone) => zone.zoneIcon !== undefined);

/**
 * Zone types whose interior is handled by a dedicated layer — pattern-filled,
 * flat-filled, or outline-only — and which must therefore be excluded from the generic
 * fill layer, or they would be filled twice.
 *
 * Derived from ZoneTypes rather than listed, so a zone declaring an interior treatment
 * cannot be left out of the exclusion by omission.
 */
const SPECIALLY_FILLED_ZONE_NAMES = [
  ...PATTERN_ZONES,
  ...FLAT_FILL_ZONES,
  ...OUTLINE_ONLY_ZONES,
].map((zone) => zone.name);

/**
 * Casualty-count icons, whose labels are placed differently from every other icon.
 *
 * Listed by catalogue id and expanded to every identifier that can denote them — alias,
 * id, legacy German name — because these are style *filters* comparing `properties.icon`
 * literally, with no `match` expression to resolve aliases for them. Before this, the
 * filters held only the legacy names, so a newly placed casualty icon got the generic
 * label instead of its own placement.
 */
const CASUALTIES_CENTRED = iconIdentifiers([
  "1304", // Eingesperrte (legacy EingesperrteAbgeschnittene)
  "1303", // Obdachlose
]);
const CASUALTIES_RIGHT = iconIdentifiers([
  "1305", // Tote
  "1302", // Vermisste
  "1301", // Verletzte
]);
/** Both groups: the icons the generic name label must skip. */
const CASUALTIES_ALL = [...CASUALTIES_CENTRED, ...CASUALTIES_RIGHT];

/**
 * Builds a `match` expression keyed on a feature property.
 *
 * Spreading the pairs loses the tuple shape TypeScript needs to check `match` arity, so
 * the cast lives here rather than at each call site. Arity is still verified for real by
 * `styleImageResolution.test.ts`, which compiles every expression against the style spec.
 */
const matchOnProperty = (
  property: string,
  pairs: readonly (readonly [string, string])[],
  fallback: string,
): ExpressionSpecification =>
  ["match", ["get", property], ...pairs.flat(), fallback] as unknown as ExpressionSpecification;

/**
 * Creates map layer styles for either drawing or display mode
 * @param options Configuration options for style generation
 * @returns Array of layer properties for the specified mode
 */
export function createMapStyle(options: MapStyleOptions = { forDraw: true }): LayerProps[] {
  // Property prefix changes based on mode
  const propPrefix = options.forDraw ? "user_" : "";

  // Generate filter conditions based on mode
  function createFilter(baseConditions: FilterCondition[]): FilterSpecification {
    // If we're not in draw mode, the filter is simpler
    if (!options.forDraw) {
      return ["all", ...baseConditions] as FilterSpecification;
    }

    const isVertexFilter = baseConditions.some(
      (cond) =>
        Array.isArray(cond) && cond[0] === "==" && cond[1] === "meta" && cond[2] === "vertex",
    );

    // Check if this is an icon filter (needs special handling to match original order)
    const isIconFilter = baseConditions.some(
      (cond) => Array.isArray(cond) && cond[0] === "has" && cond[1] === `${propPrefix}icon`,
    );

    // For vertex filters, preserve exact original order
    if (isVertexFilter) {
      return ["all", ...baseConditions, ["!=", "mode", "static"]] as unknown as FilterSpecification;
    }

    // For icon filters, we need to insert meta:feature between $type and has:icon
    if (isIconFilter) {
      const typeIndex = baseConditions.findIndex(
        (cond) =>
          Array.isArray(cond) && cond[0] === "==" && cond[1] === "$type" && cond[2] === "Point",
      );

      if (typeIndex >= 0) {
        // Create a new conditions array with meta:feature inserted after $type
        const result: FilterCondition = ["all"];

        // Add conditions in the right order:
        // 1. $type condition
        result.push(baseConditions[typeIndex]);

        // 2. meta:feature condition
        result.push(["==", "meta", "feature"]);

        // 3. All other conditions except $type
        baseConditions.forEach((cond, i) => {
          if (i !== typeIndex) {
            result.push(cond);
          }
        });

        return result as FilterSpecification;
      }
    }

    // For standard filters
    const conditions: FilterCondition[] = [...baseConditions];

    // Add active condition for non-vertex, non-icon filters
    if (
      !isIconFilter &&
      !conditions.some((cond) => Array.isArray(cond) && cond[0] === "==" && cond[1] === "active")
    ) {
      // Insert active condition at the beginning
      conditions.unshift(["==", "active", "false"]);
    }

    // Add meta feature condition for filters with name properties
    if (
      baseConditions.some(
        (cond) =>
          Array.isArray(cond) &&
          cond[0] === "has" &&
          cond[1] &&
          typeof cond[1] === "string" &&
          cond[1].includes("name"),
      ) &&
      !baseConditions.some((cond) => Array.isArray(cond) && cond[0] === "==" && cond[1] === "meta")
    ) {
      conditions.push(["==", "meta", "feature"]);
    }

    // Add mode-specific condition at the end
    conditions.push(["!=", "mode", "static"]);

    return ["all", ...conditions] as FilterSpecification;
  }

  // Start with styles common to both modes, organized by type
  const styles: LayerProps[] = [
    // === POLYGON STYLES ===
    {
      id: "gl-draw-polygon-no-fill-pattern",
      type: "fill",
      filter: createFilter([
        ["==", "$type", "Polygon"],
        ["has", `${propPrefix}zoneType`],
        ["in", `${propPrefix}zoneType`, ...OUTLINE_ONLY_ZONES.map((zone) => zone.name)],
      ]),
      paint: {
        "fill-outline-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "fill-opacity": 0,
      },
    },
    {
      id: "gl-draw-polygon-special-fill-pattern",
      type: "fill",
      filter: createFilter([
        ["==", "$type", "Polygon"],
        ["has", `${propPrefix}zoneType`],
        ["in", `${propPrefix}zoneType`, ...PATTERN_ZONES.map((zone) => zone.name)],
      ]),
      paint: {
        "fill-pattern": matchOnProperty(
          `${propPrefix}zoneType`,
          PATTERN_ZONES.map(
            (zone) => [zone.name, babsImage(patternSpriteKey(zone.pattern as BabsIconId))] as const,
          ),
          babsImage(patternSpriteKey(PATTERN_ZONES[0].pattern as BabsIconId)),
        ),
        "fill-opacity": 1,
      },
    },
    {
      // Zones drawn with a flat wash rather than a tiling pattern. Separate from
      // gl-draw-polygon-fill-inactive because the fill colour is a property of the zone
      // type, not the feature's own stroke colour.
      id: "gl-draw-polygon-flat-fill",
      type: "fill",
      filter: createFilter([
        ["==", "$type", "Polygon"],
        ["has", `${propPrefix}zoneType`],
        ["in", `${propPrefix}zoneType`, ...FLAT_FILL_ZONES.map((zone) => zone.name)],
      ]),
      paint: {
        "fill-color": matchOnProperty(
          `${propPrefix}zoneType`,
          FLAT_FILL_ZONES.map((zone) => [zone.name, zone.fill as string] as const),
          FLAT_FILL_ZONES[0].fill as string,
        ),
        "fill-opacity": 0.5,
      },
    },
    {
      id: "gl-draw-polygon-fill-inactive",
      type: "fill",
      filter: createFilter([
        ["==", "$type", "Polygon"],
        // Every zone type with its own fill treatment above, so a zone is never filled
        // twice. Derived from ZoneTypes so a new zone cannot be missed here.
        ["!in", `${propPrefix}zoneType`, ...SPECIALLY_FILLED_ZONE_NAMES],
      ]),
      paint: {
        "fill-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "fill-outline-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "fill-opacity": 0.5,
      },
    },
    {
      /**
       * The zone's own symbol, drawn inside the polygon.
       *
       * A symbol layer anchors a polygon feature at its pole of inaccessibility — the
       * interior point furthest from any edge — so the symbol stays inside concave zones
       * where a centroid would drift outside. One symbol per ring group, so a multipart
       * zone gets one per part.
       */
      id: "gl-draw-polygon-zone-icon",
      type: "symbol",
      filter: createFilter([
        ["==", "$type", "Polygon"],
        ["has", `${propPrefix}zoneType`],
        ["in", `${propPrefix}zoneType`, ...ICON_ZONES.map((zone) => zone.name)],
      ]),
      layout: {
        "icon-image": matchOnProperty(
          `${propPrefix}zoneType`,
          ICON_ZONES.map((zone) => [zone.name, babsImage(zone.zoneIcon as BabsIconId)] as const),
          "",
        ),
        "icon-allow-overlap": true,
        // 1.5x the point-icon scale: a zone symbol labels an area rather than marking a
        // position, so it needs to read at the zoom the whole area is viewed at — but 2x
        // was overbearing.
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.45, 20, 3.75],
      },
    },
    {
      id: "gl-draw-polygon-stroke-inactive",
      type: "line",
      filter: createFilter([["==", "$type", "Polygon"]]),
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "line-width": 2,
      },
    },

    // === LINE STYLES ===
    {
      id: "gl-draw-line-inactive",
      type: "line",
      filter: createFilter([
        ["==", "$type", "LineString"],
        ["!has", `${propPrefix}lineType`],
      ]),
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "line-opacity": 0.7,
        "line-width": 2,
      },
    },
    {
      id: "gl-draw-line-inactive-normalLine",
      type: "line",
      filter: createFilter([
        ["==", "$type", "LineString"],
        ["in", `${propPrefix}lineType`, "", "normal"],
      ]),
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "line-opacity": 0.7,
        "line-width": 2,
      },
    },
    {
      id: "gl-draw-line-inactive-pattern",
      type: "line",
      filter: createFilter([
        ["==", "$type", "LineString"],
        [
          "in",
          `${propPrefix}lineType`,
          "unpassierbar",
          "beabsichtigteErkundung",
          "durchgeführteErkundung",
          "Rutschgebiet",
          "RutschgebietGespiegelt",
          "rettungsAchse",
        ],
      ]),
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-pattern": [
          "match",
          ["get", `${propPrefix}lineType`],
          "unpassierbar",
          babsImage(patternSpriteKey("1203")),
          "beabsichtigteErkundung",
          babsImage(patternSpriteKey("6103a")),
          "durchgeführteErkundung",
          babsImage(patternSpriteKey("6103b")),
          "Rutschgebiet",
          babsImage(patternSpriteKey("1113")),
          // Retired line type: no longer offered in the picker, since mirroring is done
          // by reversing the linestring. Retained so pre-existing features still render.
          //
          // It now draws the same tile as Rutschgebiet: the catalogue dropped the mirrored
          // variant in 0.4.0 (no icon reports hasPatternB and 1113-pattern-b is gone from
          // the atlas), which is the same conclusion reached here — a mirrored tile is
          // redundant when reversing the geometry achieves it.
          "RutschgebietGespiegelt",
          babsImage(patternSpriteKey("1113")),
          "rettungsAchse",
          babsImage(patternSpriteKey("6106")),
          babsImage(patternSpriteKey("1203")),
        ],
        "line-opacity": 0.7,
        "line-width": ["interpolate", ["exponential", 1], ["zoom"], 12, 2, 19, 22],
      },
    },
    {
      id: "gl-draw-line-inactive-solidlines",
      type: "line",
      filter: createFilter([
        ["==", "$type", "LineString"],
        [
          "in",
          `${propPrefix}lineType`,
          "schwerBegehbar",
          "durchgeführteVerschiebung",
          "durchgeführterEinsatz",
          // Same solid stroke as durchgeführteVerschiebung, in the feature's red.
          "brandUebergriffErfolgt",
          // Debris field: 1116 has no pattern tile, so the catalogue's plain red boundary.
          "Truemmerbereich",
        ],
      ]),
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "line-opacity": 0.7,
        "line-width": 2,
      },
    },
    {
      id: "gl-draw-line-inactive-dashlines",
      type: "line",
      filter: createFilter([
        ["==", "$type", "LineString"],
        [
          "in",
          `${propPrefix}lineType`,
          "begehbar",
          "beabsichtigteVerschiebung",
          "beabsichtigterEinsatz",
          // Same dashed stroke as beabsichtigteVerschiebung; red comes from the feature's
          // own `color`, set by the line type.
          "brandUebergriffGefahr",
        ],
      ]),
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "line-dasharray": [6, 4],
        "line-width": 2,
      },
    },

    // === POINT STYLES ===
    {
      id: "gl-draw-polygon-and-line-vertex-stroke-inactive",
      type: "circle",
      filter: createFilter([
        ["==", "meta", "vertex"],
        ["==", "$type", "Point"],
      ]),
      paint: {
        "circle-radius": 5,
        "circle-color": "#fff",
      },
    },
    {
      id: "gl-draw-polygon-and-line-vertex-inactive",
      type: "circle",
      filter: createFilter([
        ["==", "meta", "vertex"],
        ["==", "$type", "Point"],
      ]),
      paint: {
        "circle-radius": 3,
        "circle-color": "#fbb03b",
      },
    },
    {
      id: "gl-draw-point-icon",
      type: "symbol",
      filter: createFilter([
        ["==", "$type", "Point"],
        ["has", `${propPrefix}icon`],
        ["!has", `${propPrefix}iconRotation`],
      ]),
      layout: {
        "icon-image": [
          "coalesce",
          // ["image", …] is what makes the fallback reachable: it resolves to null when
          // the key is absent from the sprite, whereas the previous ["concat", …] always
          // returned a non-null string, so no later branch was ever evaluated.
          ["image", legacyIconMatchExpression(propPrefix)],
          ["image", babsImage(markerSpriteKey("chevron-blue"))],
        ],
        "icon-pitch-alignment": "viewport",
        "icon-allow-overlap": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 20, 2.5],
      },
    },
    {
      id: "gl-draw-point-icon-rotation",
      type: "symbol",
      filter: createFilter([
        ["==", "$type", "Point"],
        ["has", `${propPrefix}icon`],
        ["has", `${propPrefix}iconRotation`],
      ]),
      layout: {
        "icon-image": [
          "coalesce",
          // ["image", …] is what makes the fallback reachable: it resolves to null when
          // the key is absent from the sprite, whereas the previous ["concat", …] always
          // returned a non-null string, so no later branch was ever evaluated.
          ["image", legacyIconMatchExpression(propPrefix)],
          ["image", babsImage(markerSpriteKey("chevron-blue"))],
        ],
        "icon-allow-overlap": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 20, 2.5],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-rotate": ["coalesce", ["get", `${propPrefix}iconRotation`], 0],
      },
    },

    // === TEXT STYLES ===
    {
      id: "gl-draw-text-special-placement-points-center",
      type: "symbol",
      filter: createFilter([
        ["==", "$type", "Point"],
        ["has", `${propPrefix}name`],
        ["has", `${propPrefix}icon`],
        ["in", `${propPrefix}icon`, ...CASUALTIES_CENTRED],
      ]),
      layout: {
        "text-field": ["coalesce", ["get", `${propPrefix}name`], ""],
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
      filter: createFilter([
        ["==", "$type", "Point"],
        ["has", `${propPrefix}name`],
        ["has", `${propPrefix}icon`],
        ["in", `${propPrefix}icon`, ...CASUALTIES_RIGHT],
      ]),
      layout: {
        "text-field": ["coalesce", ["get", `${propPrefix}name`], ""],
        "text-font": ["B612 Bold"],
        "text-anchor": "left",
        "text-offset": [1.5, 0.1],
        "text-ignore-placement": true,
        "text-justify": "right",
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 4, 18, 28],
      },
      paint: {
        "text-color": ["coalesce", ["get", `${propPrefix}color`], "#ff0000"],
      },
    },
    {
      id: "gl-draw-text-name-point",
      type: "symbol",
      filter: createFilter([
        ["has", `${propPrefix}name`],
        ["has", `${propPrefix}color`],
        ["!in", `${propPrefix}icon`, ...CASUALTIES_ALL],
        ["==", "$type", "Point"],
      ]),
      layout: {
        "text-field": ["coalesce", ["get", `${propPrefix}name`], ""],
        "text-font": ["B612 Bold"],
        "text-anchor": "center",
        "text-offset": [0, 2],
        "text-ignore-placement": true,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 2, 17, 16],
      },
      paint: {
        "text-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
      },
    },
    {
      id: "gl-draw-text-name-Polygon",
      type: "symbol",
      filter: createFilter([
        ["has", `${propPrefix}name`],
        ["==", "$type", "Polygon"],
      ]),
      layout: {
        "text-field": ["coalesce", ["get", `${propPrefix}name`], ""],
        "text-font": ["B612 Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 2, 17, 20],
        "symbol-placement": "line",
        "text-offset": [0, 0.5],
        "text-ignore-placement": true,
        "text-anchor": "center",
      },
      paint: {
        "text-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "text-halo-color": "#fff",
      },
    },
    {
      id: "gl-draw-text-name-LineString",
      type: "symbol",
      filter: createFilter([
        ["has", `${propPrefix}name`],
        ["==", "$type", "LineString"],
      ]),
      layout: {
        "text-field": ["coalesce", ["get", `${propPrefix}name`], ""],
        "text-font": ["B612 Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 2, 17, 20],
        "symbol-placement": "line-center",
        "text-offset": [0, 1],
        "text-ignore-placement": true,
        "text-anchor": "center",
      },
      paint: {
        "text-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "text-halo-color": "#fff",
      },
    },
  ];

  // Add drawing-mode-only styles if needed
  if (options.forDraw) {
    styles.push(
      // === ACTIVE STATE STYLES (drawing mode only) ===
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
        filter: [
          "all",
          ["==", "$type", "Point"],
          ["!=", "meta", "midpoint"],
          ["==", "active", "true"],
        ],
        paint: {
          "circle-radius": 5,
          "circle-color": "#fbb03b",
        },
      },
    );
  }

  return styles;
}
