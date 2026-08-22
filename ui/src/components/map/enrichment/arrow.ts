import destination from "@turf/destination";
import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import lineIntersect from "@turf/line-intersect";
import { markerSpriteKey } from "@f-eld-ch/babs-core";
import { babsImage } from "components/babs/iconResolver";
import type { Feature, LineString, Point, Position } from "geojson";
import type { ArrowConfig, SyntheticFeature } from "./types";

/**
 * The pieces every generated arrow is built from, shared by the slide and flow arrows.
 *
 * What they have in common is the *contract*, not the geometry: the id suffixes, the
 * `parent` back-reference, the rotation convention, and how a length is bounded. Each
 * builder still works out its own anchor, bearing and extent.
 */

/** Every measurement in this pipeline is in kilometres. */
export const KM = { units: "kilometers" } as const;

/**
 * Direction arrowheads, from the catalogue's purpose-built markers.
 *
 * The colour matches the stroke the line type is drawn in (see `LineTypes`), and the
 * single/double distinction is meaningful: *Einsatz* is a double chevron, *Verschiebung* and
 * reconnaissance a single one.
 */
export const ARROW = {
  movement: babsImage(markerSpriteKey("chevron-blue")),
  deployment: babsImage(markerSpriteKey("double-chevron-blue")),
  fireSpread: babsImage(markerSpriteKey("chevron-red")),
} as const;

/**
 * Rotation added to a computed bearing to line the artwork up with it. The chevrons are
 * drawn pointing east, whereas a bearing is measured from north.
 */
export const CHEVRON_BEARING_OFFSET = 90;

/**
 * A shaft the enriched line layer strokes, and a chevron the enriched symbol layer places at
 * its tip.
 */
export const arrowFeatures = (
  parentId: Feature["id"],
  /** Distinguishes this arrow's synthetic ids from any other the parent carries. */
  kind: string,
  tail: Position,
  tip: Position,
  /** Direction of travel, tail towards tip. */
  aim: number,
  icon: string,
  color: string,
): SyntheticFeature[] => {
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
 * An arrow length proportional to the feature it annotates, bounded at both ends.
 *
 * The lower bound is itself capped at `extent`, so a stray short feature gets a stub rather
 * than a spike several times its own size.
 */
export const clampArrowLength = (
  extent: number,
  config: ArrowConfig,
  min: number,
  max: number,
): number => Math.min(Math.max(extent * config.lengthRatio, Math.min(min, extent)), max);

/**
 * How far a ray of `nominal` km can run from `base` on `aim` before it meets `boundary`
 * again — so an arrow stops at the far wall of a bend instead of spearing across it.
 *
 * `base` sits on the boundary in both callers, so the ray departs through it immediately.
 * Crossings nearer than `selfCrossingRatio` of the nominal length are that departure rather
 * than a genuine far side, and are discounted. That threshold is a fraction rather than an
 * exact zero because the two are not always coincident: a midpoint found along a great
 * circle sits a little off a boundary drawn as a planar chord.
 */
export const spanBeforeCrossing = (
  base: Feature<Point>,
  aim: number,
  nominal: number,
  boundary: Feature<LineString>,
  selfCrossingRatio: number,
): number => {
  const reach = destination(base, nominal, aim, KM);
  const crossings = lineIntersect(
    lineString([base.geometry.coordinates, reach.geometry.coordinates]),
    boundary,
  )
    .features.map((crossing) => distance(base, crossing, KM))
    .filter((km) => km > nominal * selfCrossingRatio);

  return crossings.length > 0 ? Math.min(nominal, ...crossings) : nominal;
};
