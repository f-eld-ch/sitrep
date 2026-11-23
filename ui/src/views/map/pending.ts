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

/** Whether a drawn feature has been told what it is: its symbol, line type or area type. */
export function hasType(feature: {
  geometry: { type: string };
  properties?: Record<string, unknown> | null;
}): boolean {
  const { geometry, properties } = feature;
  if (geometry.type === "Point") return Boolean(properties?.icon);
  if (geometry.type === "LineString") return Boolean(properties?.lineType);
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return Boolean(properties?.zoneType);
  }

  return true;
}

/**
 * How leaving a new object that has its type saves it. The panel holds what has been typed and
 * the time chosen, so it is the one that knows how to save; the map asks it when the selection
 * moves away. Only one new object is open at a time.
 */
let saveOpen: (() => void) | undefined;

export const registerSaveOfOpenFeature = (save: (() => void) | undefined): void => {
  saveOpen = save;
};

/** Saves the open new object, if the panel registered a way to. */
export const saveOpenFeature = (): boolean => {
  if (!saveOpen) return false;
  saveOpen();

  return true;
};

/**
 * Features created in this session for a message. Deleting one of them leaves nothing to show as
 * a ghost, and the feature history may not list them yet to say so.
 */
const createdForMessage = new Set<string>();

export const markCreatedForMessage = (id: string): void => {
  createdForMessage.add(id);
};

/** True, once, for a feature that was created in this session for a message. */
export const consumeCreatedForMessage = (id: string): boolean => createdForMessage.delete(id);
