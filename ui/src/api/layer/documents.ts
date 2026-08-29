import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AddFeatureVars,
  AddLayerVars,
  DeleteFeatureVars,
  GetLayersVars,
  ModifyFeatureVars,
  WireAddFeatureResult,
  WireAddLayerResult,
  WireDeleteFeatureResult,
  WireGetLayersResult,
  WireModifyFeatureResult,
} from "./wire";

export const GET_LAYERS: TypedDocumentNode<WireGetLayersResult, GetLayersVars> = gql`
  query GetLayers($incidentId: uuid!) {
    layers(where: { incidentId: { _eq: $incidentId } }) {
      id
      name
      features {
        id
        geometry
        properties
        createdAt
        updatedAt
        deletedAt
      }
    }
  }
`;

export const ADD_FEATURE: TypedDocumentNode<WireAddFeatureResult, AddFeatureVars> = gql`
  mutation AddFeature($layerId: uuid!, $id: uuid!, $geometry: jsonb, $properties: jsonb) {
    insertFeaturesOne(
      object: { layerId: $layerId, id: $id, geometry: $geometry, properties: $properties }
    ) {
      id
      geometry
      properties
      createdAt
      updatedAt
      deletedAt
    }
  }
`;

export const MODIFY_FEATURE: TypedDocumentNode<WireModifyFeatureResult, ModifyFeatureVars> = gql`
  mutation UpdateFeature($id: uuid!, $geometry: jsonb, $properties: jsonb) {
    updateFeaturesByPk(
      pkColumns: { id: $id }
      _set: { geometry: $geometry, properties: $properties }
    ) {
      id
      geometry
      properties
      createdAt
      updatedAt
      deletedAt
    }
  }
`;

export const DELETE_FEATURE: TypedDocumentNode<WireDeleteFeatureResult, DeleteFeatureVars> = gql`
  mutation DeleteFeature($id: uuid!, $deletedAt: timestamptz) {
    updateFeaturesByPk(pkColumns: { id: $id }, _set: { deletedAt: $deletedAt }) {
      id
      geometry
      properties
      createdAt
      updatedAt
      deletedAt
    }
  }
`;

export const ADD_LAYER: TypedDocumentNode<WireAddLayerResult, AddLayerVars> = gql`
  mutation AddLayer($incidentId: uuid!, $name: String!) {
    insertLayersOne(object: { incidentId: $incidentId, name: $name }) {
      id
    }
  }
`;
