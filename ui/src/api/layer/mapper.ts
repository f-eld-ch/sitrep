import type {
  Feature as GeoJsonFeature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from "geojson";
import type { Feature, Layer } from "types/layer";
import type { GetLayersForIncidentQuery } from "gql/next";

type WireFeature = GetLayersForIncidentQuery["layersForIncident"][0]["features"][0];
type WireLayer = GetLayersForIncidentQuery["layersForIncident"][0];

function toFeature(w: WireFeature): Feature {
  return {
    id: w.id,
    // geometry and properties are opaque scalars — cast here so the rest of the
    // app can treat them as structured GeoJSON.
    geometry: w.geometry as unknown as Feature["geometry"],
    properties: w.properties as unknown as Feature["properties"],
    // createdAt/updatedAt/deletedAt are not exposed by the new schema; use
    // safe defaults so the domain type remains satisfied.
    createdAt: new Date(0),
    updatedAt: null,
    deletedAt: null,
  };
}

export function toLayer(w: WireLayer): Layer {
  return {
    id: w.id,
    sourceIncidentId: w.sourceIncidentId,
    sourceIncidentName: w.sourceIncidentName,
    name: w.name,
    // Server already hides deleted features — no client-side filter needed.
    features: w.features.map(toFeature),
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
