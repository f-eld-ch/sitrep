import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AddFeatureMutation,
  AddFeatureMutationVariables,
  AddLayerMutation,
  AddLayerMutationVariables,
  DeleteFeatureMutation,
  DeleteFeatureMutationVariables,
  GetLayersQuery,
  GetLayersQueryVariables,
  UpdateFeatureMutation,
  UpdateFeatureMutationVariables,
} from "gql";

export const GET_LAYERS: TypedDocumentNode<GetLayersQuery, GetLayersQueryVariables> = gql`
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

export const ADD_FEATURE: TypedDocumentNode<AddFeatureMutation, AddFeatureMutationVariables> = gql`
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

export const MODIFY_FEATURE: TypedDocumentNode<
  UpdateFeatureMutation,
  UpdateFeatureMutationVariables
> = gql`
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

export const DELETE_FEATURE: TypedDocumentNode<
  DeleteFeatureMutation,
  DeleteFeatureMutationVariables
> = gql`
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

export const ADD_LAYER: TypedDocumentNode<AddLayerMutation, AddLayerMutationVariables> = gql`
  mutation AddLayer($incidentId: uuid!, $name: String!) {
    insertLayersOne(object: { incidentId: $incidentId, name: $name }) {
      id
    }
  }
`;
