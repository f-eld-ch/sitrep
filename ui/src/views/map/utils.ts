import type { FeatureCollection } from "geojson";
import { layerToFeatureCollection } from "api";
import type { Layer } from "types/layer";

interface LayerMap {
  active: FeatureCollection;
  inactive: FeatureCollection[];
}

export const LayersToLayerMap = (layers: Layer[], activeLayerId: string): LayerMap => {
  const layerMap: LayerMap = {
    active: { features: [], type: "FeatureCollection" },
    inactive: [],
  };

  for (const layer of layers) {
    const fc: FeatureCollection = layerToFeatureCollection(layer);
    if (layer.id === activeLayerId) {
      layerMap.active = fc;
    } else {
      layerMap.inactive.push(fc);
    }
  }

  return layerMap;
};
