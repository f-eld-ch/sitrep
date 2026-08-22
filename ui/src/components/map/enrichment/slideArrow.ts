import along from "@turf/along";
import bearing from "@turf/bearing";
import destination from "@turf/destination";
import { lineString } from "@turf/helpers";
import turfLength from "@turf/length";
import type { Feature, Position } from "geojson";
import { arrowFeatures, clampArrowLength, KM, spanBeforeCrossing } from "./arrow";
import type { ArrowConfig, SyntheticFeature } from "./types";

/** Shaft length as a fraction of the parent line's length. */
export const SLIDE_ARROW_LENGTH_RATIO = 0.25;
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
 * Clear space left between the boundary and each end of the arrow, as a fraction of the span
 * available to it. The arrow annotates the boundary rather than touching it, and the pattern
 * band it sits against is drawn up to 22px wide, so a shaft flush with the line disappears
 * into it.
 */
const SLIDE_ARROW_GAP_RATIO = 0.12;
/** Below this a line is a stray click, not a boundary: `along` degenerates and the bearing is noise. */
const SLIDE_MIN_LINE_KM = 1e-6;
/** See `spanBeforeCrossing`. */
const SLIDE_SELF_CROSSING_RATIO = 0.1;

/**
 * The slide-direction arrow: a straight shaft leaving the boundary's midpoint at a right
 * angle, tipped with a chevron.
 *
 * It sits on the side the pattern's teeth do not occupy (see `SLIDE_ARROW_SIDE`) and points
 * *back at* the boundary: the slide runs onto the line, so the head is the end nearest it.
 * Neither end touches — a shaft flush with the line vanishes into a pattern band drawn up to
 * 22px wide.
 */
export const buildSlideArrow = (
  parentId: Feature["id"],
  coordinates: Position[],
  config: ArrowConfig,
  /** The feature's own stroke colour, so a recoloured boundary keeps its arrow in step. */
  featureColor: string | undefined,
): SyntheticFeature[] => {
  if (coordinates.length < 2) {
    return [];
  }

  const line = lineString(coordinates);
  const total = turfLength(line, KM);
  // Negated so a NaN length is rejected too. Below the floor every vertex effectively
  // coincides and there is no direction to be perpendicular to.
  if (!(total > SLIDE_MIN_LINE_KM)) {
    return [];
  }

  const half = total / 2;
  const base = along(line, half, KM);
  const before = along(line, Math.max(half - total * SLIDE_BEARING_SPAN, 0), KM);
  const after = along(line, Math.min(half + total * SLIDE_BEARING_SPAN, total), KM);

  // Away from the boundary, on the side the teeth do not occupy. The arrow is then built
  // back along this bearing, so it approaches the line rather than springing off it.
  const slideBearing = bearing(before, after) + SLIDE_ARROW_SIDE * 90;

  const nominal = clampArrowLength(total, config, SLIDE_ARROW_MIN_KM, SLIDE_ARROW_MAX_KM);
  // A boundary that curves back on itself — the usual shape — would otherwise have the arrow
  // run across the bowl and bury its head in the pattern band on the far side.
  const span = spanBeforeCrossing(base, slideBearing, nominal, line, SLIDE_SELF_CROSSING_RATIO);

  // Both ends are held off: the head stops short of the line rather than touching it, and the
  // tail stops short of whatever the probe found on the far side.
  const gap = span * SLIDE_ARROW_GAP_RATIO;
  const tip = destination(base, gap, slideBearing, KM);
  const tail = destination(base, span - gap, slideBearing, KM);

  return arrowFeatures(
    parentId,
    "slide",
    tail.geometry.coordinates,
    tip.geometry.coordinates,
    // Down the shaft, from the far end back to the boundary — the reverse of `slideBearing`.
    slideBearing + 180,
    config.icon,
    featureColor ?? config.color,
  );
};
