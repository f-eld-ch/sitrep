import type { Geometry } from "geojson";

/** How far from the click, in pixels, a feature still counts as clicked. */
export const PICK_RADIUS_PX = 24;

interface Hit {
  geometry: Geometry;
  properties?: Record<string, unknown> | null;
}

/** The part of the map a pick needs. */
export interface PickableMap {
  queryRenderedFeatures: (
    box: [[number, number], [number, number]],
    options: { layers: string[] },
  ) => Hit[];
  project: (lngLat: [number, number]) => { x: number; y: number };
}

/**
 * The feature a click is meant for. A click does not have to land on the feature: anything within
 * `radius` pixels counts, and the closest point symbol wins, since a small icon is hard to hit
 * exactly. Lines and areas come after points, in the order the map reports them: a click that is
 * on one of them is on it, and one that is near an icon is meant for the icon.
 */
export function pickFeature<T extends Hit>(
  map: {
    queryRenderedFeatures: (
      box: [[number, number], [number, number]],
      options: { layers: string[] },
    ) => T[];
    project: PickableMap["project"];
  },
  point: { x: number; y: number },
  layers: string[],
  radius = PICK_RADIUS_PX,
): T | undefined {
  if (layers.length === 0) return undefined;

  const hits = map.queryRenderedFeatures(
    [
      [point.x - radius, point.y - radius],
      [point.x + radius, point.y + radius],
    ],
    { layers },
  );

  const distanceToPoint = (hit: T) => {
    if (hit.geometry.type !== "Point") return undefined;

    const [lng, lat] = hit.geometry.coordinates;
    const at = map.project([lng, lat]);

    return Math.hypot(at.x - point.x, at.y - point.y);
  };

  let nearest: { hit: T; distance: number } | undefined;
  for (const hit of hits) {
    const distance = distanceToPoint(hit);
    if (distance !== undefined && distance <= radius && (!nearest || distance < nearest.distance)) {
      nearest = { hit, distance };
    }
  }

  return nearest?.hit ?? hits.find((hit) => hit.geometry.type !== "Point");
}
