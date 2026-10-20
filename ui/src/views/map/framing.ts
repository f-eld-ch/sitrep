import type { FeatureCollection } from "geojson";

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
