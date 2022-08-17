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
};
