import { FeatureCollection, Feature, Geometry, GeoJsonProperties } from "geojson";
import { omit } from "lodash";
import { Layer, Feature as GraphQlFeature } from "types/layer";

interface LayerMap {
  active: FeatureCollection;
  inactive: FeatureCollection[];
}

const LayersToLayerMap = (layers: Layer[], activeLayerId: string): LayerMap => {
  // let featureCollections: FeatureCollection[] = []

  const layerMap: LayerMap = { active: { features: [], type: "FeatureCollection" }, inactive: [] };

  layers.forEach((layer) => {
    const fc: FeatureCollection = LayerToFeatureCollection(layer);
    if (layer.id === activeLayerId) {
      layerMap.active = fc;
    } else {
      layerMap.inactive.push(fc);
    }
  });

  return layerMap;
};

const LayerToFeatureCollection = (layer: Layer | undefined): FeatureCollection => {
  const fc: FeatureCollection = { features: [], type: "FeatureCollection" };

  layer?.features.forEach((f) => fc.features.push(ConvertFeatureToGeoJsonFeature(f, layer.id)));

  return fc;
};

function ConvertFeatureToGeoJsonFeature(f: GraphQlFeature, layerId: string) {
  const feature: Feature<Geometry, GeoJsonProperties> = {
    type: "Feature",
    id: f.id,
    geometry: f.geometry,
    properties: Object.assign({}, f.properties, {
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      deletedAt: f.deletedAt,
      layerId: layerId,
    }),
  };
  return feature;
}

function FilterActiveFeatures(fc: FeatureCollection) {
  const filteredFC: FeatureCollection = { type: "FeatureCollection", features: [] };
  filteredFC.features = Object.assign(
    [],
    fc.features.filter((f) => f.properties?.deletedAt === null),
  );

  return filteredFC;
}

function CleanFeature(f: Feature) {
  const feature: Feature<Geometry, GeoJsonProperties> = {
    type: "Feature",
    id: f.id,
    geometry: f.geometry,
    properties: omit(f.properties, ["createdAt", "updatedAt", "deletedAt", "layerId"]),
  };

  return feature;
}

export {
  LayersToLayerMap,
  LayerToFeatureCollection,
  ConvertFeatureToGeoJsonFeature,
  FilterActiveFeatures,
  CleanFeature,
};
