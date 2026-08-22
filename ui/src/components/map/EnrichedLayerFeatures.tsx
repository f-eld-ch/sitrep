import along from "@turf/along";
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

  const shaft = lineString([tail.geometry.coordinates, tip.geometry.coordinates]);
  shaft.id = `${parentId}:slide`;
  shaft.properties = { parent: parentId, color: featureColor ?? config.color };

  const head = point(tip.geometry.coordinates);
  head.id = `${parentId}:slide-tip`;
  head.properties = {
    parent: parentId,
    icon: config.icon,
    // Minus, not plus: the chevron artwork points east and `icon-rotate` is measured
    // clockwise from north. The end caps reach the same place via `+ offset` only because
    // they feed in a *reversed* bearing; this one is already a direction of travel, so
    // adding would aim the head back up its own shaft.
    iconRotation: aim - CHEVRON_BEARING_OFFSET,
  };

  return [shaft, head];
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

const EnrichedSymbolSource = (props: EnrichedFeaturesProps) => {
  const { id, featureCollection } = props;
  const enrichedFC: FeatureCollection = {
    type: "FeatureCollection",
    features: [],
  };
  enrichedFC.features = Object.assign(
    [],
    featureCollection.features
      .filter((f) => f.properties?.deletedAt === null)
      .filter((f) => f.id !== props.selectedFeature)
      .flatMap((f) => enrichFeature(f)),
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
          "line-width": 2,
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
