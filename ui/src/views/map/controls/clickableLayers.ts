import type { Layer } from "types/layer";

/**
 * The map layers a click on a feature can hit: every style layer of every given layer, which are
 * those drawn as plain sources. The active layer is drawn by mapbox-gl-draw instead.
 */
export function clickableLayerIds(layers: Layer[], styleLayerIds: string[]): string[] {
  return layers.flatMap((layer) => styleLayerIds.map((id) => `${id}-${layer.id}`));
}
