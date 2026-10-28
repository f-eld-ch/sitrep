import bbox from "@turf/bbox";
import type { FeatureCollection } from "geojson";

/** Not closer than this when framing a layer: a lone icon keeps its surroundings. */
export const FIT_MAX_ZOOM = 16;

/** The south-west and north-east corners around the features, or undefined when there are none. */
export function featureBounds(
  collection: FeatureCollection,
): [[number, number], [number, number]] | undefined {
  if (collection.features.length === 0) return undefined;

  const [west, south, east, north] = bbox(collection);
  return [
    [west, south],
    [east, north],
  ];
}

/**
 * What a map frames on arrival: the active layer, or, while that has nothing on it yet, the
 * Nachrichtenkarte, so the map opens where the incident's drawings are.
 */
export function framingCollection(
  active: FeatureCollection,
  messageMap: FeatureCollection,
): FeatureCollection {
  return active.features.length > 0 ? active : messageMap;
}
