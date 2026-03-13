import type { FilterSpecification } from "maplibre-gl";
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
        ["in", `${propPrefix}zoneType`, "Schadengebiet", "Einsatzraum"],
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
        ["in", `${propPrefix}zoneType`, "Brandzone", "Zerstoerung"],
      ]),
      paint: {
        "fill-pattern": [
          "match",
          ["get", `${propPrefix}zoneType`],
          "Brandzone",
          "babs:PatternBrandzone",
          "Zerstoerung",
          "babs:PatternZerstoert",
          "babs:PatternBrandzone",
        ],
        "fill-opacity": 1,
      },
    },
    {
      id: "gl-draw-polygon-fill-inactive",
      type: "fill",
      filter: createFilter([
        ["==", "$type", "Polygon"],
        [
          "!in",
          `${propPrefix}zoneType`,
          "Brandzone",
          "Zerstoerung",
          "Schadengebiet",
          "Einsatzraum",
        ],
      ]),
      paint: {
        "fill-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "fill-outline-color": ["coalesce", ["get", `${propPrefix}color`], "#000000"],
        "fill-opacity": 0.5,
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
          "babs:PatternLineUnpassierbar",
          "beabsichtigteErkundung",
          "babs:PatternLineBeabsichtigteErkundung",
          "durchgeführteErkundung",
          "babs:PatternLineErkundung",
          "Rutschgebiet",
          "babs:PatternLineRutschgebiet",
          "RutschgebietGespiegelt",
          "babs:PatternLineRutschgebietGespiegelt",
          "babs:PatternLineUnpassierbar",
          "rettungsAchse",
          "babs:PatternLineRettungsachse",
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
          ["concat", "babs:", ["get", `${propPrefix}icon`]],
          ["get", `${propPrefix}icon`],
          "default_marker",
        ],
        "icon-pitch-alignment": "viewport",
        "icon-allow-overlap": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.1, 17, 1.4],
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
          ["concat", "babs:", ["get", `${propPrefix}icon`]],
          ["get", `${propPrefix}icon`],
          "default_marker",
        ],
        "icon-allow-overlap": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.1, 17, 1.4],
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
        ["in", `${propPrefix}icon`, "EingesperrteAbgeschnittene", "Obdachlose"],
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
        ["in", `${propPrefix}icon`, "Tote", "Vermisste", "Verletzte"],
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
        [
          "!in",
          `${propPrefix}icon`,
          "EingesperrteAbgeschnittene",
          "Obdachlose",
          "Tote",
          "Vermisste",
          "Verletzte",
        ],
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
