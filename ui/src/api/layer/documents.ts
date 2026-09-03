import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AddFeatureMutation,
  AddFeatureMutationVariables,
  CreateLayerMutation,
  CreateLayerMutationVariables,
  DeleteFeatureMutation,
  DeleteFeatureMutationVariables,
  GetLayersForIncidentQuery,
  GetLayersForIncidentQueryVariables,
  ModifyFeatureMutation,
  ModifyFeatureMutationVariables,
} from "gql/next";

// ── Queries ───────────────────────────────────────────────────────────────────

export const GET_LAYERS: TypedDocumentNode<
  GetLayersForIncidentQuery,
  GetLayersForIncidentQueryVariables
> = gql`
  query GetLayersForIncident($incidentId: ID!) {
    layersForIncident(incidentId: $incidentId) {
      id
      sourceIncidentId
      sourceIncidentName
      name
      revision
      features {
        id
        geometry
        properties
      }
    }
  }
`;

// ── Mutations ─────────────────────────────────────────────────────────────────

export const ADD_FEATURE: TypedDocumentNode<AddFeatureMutation, AddFeatureMutationVariables> = gql`
  mutation AddFeature(
    $incidentId: ID!
    $layerId: ID!
    $id: ID!
    $geometry: Geometry
    $properties: JSONObject
  ) {
    addFeature(
      incidentId: $incidentId
      layerId: $layerId
      id: $id
      geometry: $geometry
      properties: $properties
    ) {
      id
      geometry
      properties
    }
  }
`;

export const MODIFY_FEATURE: TypedDocumentNode<
  ModifyFeatureMutation,
  ModifyFeatureMutationVariables
> = gql`
  mutation ModifyFeature($id: ID!, $geometry: Geometry, $properties: JSONObject) {
    modifyFeature(id: $id, geometry: $geometry, properties: $properties) {
      id
      geometry
      properties
    }
  }
`;

export const DELETE_FEATURE: TypedDocumentNode<
  DeleteFeatureMutation,
  DeleteFeatureMutationVariables
> = gql`
  mutation DeleteFeature($id: ID!) {
    deleteFeature(id: $id)
  }
`;

export const CREATE_LAYER: TypedDocumentNode<CreateLayerMutation, CreateLayerMutationVariables> =
  gql`
    mutation CreateLayer($incidentId: ID!, $name: String!) {
      createLayer(incidentId: $incidentId, name: $name) {
        id
        sourceIncidentId
        sourceIncidentName
        name
      }
    }
  `;
