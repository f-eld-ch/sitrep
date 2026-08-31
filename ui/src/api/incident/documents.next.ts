import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CloseIncidentMutation,
  CloseIncidentMutationVariables,
  CreateIncidentMutation,
  CreateIncidentMutationVariables,
  DeleteIncidentMutation,
  DeleteIncidentMutationVariables,
  FetchIncidentsQuery,
  FetchIncidentsQueryVariables,
  GetIncidentDetailQuery,
  GetIncidentDetailQueryVariables,
  ReopenIncidentMutation,
  ReopenIncidentMutationVariables,
  UpdateIncidentMutation,
  UpdateIncidentMutationVariables,
} from "gql/next";

// ── Queries ───────────────────────────────────────────────────────────────────

export const GET_INCIDENTS: TypedDocumentNode<
  FetchIncidentsQuery,
  FetchIncidentsQueryVariables
> = gql`
  query FetchIncidents {
    incidents {
      id
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

export const UPDATE_INCIDENT: TypedDocumentNode<
  UpdateIncidentMutation,
  UpdateIncidentMutationVariables
> = gql`
  mutation UpdateIncident($id: ID!, $name: String, $location: String, $divisions: [DivisionInput!]) {
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
