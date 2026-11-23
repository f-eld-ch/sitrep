import type { FeatureCollection } from "geojson";
import { layerToFeatureCollection } from "api";
import type { Layer } from "types/layer";
import type { DraftFeature, PendingFeature } from "./LayerContext";

/**
 * The features of a layer as drawn on the map: the saved ones, followed by the ones the user has
 * drawn but not saved yet. A saved feature with changes that have not been sent yet is shown
 * with those changes.
 */
export function withPendingFeatures(
  layer: Layer | undefined,
  pending: PendingFeature[],
  drafts: DraftFeature[] = [],
): FeatureCollection {
  const collection = layerToFeatureCollection(layer);
  if (!layer) return collection;

  return {
    ...collection,
    features: [
      ...collection.features.map((f) => {
        const draft = drafts.find((d) => d.id === String(f.id));
        return draft
          ? {
              ...f,
              geometry: draft.geometry ?? f.geometry,
              properties: draft.properties ?? f.properties,
            }
          : f;
      }),
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
