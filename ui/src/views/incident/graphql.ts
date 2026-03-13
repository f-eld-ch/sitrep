import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CloseIncidentMutation,
  CloseIncidentMutationVariables,
  DeleteIncidentMutation,
  DeleteIncidentMutationVariables,
  IncidentDetailsData,
  IncidentDetailsVars,
  IncidentListData,
  InsertIncidentData,
  InsertIncidentVars,
  UpdateIncidentData,
  UpdateIncidentVars,
} from "types/incident";

const GET_INCIDENTS: TypedDocumentNode<IncidentListData, Record<string, never>> = gql`
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
const GET_INCIDENT_DETAILS: TypedDocumentNode<IncidentDetailsData, IncidentDetailsVars> = gql`
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
const INSERT_INCIDENT: TypedDocumentNode<InsertIncidentData, InsertIncidentVars> = gql`
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
const UPDATE_INCIDENT: TypedDocumentNode<UpdateIncidentData, UpdateIncidentVars> = gql`
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
const CLOSE_INCIDENT: TypedDocumentNode<CloseIncidentMutation, CloseIncidentMutationVariables> =
  gql`
    mutation CloseIncident($incidentId: uuid, $closedAt: timestamptz) {
      updateJournals(
        where: { incidentId: { _eq: $incidentId }, closedAt: { _isNull: true } }
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
          journals {
            id
            closedAt
          }
        }
      }
    }
  `;

const DELETE_INCIDENT: TypedDocumentNode<DeleteIncidentMutation, DeleteIncidentMutationVariables> =
  gql`
    mutation DeleteIncident($incidentId: uuid, $deletedAt: timestamptz) {
      updateJournals(
        where: { incidentId: { _eq: $incidentId }, deletedAt: { _isNull: true } }
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
          journals {
            id
            deletedAt
          }
        }
      }
    }
  `;

export {
  CLOSE_INCIDENT as CloseIncident,
  GET_INCIDENT_DETAILS as GetIncidentDetails,
  GET_INCIDENTS as GetIncidents,
  INSERT_INCIDENT as InsertIncident,
  UPDATE_INCIDENT as UpdateIncident,
  DELETE_INCIDENT as DeleteIncident,
};
