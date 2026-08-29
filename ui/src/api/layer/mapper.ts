import type {
  Feature as GeoJsonFeature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from "geojson";
import type { Feature, Layer } from "types/layer";
import { toDate, toOptionalDate } from "../common/mapper";
import type { WireFeature, WireLayer } from "./wire";

function toFeature(w: WireFeature): Feature {
  return {
    id: w.id,
    // geometry and properties are opaque jsonb blobs — typed as unknown on the wire,
    // cast here so the rest of the app can treat them as structured GeoJSON.
    geometry: w.geometry as Feature["geometry"],
    properties: w.properties as Feature["properties"],
    createdAt: toDate(w.createdAt),
    updatedAt: toOptionalDate(w.updatedAt) as Date,
    deletedAt: toOptionalDate(w.deletedAt) as Date,
  };
}

export function toLayer(w: WireLayer): Layer {
  return {
    id: w.id,
    name: w.name,
    // Fold soft-delete filter here: the app never sees deleted features.
    features: w.features.filter((f) => f.deletedAt === null).map(toFeature),
    // These fields are not fetched by GET_LAYERS; they are never accessed in the map view.
    incident: {} as Layer["incident"],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null as unknown as Date,
  };
}

export function convertFeatureToGeoJsonFeature(
  f: Feature,
  layerId: string,
): GeoJsonFeature<Geometry, GeoJsonProperties> {
  return {
    type: "Feature",
    id: f.id,
    geometry: f.geometry,
    properties: Object.assign({}, f.properties, {
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      deletedAt: f.deletedAt,
      layerId,
    }),
  };
}

export function layerToFeatureCollection(layer: Layer | undefined): FeatureCollection {
  const fc: FeatureCollection = { features: [], type: "FeatureCollection" };
  const features = layer?.features ?? [];
  for (const f of features) {
    if (f === undefined) continue;
    fc.features.push(convertFeatureToGeoJsonFeature(f, f.id));
  }
  return fc;
}
