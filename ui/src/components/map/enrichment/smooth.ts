import type { Position } from "geojson";

/** Points sampled between two neighbouring vertices. Enough to look round at any zoom. */
export const SMOOTH_SAMPLES = 12;

const dist = (a: Position, b: Position): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * One piece of a centripetal Catmull–Rom spline from `p1` to `p2`, with `p0` and `p3` as the
 * neighbours that shape the bend. Centripetal (alpha 0.5) rather than uniform: vertices drawn
 * by hand are unevenly spaced, and the uniform form then overshoots and loops where the
 * centripetal form stays close to the polygon.
 */
const segment = (
  p0: Position,
  p1: Position,
  p2: Position,
  p3: Position,
  samples: number,
): Position[] => {
  // Parameter values at the four points; the floor keeps coincident points from dividing by 0.
  const t0 = 0;
  const t1 = t0 + Math.max(dist(p0, p1) ** 0.5, 1e-12);
  const t2 = t1 + Math.max(dist(p1, p2) ** 0.5, 1e-12);
  const t3 = t2 + Math.max(dist(p2, p3) ** 0.5, 1e-12);

  const lerp = (a: Position, b: Position, ta: number, tb: number, t: number): Position => {
    const w = (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };

  const out: Position[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = t1 + ((t2 - t1) * i) / samples;
    const a1 = lerp(p0, p1, t0, t1, t);
    const a2 = lerp(p1, p2, t1, t2, t);
    const a3 = lerp(p2, p3, t2, t3, t);
    const b1 = lerp(a1, a2, t0, t2, t);
    const b2 = lerp(a2, a3, t1, t3, t);
    out.push(lerp(b1, b2, t1, t2, t));
  }

  return out;
};

/**
 * A closed ring of at least three distinct vertices as soft curves through every vertex, one
 * run of points per edge: `result[i]` runs from vertex `i` up to, but not including, vertex
 * `i + 1`, so the runs concatenate into the outline without repeating a point.
 *
 * It passes through the vertices the user placed, so the handles they drag stay on the line.
 * Rings with fewer than three vertices cannot bend and come back straight.
 */
export const smoothRingSegments = (
  open: Position[],
  samples: number = SMOOTH_SAMPLES,
): Position[][] => {
  const n = open.length;
  if (n < 3) {
    return open.map((p) => [p]);
  }

  return open.map((_, i) =>
    segment(open[(i - 1 + n) % n], open[i], open[(i + 1) % n], open[(i + 2) % n], samples),
  );
};

/** The whole smoothed outline, closed (first position repeated last). */
export const smoothRing = (open: Position[], samples: number = SMOOTH_SAMPLES): Position[] => {
  const points = smoothRingSegments(open, samples).flat();
  return points.length > 0 ? [...points, points[0]] : points;
};
