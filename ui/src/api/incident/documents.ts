import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CloseIncidentMutation,
  CloseIncidentMutationVariables,
  CreateIncidentMutation,
  CreateIncidentMutationVariables,
  CreateIncidentWithParentMutation,
  CreateIncidentWithParentMutationVariables,
  DeleteIncidentMutation,
  DeleteIncidentMutationVariables,
  FetchIncidentsQuery,
  FetchIncidentsQueryVariables,
  GetIncidentDetailQuery,
  GetIncidentDetailQueryVariables,
  LinkIncidentParentMutation,
  LinkIncidentParentMutationVariables,
  ReopenIncidentMutation,
  ReopenIncidentMutationVariables,
  UnlinkIncidentParentMutation,
  UnlinkIncidentParentMutationVariables,
  UpdateIncidentMutation,
  UpdateIncidentMutationVariables,
} from "gql/next";

// ── Queries ───────────────────────────────────────────────────────────────────

export const GET_INCIDENTS: TypedDocumentNode<FetchIncidentsQuery, FetchIncidentsQueryVariables> =
  gql`
    query FetchIncidents {
      incidents {
        id
        parentId
        name
        createdAt
        updatedAt
        closedAt
        isClosed
        location {
          name
          coordinates
        }
      }
    }
  `;

export const GET_INCIDENT_DETAILS: TypedDocumentNode<
  GetIncidentDetailQuery,
  GetIncidentDetailQueryVariables
> = gql`
  query GetIncidentDetail($incidentId: ID!) {
    incident(id: $incidentId) {
      id
      parentId
      name
      createdAt
      updatedAt
      closedAt
      isClosed
      location {
        name
        coordinates
      }
      divisions {
        id
        name
        description
      }
    }
  }
`;

// ── Mutations ─────────────────────────────────────────────────────────────────

export const CREATE_INCIDENT: TypedDocumentNode<
  CreateIncidentMutation,
  CreateIncidentMutationVariables
> = gql`
  mutation CreateIncident(
    $name: String!
    $location: String
    $divisions: [DivisionInput!]!
    $layers: [LayerInput!]!
  ) {
    createIncident(
      input: { name: $name, location: $location, divisions: $divisions, layers: $layers }
    ) {
      id
      name
      divisions {
        id
        name
        description
      }
    }
  }
`;

export const CREATE_INCIDENT_WITH_PARENT: TypedDocumentNode<
  CreateIncidentWithParentMutation,
  CreateIncidentWithParentMutationVariables
> = gql`
  mutation CreateIncidentWithParent(
    $name: String!
    $parentId: ID!
    $location: String
    $divisions: [DivisionInput!]!
    $layers: [LayerInput!]!
  ) {
    createIncident(
      input: {
        name: $name
        parentId: $parentId
        location: $location
        divisions: $divisions
        layers: $layers
      }
    ) {
      id
      parentId
      name
      divisions {
        id
        name
        description
      }
    }
  }
`;

export const UPDATE_INCIDENT: TypedDocumentNode<
  UpdateIncidentMutation,
  UpdateIncidentMutationVariables
> = gql`
  mutation UpdateIncident(
    $id: ID!
    $name: String
    $location: String
    $divisions: [DivisionInput!]
  ) {
    updateIncident(id: $id, input: { name: $name, location: $location, divisions: $divisions }) {
      id
      name
      location {
        name
        coordinates
      }
      divisions {
        id
        name
        description
      }
    }
  }
`;

export const CLOSE_INCIDENT: TypedDocumentNode<
  CloseIncidentMutation,
  CloseIncidentMutationVariables
> = gql`
  mutation CloseIncident($id: ID!) {
    closeIncident(id: $id) {
      id
      closedAt
      isClosed
    }
  }
`;

export const REOPEN_INCIDENT: TypedDocumentNode<
  ReopenIncidentMutation,
  ReopenIncidentMutationVariables
> = gql`
  mutation ReopenIncident($id: ID!) {
    reopenIncident(id: $id) {
      id
      closedAt
      isClosed
    }
  }
`;

export const DELETE_INCIDENT: TypedDocumentNode<
  DeleteIncidentMutation,
  DeleteIncidentMutationVariables
> = gql`
  mutation DeleteIncident($id: ID!) {
    deleteIncident(id: $id)
  }
`;

export const LINK_INCIDENT_PARENT: TypedDocumentNode<
  LinkIncidentParentMutation,
  LinkIncidentParentMutationVariables
> = gql`
  mutation LinkIncidentParent($childId: ID!, $parentId: ID!) {
    linkIncidentParent(childId: $childId, parentId: $parentId) {
      id
      parentId
      updatedAt
    }
  }
`;

export const UNLINK_INCIDENT_PARENT: TypedDocumentNode<
  UnlinkIncidentParentMutation,
  UnlinkIncidentParentMutationVariables
> = gql`
  mutation UnlinkIncidentParent($childId: ID!) {
    unlinkIncidentParent(childId: $childId) {
      id
      parentId
      updatedAt
    }
  }
`;
