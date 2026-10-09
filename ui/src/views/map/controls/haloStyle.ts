import type { ExpressionSpecification } from "maplibre-gl";

// The halo follows the zoom ramps of what it surrounds: half the icon (a 48px cell scaled from
// 0.2 at zoom 12 to 1.667 at zoom 20) and a little margin, and the line width ramp plus margin.
export const POINT_RADIUS: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  9,
  20,
  44,
];
export const LINE_WIDTH: ExpressionSpecification = [
  "interpolate",
  ["exponential", 1],
  ["zoom"],
  12,
  6,
  19,
  28,
];
