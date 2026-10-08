import bbox from "@turf/bbox";
import type { Layer } from "types/layer";

/** Map layers a click can hit: every style layer of every visible layer that is drawn as a plain source. */
export function popupLayerIds(layers: Layer[], styleLayerIds: string[]): string[] {
  return layers.flatMap((layer) => styleLayerIds.map((id) => `${id}-${layer.id}`));
}

/** Where a feature's popup opens: below the middle of its bounding box, so it does not cover it. */
export function popupAnchorFor(
  layers: Layer[],
  featureId: string,
): { longitude: number; latitude: number } | undefined {
  for (const layer of layers) {
    const feature = layer.features.find((f) => f.id === featureId);
    if (!feature?.geometry) continue;

    const [west, south, east] = bbox(feature.geometry);

    return { longitude: (west + east) / 2, latitude: south };
  }

  return undefined;
}
