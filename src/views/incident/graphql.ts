import { gql } from "@apollo/client";

const GET_INCIDENTS = gql`
  query FetchIncidents {
    incidents(order_by: { createdAt: desc }) {
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
    incidents_by_pk(id: $incidentId) {
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
    $divisions: [divisions_insert_input!]!
    $journalName: String
  ) {
    insert_incidents_one(
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
    $divisions: [divisions_insert_input!]!
  ) {
    update_locations_by_pk(pk_columns: { id: $locationId }, _set: { name: $location }) {
      id
      name
    }
    insert_divisions(
      objects: $divisions
      on_conflict: { constraint: divisions_name_incident_id_key, update_columns: [description, name] }
    ) {
      affected_rows
    }
    update_incidents_by_pk(pk_columns: { id: $incidentId }, _set: { name: $name }) {
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
    update_incidents(where: { id: { _eq: $incidentId } }, _set: { closedAt: $closedAt }) {
      affected_rows
      returning {
        id
        closedAt
      }
    }
  }
`;

export {
    GET_INCIDENTS as GetIncidents,
    GET_INCIDENT_DETAILS as GetIncidentDetails,
    CLOSE_INCIDENT as CloseIncident,
    INSERT_INCIDENT as InsertIncident,
    UPDATE_INCIDENT as UpdateIncident,
};
