import bbox from "@turf/bbox";
import bearing from "@turf/bearing";
import destination from "@turf/destination";
import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import type { Feature, Position } from "geojson";
import { arrowFeatures, clampArrowLength, KM, spanBeforeCrossing } from "./arrow";
import type { ArrowConfig, SyntheticFeature } from "./types";

/**
 * Shaft length as a fraction of the outer ring's bounding-box diagonal.
 *
 * Deliberately not the perimeter, which would be the obvious analogue of the slide arrow's
 * line length: perimeter grows with how finely the boundary was digitised, so a flood zone
 * traced along a river with two hundred vertices would get an arrow several times the size of
 * the zone it annotates. The diagonal tracks how large the zone actually looks.
 */
export const FLOW_ARROW_LENGTH_RATIO = 0.12;
/**
 * Clamps on that fraction. Tighter than the slide arrow's: this one is a mark against one
 * edge of an area rather than a span across a line, so it reads better short.
 */
const FLOW_ARROW_MIN_KM = 0.01;
const FLOW_ARROW_MAX_KM = 0.17;
/** Below this a ring is a stray click, with no extent to scale an arrow against. */
const FLOW_MIN_EXTENT_KM = 1e-6;
/**
 * Stroke width for the stretch of outline the arrow springs from, against the 2px every other
 * line is drawn at.
 *
 * This is the thickened-outline half of the catalogue's 1115, and it doubles as the answer to
 * "which edge is the arrow attached to" while the zone is being edited — mapbox-gl-draw tags
 * vertices with a `coord_path` whose last index depends on the vertex count, so the closing
 * edge's endpoints cannot be picked out by a style filter.
 */
const FLOW_EDGE_WIDTH = 4;
/** See `spanBeforeCrossing`. Load-bearing here: the tail is *on* the ring by construction. */
const FLOW_SELF_CROSSING_RATIO = 0.1;
/**
 * Two positions this close are the same vertex. Rings close by repeating their first position,
 * and finishing a polygon on top of an existing vertex leaves duplicates. 1e-9° is well under
 * a millimetre.
 */
const VERTEX_EPSILON_DEG = 1e-9;

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
 * Twice the signed area of a ring, by the shoelace formula. Positive means the ring is wound
 * counter-clockwise, negative clockwise.
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
 * closing edge, leaving it at a right angle, tipped with a chevron — plus that edge redrawn
 * heavier.
 *
 * The closing edge — last vertex back to the first — is the one the user never clicks: it
 * appears when the ring closes. That makes it the easiest to predict while drawing and the
 * easiest to aim afterwards, since moving either of its two endpoints swings the arrow.
 * Nothing extra has to be persisted as a result.
 *
 * Unlike the slide arrow the tail sits *on* the boundary: a polygon stroke is 2px, so there is
 * no pattern band to clear, and springing from the outline is what makes the arrow read as
 * belonging to it.
 */
export const buildFlowArrow = (
  parentId: Feature["id"],
  kind: string,
  ring: Position[],
  config: ArrowConfig,
  /** The feature's own stroke colour, so a recoloured zone keeps its arrow in step. */
  featureColor: string | undefined,
): SyntheticFeature[] => {
  const open = openRing(ring);
  // Fewer than three distinct vertices enclose nothing, so there is no inside to point out of.
  if (open.length < 3) {
    return [];
  }

  // The closing edge. `openRing` guarantees its two ends differ, so it always has a direction.
  const from = open[open.length - 1];
  const to = open[0];
  const alongClosingEdge = bearing(point(from), point(to));

  // At a right angle to that edge, on whichever side lies outside the ring. The side comes
  // from the winding rather than from a containment probe: only the sign of the signed area is
  // needed, which is exact, where a probe offset from the boundary can land either side.
  const flowBearing = alongClosingEdge + (ringWinding(open) > 0 ? 90 : -90);

  // Springs from the middle of the edge rather than from a vertex. A corner is shared by two
  // edges, so an arrow planted there reads as belonging to neither, and the perpendicular at a
  // corner does not cleanly separate inside from out.
  const segment = distance(point(from), point(to), KM);
  const base = destination(point(from), segment / 2, alongClosingEdge, KM);

  // Measured against the *closed* ring: the closing edge is real boundary, and on a convex
  // zone it is the one the arrow is likeliest to meet.
  const boundary = lineString([...open, open[0]]);
  const [minX, minY, maxX, maxY] = bbox(boundary);
  const extent = distance(point([minX, minY]), point([maxX, maxY]), KM);
  // Negated so a NaN extent is rejected too.
  if (!(extent > FLOW_MIN_EXTENT_KM)) {
    return [];
  }

  const nominal = clampArrowLength(extent, config, FLOW_ARROW_MIN_KM, FLOW_ARROW_MAX_KM);
  // The outward normal is not guaranteed to stay outside — on a concave ring it can re-enter.
  // The bearing is honoured either way, since it follows from the boundary the user drew, but
  // stopping at the first crossing keeps a wrong-way arrow a local mark rather than a spear.
  const span = spanBeforeCrossing(base, flowBearing, nominal, boundary, FLOW_SELF_CROSSING_RATIO);
  const tip = destination(base, span, flowBearing, KM);
  const color = featureColor ?? config.color;

  // The closing edge itself, redrawn heavier. Emitted before the shaft so the shaft paints over
  // the join rather than being cut by it.
  const edge = lineString([from, to]);
  edge.id = `${parentId}:${kind}-edge`;
  edge.properties = { parent: parentId, color, width: FLOW_EDGE_WIDTH };

  return [
    edge,
    ...arrowFeatures(
      parentId,
      kind,
      base.geometry.coordinates,
      tip.geometry.coordinates,
      flowBearing,
      config.icon,
      color,
    ),
  ];
};
