import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
	AddFeatureResponse,
	AddFeatureVars,
	AddLayerData,
	AddLayerVars,
	DeleteFeatureResponse,
	DeleteFeatureVars,
	GetLayersData,
	GetLayersVars,
	ModifyFeatureResponse,
	ModifyFeatureVars,
} from "types/layer";

const GET_LAYERS: TypedDocumentNode<GetLayersData, GetLayersVars> = gql`
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

const ADD_FEATURE: TypedDocumentNode<AddFeatureResponse, AddFeatureVars> = gql`
  mutation AddFeature($layerId: uuid!, $id: uuid!, $geometry: jsonb, $properties: jsonb) {
    insertFeaturesOne(object: { layerId: $layerId, id: $id, geometry: $geometry, properties: $properties }) {
      id
      geometry
      properties
      createdAt
      updatedAt
      deletedAt
    }
  }
`;

const MODIFY_FEATURE: TypedDocumentNode<
	ModifyFeatureResponse,
	ModifyFeatureVars
> = gql`
  mutation UpdateFeature($id: uuid!, $geometry: jsonb, $properties: jsonb) {
    updateFeaturesByPk(pkColumns: { id: $id }, _set: { geometry: $geometry, properties: $properties }) {
      id
      geometry
      properties
      createdAt
      updatedAt
      deletedAt
    }
  }
`;

const DELETE_FEATURE: TypedDocumentNode<
	DeleteFeatureResponse,
	DeleteFeatureVars
> = gql`
  mutation UpdateFeature($id: uuid!, $deletedAt: timestamptz) {
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

const ADD_LAYER: TypedDocumentNode<AddLayerData, AddLayerVars> = gql`
  mutation AddLayer($incidentId: uuid!, $name: String!) {
    insertLayersOne(object: {incidentId: $incidentId, name: $name }) {
      id
    }
  }
`;

export {
	ADD_LAYER as AddLayer,
	GET_LAYERS as GetLayers,
	ADD_FEATURE as AddFeatureToLayer,
	MODIFY_FEATURE as ModifyFeature,
	DELETE_FEATURE as DeleteFeature,
};
