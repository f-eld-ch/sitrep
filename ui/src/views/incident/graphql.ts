import { gql } from "@apollo/client";

const GET_INCIDENTS = gql`
  query FetchIncidents {
    incidents(orderBy: { createdAt: DESC }) {
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
const GET_INCIDENT_DETAILS = gql`
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
const INSERT_INCIDENT = gql`
  mutation InsertIncident(
    $name: String!
    $location: String
    $divisions: [DivisionsInsertInput!]!
    $journalName: String
  ) {
    insertIncidentsOne(
      object: {
        name: $name
        location: { data: { name: $location } }
        journals: { data: { name: $journalName } }
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
    }
  }
`;
const UPDATE_INCIDENT = gql`
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
      onConflict: { constraint: divisions_name_incident_id_key, update_columns: [description, name] }
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
const CLOSE_INCIDENT = gql`
  mutation CloseIncident($incidentId: uuid, $closedAt: timestamptz) {
    updateIncidents(where: { id: { _eq: $incidentId } }, _set: { closedAt: $closedAt }) {
      affectedRows
      returning {
        id
        closedAt
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
};
