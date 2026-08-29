import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CloseIncidentMutation,
  CloseIncidentMutationVariables,
  DeleteIncidentMutation,
  DeleteIncidentMutationVariables,
  FetchIncidentsQuery,
  FetchIncidentsQueryVariables,
  GetIncidentDetailQuery,
  GetIncidentDetailQueryVariables,
  InsertIncidentMutation,
  InsertIncidentMutationVariables,
  UpdateIncidentMutation,
  UpdateIncidentMutationVariables,
} from "gql";

export const GET_INCIDENTS: TypedDocumentNode<FetchIncidentsQuery, FetchIncidentsQueryVariables> =
  gql`
    query FetchIncidents {
      incidents(orderBy: { createdAt: DESC }, where: { deletedAt: { _isNull: true } }) {
        id
        name
        createdAt
        updatedAt
        deletedAt
        closedAt
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
  query GetIncidentDetail($incidentId: uuid!) {
    incidentsByPk(id: $incidentId) {
      id
      name
      createdAt
      closedAt
      updatedAt
      location {
        id
        name
        coordinates
      }
      divisions {
        id
        name
        description
      }
      journals {
        id
        name
      }
    }
  }
`;

export const INSERT_INCIDENT: TypedDocumentNode<
  InsertIncidentMutation,
  InsertIncidentMutationVariables
> = gql`
  mutation InsertIncident(
    $name: String!
    $location: String
    $divisions: [DivisionsInsertInput!]!
    $journalName: String
    $layerName: String
  ) {
    insertIncidentsOne(
      object: {
        name: $name
        location: { data: { name: $location } }
        journals: { data: { name: $journalName } }
        layers: { data: { name: $layerName } }
        divisions: { data: $divisions }
      }
    ) {
      id
      name
      journals {
        id
        name
      }
      divisions {
        name
        id
        description
      }
      layers {
        name
        id
      }
    }
  }
`;

export const UPDATE_INCIDENT: TypedDocumentNode<
  UpdateIncidentMutation,
  UpdateIncidentMutationVariables
> = gql`
  mutation UpdateIncident(
    $incidentId: uuid!
    $name: String!
    $location: String!
    $locationId: uuid!
    $divisions: [DivisionsInsertInput!]!
  ) {
    updateLocationsByPk(pkColumns: { id: $locationId }, _set: { name: $location }) {
      id
      name
    }
    insertDivisions(
      objects: $divisions
      onConflict: { constraint: divisions_name_incident_id_key, updateColumns: [description, name] }
    ) {
      affectedRows
    }
    updateIncidentsByPk(pkColumns: { id: $incidentId }, _set: { name: $name }) {
      id
      name
      journals {
        id
        name
      }
      divisions {
        name
        id
        description
      }
    }
  }
`;

export const CLOSE_INCIDENT: TypedDocumentNode<
  CloseIncidentMutation,
  CloseIncidentMutationVariables
> = gql`
  mutation CloseIncident($incidentId: uuid, $closedAt: timestamptz) {
    updateJournals(
      where: { incident: { id: { _eq: $incidentId } }, closedAt: { _isNull: true } }
      _set: { closedAt: $closedAt }
    ) {
      affectedRows
      returning {
        id
        closedAt
      }
    }
    updateIncidents(where: { id: { _eq: $incidentId } }, _set: { closedAt: $closedAt }) {
      affectedRows
      returning {
        id
        closedAt
      }
    }
  }
`;

export const DELETE_INCIDENT: TypedDocumentNode<
  DeleteIncidentMutation,
  DeleteIncidentMutationVariables
> = gql`
  mutation DeleteIncident($incidentId: uuid, $deletedAt: timestamptz) {
    updateJournals(
      where: { incident: { id: { _eq: $incidentId } }, deletedAt: { _isNull: true } }
      _set: { deletedAt: $deletedAt }
    ) {
      affectedRows
      returning {
        id
        deletedAt
      }
    }
    updateIncidents(
      where: {
        id: { _eq: $incidentId }
        deletedAt: { _isNull: true }
        closedAt: { _isNull: false }
      }
      _set: { deletedAt: $deletedAt }
    ) {
      affectedRows
      returning {
        id
        deletedAt
      }
    }
  }
`;
