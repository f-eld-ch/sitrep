import bbox from "@turf/bbox";
import bearing from "@turf/bearing";
import destination from "@turf/destination";
import distance from "@turf/distance";
import { lineString, point } from "@turf/helpers";
import type { Feature, Position } from "geojson";
import { arrowFeatures, clampArrowLength, KM, spanBeforeCrossing } from "./arrow";
import { SMOOTH_SAMPLES, smoothRing } from "./smooth";
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
const FLOW_EDGE_WIDTH = 6;
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
 * How much of the outline is emphasised, as a share of its whole length: the stretch the
 * flow arrow belongs to, with the arrow at its middle.
 */
export const FLOW_EDGE_SHARE = 0.2;

/**
 * A point `km` along a closed path, wrapping round past either end. `cumulative[i]` is the
 * distance from the first position to position `i`; the path repeats its first position last.
 */
const pointAlong = (
  path: Position[],
  cumulative: number[],
  total: number,
  km: number,
): Position => {
  const d = ((km % total) + total) % total;
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < d) {
    i += 1;
  }
  const a = path[i - 1];
  const b = path[i];
  const span = cumulative[i] - cumulative[i - 1];
  const w = span > 0 ? (d - cumulative[i - 1]) / span : 0;

  return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
};

/**
 * The part of a closed path from `from` to `to` km (which may run past the end and wrap round),
 * following every bend of it.
 */
const stretchOf = (
  path: Position[],
  cumulative: number[],
  total: number,
  from: number,
  to: number,
) => {
  const points: Position[] = [pointAlong(path, cumulative, total, from)];
  for (let lap = Math.floor(from / total); lap <= Math.floor(to / total); lap += 1) {
    for (let i = 1; i < path.length - 1; i += 1) {
      const at = cumulative[i] + lap * total;
      if (at > from && at < to) {
        points.push(path[i]);
      }
    }
  }
  points.push(pointAlong(path, cumulative, total, to));

  return points;
};

/** The outline as drawn, closed, with the distance along it to every position. */
const outlineOf = (open: Position[], smooth: boolean) => {
  // For a curve the closing edge is the last run of points.
  const path: Position[] = smooth ? smoothRing(open) : [...open, open[0]];
  const cumulative: number[] = [0];
  for (let i = 1; i < path.length; i += 1) {
    cumulative.push(cumulative[i - 1] + distance(point(path[i - 1]), point(path[i]), KM));
  }
  const total = cumulative[cumulative.length - 1];
  // Where the closing edge (last vertex back to the first) starts.
  const closingStart = cumulative[smooth ? (open.length - 1) * SMOOTH_SAMPLES : open.length - 1];

  return { path, cumulative, total, closingStart };
};

/**
 * Where the arrow sits when nothing has been chosen: the middle of the closing edge, as a
 * fraction of the outline's length counted from the ring's first vertex. The form starts its
 * slider here, so a zone that was never touched does not move. `undefined` for a ring that
 * encloses nothing.
 */
export const defaultFlowAt = (ring: Position[], smooth = false): number | undefined => {
  const open = openRing(ring);
  if (open.length < 3) {
    return undefined;
  }
  const { total, closingStart } = outlineOf(open, smooth);

  return total > 0 ? (closingStart + (total - closingStart) / 2) / total : undefined;
};

/**
 * The flow-direction arrow: a stretch of the outline redrawn heavier — a fifth of its length —
 * with a straight shaft springing from the middle of it, leaving the outline at a right angle,
 * tipped with a chevron.
 *
 * It sits at `at`, a fraction of the outline's length counted from the ring's first vertex and
 * going once round (the middle of the closing edge, last vertex back to the first, when none is
 * given). The stretch is centred on it and follows the outline, curved or not, past the corners
 * on either side.
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
  /** The outline is drawn as a curve: the stretch and the arrow follow it, not the chords. */
  smooth = false,
  /** Where on the outline the arrow sits, as a fraction of its length; see above. */
  at?: number,
): SyntheticFeature[] => {
  const open = openRing(ring);
  // Fewer than three distinct vertices enclose nothing, so there is no inside to point out of.
  if (open.length < 3) {
    return [];
  }

  const { path, cumulative, total, closingStart } = outlineOf(open, smooth);

  const [minX, minY, maxX, maxY] = bbox(lineString(path));
  const extent = distance(point([minX, minY]), point([maxX, maxY]), KM);
  // Negated so a NaN extent is rejected too.
  if (!(extent > FLOW_MIN_EXTENT_KM) || !(total > 0)) {
    return [];
  }

  // By default it springs from the middle of the closing edge rather than from a vertex. A corner
  // is shared by two edges, so an arrow planted there reads as belonging to neither, and the
  // perpendicular at a corner does not cleanly separate inside from out.
  const anchor =
    typeof at === "number" && Number.isFinite(at)
      ? (((at % 1) + 1) % 1) * total
      : closingStart + (total - closingStart) / 2;
  const base = point(pointAlong(path, cumulative, total, anchor));

  // Direction of the outline where the arrow springs from: for a straight edge the edge itself,
  // for a curve its tangent there.
  const reach = total * 0.01;
  const alongOutline = bearing(
    point(pointAlong(path, cumulative, total, anchor - reach)),
    point(pointAlong(path, cumulative, total, anchor + reach)),
  );

  // At a right angle to that, on whichever side lies outside the ring. The side comes from the
  // winding rather than from a containment probe: only the sign of the signed area is needed,
  // which is exact, where a probe offset from the boundary can land either side.
  const flowBearing = alongOutline + (ringWinding(open) > 0 ? 90 : -90);

  const nominal = clampArrowLength(extent, config, FLOW_ARROW_MIN_KM, FLOW_ARROW_MAX_KM);
  // The outward normal is not guaranteed to stay outside — on a concave ring it can re-enter.
  // The bearing is honoured either way, since it follows from the boundary the user drew, but
  // stopping at the first crossing keeps a wrong-way arrow a local mark rather than a spear.
  const span = spanBeforeCrossing(
    base,
    flowBearing,
    nominal,
    lineString(path),
    FLOW_SELF_CROSSING_RATIO,
  );
  const tip = destination(base, span, flowBearing, KM);
  const color = featureColor ?? config.color;

  // The emphasised stretch of outline, centred on the arrow. Emitted before the shaft so the
  // shaft paints over the join rather than being cut by it.
  const half = (total * FLOW_EDGE_SHARE) / 2;
  const edge = lineString(stretchOf(path, cumulative, total, anchor - half, anchor + half));
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
