import along from "@turf/along";
import bbox from "@turf/bbox";
import bearing from "@turf/bearing";
import destination from "@turf/destination";
import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import turfLength from "@turf/length";
import lineIntersect from "@turf/line-intersect";
import { markerSpriteKey } from "@f-eld-ch/babs-core";
import { babsImage } from "components/babs/iconResolver";
import { Colors } from "components/babs/lineAndZoneTypes";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry, Position } from "geojson";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";

/** Shaft length as a fraction of the parent line's length. */
const SLIDE_ARROW_LENGTH_RATIO = 0.25;
/** Clamps on that fraction, so a hand-drawn stub still shows and a long boundary stays readable. */
const SLIDE_ARROW_MIN_KM = 0.025;
const SLIDE_ARROW_MAX_KM = 0.5;
/**
 * How far either side of the midpoint the local bearing is measured, as a fraction of the
 * line's length. Taken across a span rather than between the two vertices flanking the
 * midpoint so a kink landing exactly there does not swing the arrow off the perpendicular.
 */
const SLIDE_BEARING_SPAN = 0.05;
/**
 * Which perpendicular the arrow occupies, as a signed multiple of 90° on the local bearing:
 * -1 is the left of travel, +1 the right.
 *
 * Fixed to the draw direction, not derived from the shape. maplibre's line bucket extrudes
 * its `up = false` half-vertex along `perp(direction)`, and the line-pattern fragment shader
 * maps that vertex to texture y = 0 — the top row of the tile. Tile space is y-down, so for
 * an eastward line that is south: the top of a pattern tile always lands on the right of
 * travel. The `1113-pattern` tile carries its teeth in those top rows, so the teeth fall on
 * the right of travel, and the arrow shares that side — set by eye against the rendered
 * symbol, so flip this one constant if it ever needs to go the other way.
 *
 * Tying the arrow to draw direction rather than to curvature is what makes reversing a
 * linestring mirror the whole symbol at once, teeth and arrow together — which is how the
 * mirrored line type came to be retired.
 */
const SLIDE_ARROW_SIDE = 1;
/**
 * Clear space left between the boundary and each end of the arrow, as a fraction of the
 * span available to it. The arrow annotates the boundary rather than touching it, and the
 * pattern band it sits against is drawn up to 22px wide, so a shaft flush with the line
 * disappears into it.
 */
const SLIDE_ARROW_GAP_RATIO = 0.12;
/** Below this a line is a stray click, not a boundary: `along` degenerates and the bearing is noise. */
const SLIDE_MIN_LINE_KM = 1e-6;
/**
 * Crossings nearer than this fraction of the arrow's nominal length are the boundary the
 * arrow springs from, not the far side of a bend.
 *
 * The midpoint is found along a great circle while the boundary is drawn as a planar chord,
 * so on a straight line the two miss each other by a metre or so and the ray re-crosses its
 * own boundary almost immediately. Discounting only an exact zero left the arrow truncated
 * to that metre, which is the common case rendered invisible.
 */
const SLIDE_SELF_CROSSING_RATIO = 0.1;
/**
 * Flow-arrow shaft length, as a fraction of the outer ring's bounding-box diagonal.
 *
 * Deliberately not the perimeter, which would be the obvious analogue of the slide arrow's
 * `total`: perimeter grows with how finely the boundary was digitised, so a flood zone
 * traced along a river with two hundred vertices would get an arrow several times the size
 * of the zone it annotates. The diagonal tracks how large the zone actually looks.
 */
const FLOW_ARROW_LENGTH_RATIO = 0.12;
/**
 * Clamps on that fraction. Tighter than the slide arrow's: this one is a mark against one
 * edge of an area rather than a span across a line, so it reads better short.
 */
const FLOW_ARROW_MIN_KM = 0.01;
const FLOW_ARROW_MAX_KM = 0.17;
/** Below this a ring is a stray click, with no extent to scale an arrow against. */
const FLOW_MIN_EXTENT_KM = 1e-6;
/**
 * Stroke width for the stretch of outline the arrow springs from, against the 2px every
 * other line is drawn at.
 *
 * This is the thickened-outline half of the catalogue's 1115, and it doubles as the answer
 * to "which edge is the arrow attached to" while the zone is being edited — mapbox-gl-draw
 * tags vertices with a `coord_path` whose last index depends on the vertex count, so the
 * closing edge's endpoints cannot be picked out by a style filter.
 */
const FLOW_EDGE_WIDTH = 4;
/**
 * As `SLIDE_SELF_CROSSING_RATIO`, but load-bearing rather than defensive: the flow arrow's
 * anchor *is* a ring vertex, so the ray leaves through the boundary by construction and
 * would otherwise be truncated to nothing.
 */
const FLOW_SELF_CROSSING_RATIO = 0.1;
/**
 * Two positions this close are the same vertex. Rings close by repeating their first
 * position, and finishing a polygon on top of an existing vertex leaves duplicates — both
 * make the tangent bearing meaningless. 1e-9° is well under a millimetre.
 */
const VERTEX_EPSILON_DEG = 1e-9;

/**
 * The two features every generated arrow is made of: a shaft the enriched line layer
 * strokes, and a chevron the enriched symbol layer places at its tip.
 *
 * Shared because the *contract* is shared — the `:kind` / `:kind-tip` id suffixes, `parent`,
 * and above all the rotation convention below — not because the geometry is. Each builder
 * still works out its own anchor, bearing and length; this only writes the result down.
 */
const arrowFeatures = (
  parentId: Feature["id"],
  /** Distinguishes this arrow's synthetic ids from any other the parent carries. */
  kind: string,
  tail: Position,
  tip: Position,
  /** Direction of travel, tail towards tip. */
  aim: number,
  icon: string,
  color: string,
): Feature<Geometry, GeoJsonProperties>[] => {
  const shaft = lineString([tail, tip]);
  shaft.id = `${parentId}:${kind}`;
  shaft.properties = { parent: parentId, color };

  const head = point(tip);
  head.id = `${parentId}:${kind}-tip`;
  head.properties = {
    parent: parentId,
    icon,
    // Minus, not plus: the chevron artwork points east and `icon-rotate` is measured
    // clockwise from north. The end caps reach the same place via `+ offset` only because
    // they feed in a *reversed* bearing; this one is already a direction of travel, so
    // adding would aim the head back up its own shaft.
    iconRotation: aim - CHEVRON_BEARING_OFFSET,
  };

  return [shaft, head];
};

/**
 * The slide-direction arrow: a straight shaft leaving the boundary's midpoint at a right
 * angle, tipped with a chevron.
 *
 * It sits on the side the pattern's teeth do not occupy (see `SLIDE_ARROW_SIDE`) and points
 * *back at* the boundary: the slide runs onto the line, so the head is the end nearest it.
 * Neither end touches — a shaft flush with the line vanishes into a pattern band drawn up
 * to 22px wide.
 */
const buildSlideArrow = (
  parentId: Feature["id"],
  coordinates: Position[],
  config: SlideArrowConfig,
  /** The feature's own stroke colour, so a recoloured boundary keeps its arrow in step. */
  featureColor: string | undefined,
): Feature<Geometry, GeoJsonProperties>[] => {
  if (coordinates.length < 2) {
    return [];
  }

  const line = lineString(coordinates);
  const total = turfLength(line, { units: "kilometers" });
  // Negated so a NaN length is rejected too. Below the floor every vertex effectively
  // coincides and there is no direction to be perpendicular to.
  if (!(total > SLIDE_MIN_LINE_KM)) {
    return [];
  }

  const half = total / 2;
  const base = along(line, half, { units: "kilometers" });
  const before = along(line, Math.max(half - total * SLIDE_BEARING_SPAN, 0), {
    units: "kilometers",
  });
  const after = along(line, Math.min(half + total * SLIDE_BEARING_SPAN, total), {
    units: "kilometers",
  });
  const alongBearing = bearing(before, after);

  // Away from the boundary, on the side the teeth do not occupy. The arrow is then built
  // back along this bearing, so it approaches the line rather than springing off it.
  const slideBearing = alongBearing + SLIDE_ARROW_SIDE * 90;

  // Never longer than the line it annotates, so a stray short line gets a stub rather than
  // a spike several times its own size.
  const nominal = Math.min(
    Math.max(total * config.lengthRatio, Math.min(SLIDE_ARROW_MIN_KM, total)),
    SLIDE_ARROW_MAX_KM,
  );

  // A boundary that curves back on itself — the usual shape — would otherwise have the arrow
  // run straight across the bowl and bury its head in the pattern band on the far side. Probe
  // along the ray and stop at the first crossing back over the boundary.
  const reach = destination(base, nominal, slideBearing, { units: "kilometers" });
  const crossings = lineIntersect(
    lineString([base.geometry.coordinates, reach.geometry.coordinates]),
    line,
  )
    .features.map((crossing) => distance(base, crossing, { units: "kilometers" }))
    // The base sits on the boundary, so the ray re-crosses it immediately; ignore that.
    .filter((km) => km > nominal * SLIDE_SELF_CROSSING_RATIO);
  const span = crossings.length > 0 ? Math.min(nominal, ...crossings) : nominal;

  // The arrow runs *towards* the boundary: the slide moves onto the line, so the head is
  // the end nearest it. Both ends are held off — the head stops short of the line rather
  // than touching it, and the tail stops short of whatever the probe found on the far side.
  const gap = span * SLIDE_ARROW_GAP_RATIO;
  const tip = destination(base, gap, slideBearing, { units: "kilometers" });
  const tail = destination(base, span - gap, slideBearing, { units: "kilometers" });
  // Down the shaft, from the far end back to the boundary — the reverse of `slideBearing`.
  const aim = slideBearing + 180;

  return arrowFeatures(
    parentId,
    "slide",
    tail.geometry.coordinates,
    tip.geometry.coordinates,
    aim,
    config.icon,
    featureColor ?? config.color,
  );
};

const samePosition = (a: Position, b: Position): boolean =>
  Math.abs(a[0] - b[0]) < VERTEX_EPSILON_DEG && Math.abs(a[1] - b[1]) < VERTEX_EPSILON_DEG;

/**
 * The ring with its closing repeat removed, so the last entry is the last vertex the user
 * actually placed rather than a copy of the first.
 *
 * Pops in a loop rather than dropping a single position: finishing a polygon on top of the
 * first vertex can leave more than one copy, and an import may repeat it too.
 */
const openRing = (ring: Position[]): Position[] => {
  const open = ring.slice();
  while (open.length > 1 && samePosition(open[open.length - 1], open[0])) {
    open.pop();
  }
  return open;
};

/**
 * Twice the signed area of a ring, by the shoelace formula. Positive means the ring is
 * wound counter-clockwise, negative clockwise.
 *
 * Only the sign is used, so working in raw degrees is fine — no projection needed. This is
 * what tells the arrow which perpendicular points out of the zone rather than into it: on a
 * counter-clockwise ring the interior lies to the left of travel, so outward is the right.
 */
const ringWinding = (ring: Position[]): number => {
  let doubleArea = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    doubleArea += x1 * y2 - x2 * y1;
  }
  return doubleArea;
};

/**
 * The flow-direction arrow: a straight shaft springing from the middle of the outer ring's
 * closing edge, leaving it at a right angle, tipped with a chevron.
 *
 * The closing edge — last vertex back to the first — is the one the user never clicks: it
 * appears when the ring closes. That makes it the easiest to predict while drawing and the
 * easiest to aim afterwards, since moving either of its two endpoints swings the arrow.
 * Nothing extra has to be persisted as a result.
 *
 * Unlike the slide arrow the tail sits *on* the boundary: a polygon stroke is 2px, so there
 * is no pattern band to clear, and springing from the outline is what makes the arrow read
 * as belonging to it.
 */
const buildFlowArrow = (
  parentId: Feature["id"],
  kind: string,
  ring: Position[],
  config: FlowArrowConfig,
  /** The feature's own stroke colour, so a recoloured zone keeps its arrow in step. */
  featureColor: string | undefined,
): Feature<Geometry, GeoJsonProperties>[] => {
  const open = openRing(ring);
  // Fewer than three distinct vertices enclose nothing, so there is no inside for the arrow
  // to point out of.
  if (open.length < 3) {
    return [];
  }

  // The closing edge, running from the last vertex back to the first. `openRing` guarantees
  // those two differ, so the edge always has a direction.
  const from = open[open.length - 1];
  const to = open[0];
  const alongClosingEdge = bearing(point(from), point(to));

  // At a right angle to that edge, on whichever side lies outside the ring. The side comes
  // from the winding rather than from a containment probe: only the sign of the signed area
  // is needed, which is exact, where a probe offset from the boundary can land either side.
  const flowBearing = alongClosingEdge + (ringWinding(open) > 0 ? 90 : -90);

  // Springs from the middle of the edge rather than from a vertex. A corner is shared by two
  // edges, so an arrow planted there reads as belonging to neither, and the perpendicular at
  // a corner does not cleanly separate inside from out.
  const segment = distance(point(from), point(to), { units: "kilometers" });
  const base = destination(point(from), segment / 2, alongClosingEdge, { units: "kilometers" });
  const tail = base.geometry.coordinates;

  // Measured against the *closed* ring: the segment from the last vertex back to the first
  // is real boundary, and on a convex zone it is the one the arrow is likeliest to meet.
  const boundary = lineString([...open, open[0]]);
  const [minX, minY, maxX, maxY] = bbox(boundary);
  const extent = distance(point([minX, minY]), point([maxX, maxY]), { units: "kilometers" });
  // Negated so a NaN extent is rejected too.
  if (!(extent > FLOW_MIN_EXTENT_KM)) {
    return [];
  }

  // Never longer than the zone it annotates, so a hand-drawn stub gets a stub.
  const nominal = Math.min(
    Math.max(extent * config.lengthRatio, Math.min(FLOW_ARROW_MIN_KM, extent)),
    FLOW_ARROW_MAX_KM,
  );

  // The outward normal is not guaranteed to stay outside — on a concave ring it can re-enter.
  // The bearing is honoured either way, since it follows from the boundary the user drew, but
  // the ray stops at the first crossing so a wrong-way arrow stays a local mark rather than
  // spearing the whole zone.
  const reach = destination(base, nominal, flowBearing, { units: "kilometers" });
  const crossings = lineIntersect(lineString([tail, reach.geometry.coordinates]), boundary)
    .features.map((crossing) => distance(base, crossing, { units: "kilometers" }))
    // The tail sits on the boundary, so the ray leaves through it; ignore that crossing.
    .filter((km) => km > nominal * FLOW_SELF_CROSSING_RATIO);
  const span = crossings.length > 0 ? Math.min(nominal, ...crossings) : nominal;

  const tip = destination(base, span, flowBearing, { units: "kilometers" });
  const color = featureColor ?? config.color;

  // The closing edge itself, redrawn heavier. Emitted before the shaft so the shaft paints
  // over the join rather than being cut by it.
  const edge = lineString([from, to]);
  edge.id = `${parentId}:${kind}-edge`;
  edge.properties = { parent: parentId, color, width: FLOW_EDGE_WIDTH };

  return [
    edge,
    ...arrowFeatures(
      parentId,
      kind,
      tail,
      tip.geometry.coordinates,
      flowBearing,
      config.icon,
      color,
    ),
  ];
};

const enrichFeature = (
  f: Feature<Geometry, GeoJsonProperties>,
): Feature<Geometry, GeoJsonProperties>[] => {
  if (f === undefined) {
    return [];
  }

  const features: Feature<Geometry, GeoJsonProperties>[] = [];

  // A single-coordinate LineString can arrive via import, and every path below reads at
  // least two vertices.
  if (f.geometry.type === "LineString" && f.geometry.coordinates.length >= 2) {
    const enrich: EnrichLineConfig | undefined = EnrichLineStringMap[f.properties?.lineType];
    if (enrich !== undefined) {
      if (enrich.iconStart) {
        const startPoint = point(f.geometry.coordinates[0]);
        startPoint.id = `${f.id}:start`;
        startPoint.properties = {
          parent: f.id,
          // Already a fully-namespaced sprite id; do not prefix again.
          icon: enrich.iconStart,
          iconRotation:
            bearing(point(f.geometry.coordinates[0]), point(f.geometry.coordinates[1])) +
            enrich.iconRotation,
        };
        features.push(startPoint);
      }

      if (enrich.iconEnd) {
        const endPoint = point(f.geometry.coordinates.slice(-1)[0]);
        endPoint.id = `${f.id}:end`;
        endPoint.properties = {
          parent: f.id,
          icon: enrich.iconEnd,
          iconRotation:
            bearing(
              f.geometry.coordinates.slice(-1)[0],
              point(f.geometry.coordinates.slice(-2)[0]),
            ) + enrich.iconRotation,
        };
        features.push(endPoint);
      }

      if (enrich.slideArrow) {
        features.push(
          ...buildSlideArrow(f.id, f.geometry.coordinates, enrich.slideArrow, f.properties?.color),
        );
      }
    }
  }

  if (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") {
    const flowArrow = EnrichPolygonMap[f.properties?.zoneType]?.flowArrow;
    if (flowArrow !== undefined) {
      // Outer rings only. A hole is interior detail, and an arrow springing off one would
      // point into the zone rather than out of it.
      const outerRings: Position[][] =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates[0]]
          : f.geometry.coordinates.map((part) => part[0]);

      outerRings.forEach((ring, index) => {
        if (ring === undefined) {
          return;
        }
        features.push(
          // A multipart zone gets one arrow per part, so the synthetic ids must stay distinct.
          ...buildFlowArrow(
            f.id,
            outerRings.length > 1 ? `flow-${index}` : "flow",
            ring,
            flowArrow,
            f.properties?.color,
          ),
        );
      });
    }
  }

  return features;
};

/**
 * A direction indicator built from the line's own shape rather than drawn at its ends —
 * see `buildSlideArrow` for how the side is chosen.
 */
interface SlideArrowConfig {
  /** Fully-namespaced chevron sprite for the arrow head. */
  icon: string;
  /** Shaft stroke colour, read back off `properties.color` by the enriched line layer. */
  color: string;
  /** Shaft length as a fraction of the parent line's length. */
  lengthRatio: number;
}

/**
 * A flow-direction arrow generated from a polygon's own outline.
 *
 * The polygon counterpart of `SlideArrowConfig`. Same fields, but `lengthRatio` is read
 * against a different measure — the ring's bounding-box diagonal rather than a line's
 * length — so they stay separate types rather than one whose ratio means two things.
 */
interface FlowArrowConfig {
  /** Fully-namespaced chevron sprite for the arrow head. */
  icon: string;
  /** Shaft stroke colour, read back off `properties.color` by the enriched line layer. */
  color: string;
  /** Shaft length as a fraction of the outer ring's bounding-box diagonal. */
  lengthRatio: number;
}

interface EnrichPolygonConfig {
  flowArrow?: FlowArrowConfig;
}

interface EnrichLineConfig {
  /**
   * Fully-namespaced sprite image id, e.g. `babs:1101` or `babs:marker-chevron-blue`.
   *
   * Unlike `properties.icon` on real features — which stores a readable alias and is
   * resolved by the `match` expression in styleGenerator — these caps live on synthetic
   * features that are rebuilt on every render and never persisted. So there is no
   * data-compatibility concern and the sprite key can be used directly.
   */
  iconStart?: string;
  iconEnd?: string;
  iconRotation: number;
  /**
   * Perpendicular direction indicator derived from the geometry. Unlike the caps above
   * this is not tied to an endpoint, so a line type may carry it with no cap at all.
   */
  slideArrow?: SlideArrowConfig;
}

/**
 * Direction arrowheads, from the catalogue's purpose-built markers. These previously
 * borrowed the `Others.Einsatz` / `Others.Verschiebung` glyphs from the bundled registry.
 *
 * The colour matches the stroke the line type is drawn in (see `LineTypes`), and the
 * single/double distinction is meaningful: *Einsatz* is a double chevron, *Verschiebung*
 * and reconnaissance a single one.
 */
const ARROW = {
  movement: babsImage(markerSpriteKey("chevron-blue")),
  deployment: babsImage(markerSpriteKey("double-chevron-blue")),
  fireSpread: babsImage(markerSpriteKey("chevron-red")),
} as const;

/**
 * Rotation added to a computed bearing to line the artwork up with it. The chevrons are
 * drawn pointing east, whereas a bearing is measured from north.
 */
const CHEVRON_BEARING_OFFSET = 90;

/** End-of-line arrowhead only — start is left bare so the line reads directionally. */
const directional = (arrow: string = ARROW.movement): EnrichLineConfig => ({
  iconStart: undefined,
  iconEnd: arrow,
  iconRotation: CHEVRON_BEARING_OFFSET,
});

/**
 * No cap at all: the whole indicator is the perpendicular slide arrow, drawn from the
 * boundary's midpoint towards the concave side.
 */
const slideDirection = (): EnrichLineConfig => ({
  iconRotation: CHEVRON_BEARING_OFFSET,
  slideArrow: {
    icon: ARROW.fireSpread,
    color: Colors.Red,
    lengthRatio: SLIDE_ARROW_LENGTH_RATIO,
  },
});

/**
 * Damage severity marked at both ends of the affected road segment. These are semantic
 * symbols rather than arrowheads, so they stay catalogue icons rather than becoming
 * chevrons: 1101 Beschädigung, 1102 Teilzerstörung, 1103 Totalzerstörung.
 */
const damageExtent = (id: "1101" | "1102" | "1103"): EnrichLineConfig => ({
  iconStart: babsImage(id),
  iconEnd: babsImage(id),
  iconRotation: 90,
});

/**
 * Which line types get start/end caps, and which sprite image each cap uses.
 * Exported so `styleImageResolution.test.ts` can assert every cap actually exists in the
 * sprite atlas — these ids bypass the `match` expression, so nothing else would catch a
 * typo or an unprefixed key here.
 */
export const EnrichLineStringMap: Record<string, EnrichLineConfig> = {
  begehbar: damageExtent("1101"),
  schwerBegehbar: damageExtent("1102"),
  unpassierbar: damageExtent("1103"),
  beabsichtigteErkundung: directional(),
  durchgeführteErkundung: directional(),
  beabsichtigteVerschiebung: directional(),
  rettungsAchse: directional(),
  durchgeführteVerschiebung: directional(),
  // Einsatz takes the double chevron; it previously reused the single one, which made it
  // indistinguishable from Verschiebung on the map.
  beabsichtigterEinsatz: directional(ARROW.deployment),
  durchgeführterEinsatz: directional(ARROW.deployment),
  // Fire spread: the movement line styles in red, so a red chevron to match the stroke.
  brandUebergriffGefahr: directional(ARROW.fireSpread),
  brandUebergriffErfolgt: directional(ARROW.fireSpread),
  // The only entry whose indicator is not a cap: the catalogue draws Rutschgebiet with a
  // slide arrow across the boundary rather than a symbol at either end.
  Rutschgebiet: slideDirection(),
};

/**
 * Which zone types get an indicator built from their geometry.
 *
 * Exported for the same reason as `EnrichLineStringMap`: these sprite ids are written
 * straight onto synthetic features and read by a bare `["get", "icon"]`, bypassing the
 * `match` expression, so only `styleImageResolution.test.ts` would catch a typo here.
 */
export const EnrichPolygonMap: Record<string, EnrichPolygonConfig> = {
  // 1115 is a flooded area *with a flow direction* — the arrow is part of the catalogue
  // symbol rather than decoration, which is why it is generated rather than left to the user.
  UeberschwemmtesGebiet: {
    flowArrow: {
      icon: ARROW.fireSpread,
      color: Colors.Red,
      lengthRatio: FLOW_ARROW_LENGTH_RATIO,
    },
  },
};

const EnrichedSymbolSource = (props: EnrichedFeaturesProps) => {
  const { id, featureCollection } = props;
  const enrichedFC: FeatureCollection = {
    type: "FeatureCollection",
    features: [],
  };
  // The selected feature is enriched too. It used to be skipped, which meant the indicator
  // vanished for exactly as long as you were editing the geometry that determines it — and
  // the flow arrow is aimed by dragging vertices, so that is when seeing it matters most.
  // These are synthetic features in their own source, so they do not collide with the
  // active-state styling mapbox-gl-draw puts on the feature itself.
  //
  // Memoised because on the active layer this now runs against a collection that changes on
  // every animation frame of a vertex drag (see `useLiveDrawGeometry` in Map.tsx), rather
  // than once per save.
  enrichedFC.features = useMemo(
    () =>
      featureCollection.features
        .filter((f) => f.properties?.deletedAt === null)
        .flatMap((f) => enrichFeature(f)),
    [featureCollection],
  );

  return (
    <Source key={id} type="geojson" data={enrichedFC}>
      {/*
        Slide-arrow shafts. Painted to match `gl-draw-line-inactive-solidlines` in
        styleGenerator, so the shaft is the same stroke a brandUebergriffErfolgt line gets.
        It has to be declared here rather than there: those layers bind to the draw and
        display sources and never see this overlay. Declared before the symbol layer so the
        chevron sits on top of its own shaft.
      */}
      <Layer
        id={`${id}-enriched-lines`}
        type="line"
        filter={["==", ["geometry-type"], "LineString"]}
        layout={{
          "line-cap": "round",
          "line-join": "round",
        }}
        paint={{
          "line-color": ["coalesce", ["get", "color"], "#000000"],
          "line-opacity": 0.7,
          // Data-driven so the emphasised stretch of outline can share this layer with the
          // arrow shafts instead of needing one of its own.
          "line-width": ["coalesce", ["get", "width"], 2],
        }}
      />
      <Layer
        id={`${id}-enriched-points`}
        type="symbol"
        // Without this the layer would also place an icon at each shaft's centre, since a
        // symbol layer happily anchors a LineString.
        filter={["==", ["geometry-type"], "Point"]}
        layout={{
          // ["image", …] is required for coalesce to fall through: a bare ["get", …]
          // yields a non-null string even when the sprite has no such image, so the
          // fallback was unreachable and an unknown cap rendered blank. The previous
          // fallback, "default_marker", existed in no atlas either.
          "icon-image": ["coalesce", ["image", ["get", "icon"]], ["image", ARROW.movement]],
          "icon-allow-overlap": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.1, 17, 1.4],
          "icon-rotation-alignment": "map",
          "icon-pitch-alignment": "map",
          "icon-rotate": ["coalesce", ["get", "iconRotation"], 0],
        }}
      />
    </Source>
  );
};

const EnrichedFeaturesSource = (props: EnrichedFeaturesProps) => {
  if (props.id === undefined) {
    return null;
  }

  return <EnrichedSymbolSource {...props} />;
};

interface EnrichedFeaturesProps {
  id: string | undefined;
  featureCollection: FeatureCollection;
  selectedFeature?: string | number | undefined;
}

export { enrichFeature, EnrichedFeaturesSource, EnrichedSymbolSource };

export default EnrichedFeaturesSource;
