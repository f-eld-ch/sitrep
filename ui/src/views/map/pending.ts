import type { FeatureCollection } from "geojson";
import { layerToFeatureCollection } from "api";
import type { Layer } from "types/layer";
import type { PendingFeature } from "./LayerContext";

/**
 * The features of a layer as drawn on the map: the saved ones, followed by the ones the user has
 * drawn but not saved yet.
 */
export function withPendingFeatures(
  layer: Layer | undefined,
  pending: PendingFeature[],
): FeatureCollection {
  const collection = layerToFeatureCollection(layer);
  if (!layer) return collection;

  return {
    ...collection,
    features: [
      ...collection.features,
      ...pending
        .filter((p) => p.layerId === layer.id)
        .map((p) => ({
          type: "Feature" as const,
          id: p.id,
          geometry: p.geometry,
          properties: p.properties,
        })),
    ],
  };
}

export const isPendingFeature = (pending: PendingFeature[], id: string | undefined): boolean =>
  id !== undefined && pending.some((p) => p.id === id);
