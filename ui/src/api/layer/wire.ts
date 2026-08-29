// Hasura wire types for the layer aggregate.
// geometry and properties come as jsonb — opaque JSON, cast in mapper.
// Internal to src/api/layer/.

export interface WireFeature {
  id: string;
  geometry: unknown;
  properties: unknown;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface WireLayer {
  id: string;
  name: string;
  features: WireFeature[];
}

export interface WireGetLayersResult {
  layers: WireLayer[];
}

export interface WireAddFeatureResult {
  insertFeaturesOne: {
    id: string;
    geometry: unknown;
    properties: unknown;
    createdAt: string;
    updatedAt: string | null;
    deletedAt: string | null;
  } | null;
}

export interface WireModifyFeatureResult {
  updateFeaturesByPk: {
    id: string;
    geometry: unknown;
    properties: unknown;
    createdAt: string;
    updatedAt: string | null;
    deletedAt: string | null;
  } | null;
}

export interface WireDeleteFeatureResult {
  updateFeaturesByPk: { id: string } | null;
}

export interface WireAddLayerResult {
  insertLayersOne: { id: string } | null;
}

export interface GetLayersVars {
  incidentId: string;
}

export interface AddFeatureVars {
  layerId: string;
  id: string;
  geometry: unknown;
  properties: unknown;
}

export interface ModifyFeatureVars {
  id: string;
  geometry: unknown;
  properties: unknown;
}

export interface DeleteFeatureVars {
  id: string;
  deletedAt: Date;
}

export interface AddLayerVars {
  incidentId: string;
  name: string;
}
