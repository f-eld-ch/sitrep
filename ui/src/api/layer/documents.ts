import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AddFeatureMutation,
  AddFeatureMutationVariables,
  CreateLayerMutation,
  CreateLayerMutationVariables,
  DeleteFeatureMutation,
  DeleteFeatureMutationVariables,
  GetFeatureChangesQuery,
  GetFeatureChangesQueryVariables,
  GetFeatureMessagesQuery,
  GetFeatureMessagesQueryVariables,
  GetLayersForIncidentQuery,
  GetLayersForIncidentQueryVariables,
  ModifyFeatureMutation,
  ModifyFeatureMutationVariables,
  RestoreFeatureMutation,
  RestoreFeatureMutationVariables,
} from "gql/next";

// ── Queries ───────────────────────────────────────────────────────────────────

export const GET_LAYERS: TypedDocumentNode<
  GetLayersForIncidentQuery,
  GetLayersForIncidentQueryVariables
> = gql`
  query GetLayersForIncident($incidentId: ID!, $asOf: DateTime) {
    layersForIncident(incidentId: $incidentId, asOf: $asOf) {
      id
      sourceIncidentId
      sourceIncidentName
      name
      kind
      revision
      features {
        id
        geometry
        properties
      }
    }
  }
`;

/** The messages a feature was drawn for, ordered by message time. */
export const GET_FEATURE_MESSAGES: TypedDocumentNode<
  GetFeatureMessagesQuery,
  GetFeatureMessagesQueryVariables
> = gql`
  query GetFeatureMessages($featureId: ID!) {
    featureMessages(featureId: $featureId) {
      id
      number
      sender
      receiver
      content
      time
    }
  }
`;

/** Every change to the incident's features, to find what each message added, modified or removed. */
export const GET_FEATURE_CHANGES: TypedDocumentNode<
  GetFeatureChangesQuery,
  GetFeatureChangesQueryVariables
> = gql`
  query GetFeatureChanges($incidentId: ID!) {
    featureChanges(incidentId: $incidentId) {
      featureId
      change
      effectiveAt
      recordedAt
      messageId
      geometry
      properties
    }
  }
`;

// ── Mutations ─────────────────────────────────────────────────────────────────

export const ADD_FEATURE: TypedDocumentNode<AddFeatureMutation, AddFeatureMutationVariables> = gql`
  mutation AddFeature(
    $incidentId: ID!
    $layerId: ID!
    $clientKey: String!
    $geometry: Geometry
    $properties: JSONObject
    $change: FeatureChangeInput
  ) {
    addFeature(
      incidentId: $incidentId
      layerId: $layerId
      clientKey: $clientKey
      geometry: $geometry
      properties: $properties
      change: $change
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
  mutation ModifyFeature(
    $id: ID!
    $geometry: Geometry
    $properties: JSONObject
    $change: FeatureChangeInput
  ) {
    modifyFeature(id: $id, geometry: $geometry, properties: $properties, change: $change) {
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
  mutation DeleteFeature($id: ID!, $change: FeatureChangeInput) {
    deleteFeature(id: $id, change: $change)
  }
`;

export const RESTORE_FEATURE: TypedDocumentNode<
  RestoreFeatureMutation,
  RestoreFeatureMutationVariables
> = gql`
  mutation RestoreFeature($id: ID!, $change: FeatureChangeInput) {
    restoreFeature(id: $id, change: $change) {
      id
      geometry
      properties
    }
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
        kind
      }
    }
  `;
