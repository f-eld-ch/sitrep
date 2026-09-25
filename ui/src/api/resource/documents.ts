import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AlertResourceInput,
  AlertResourceMutation,
  AlertResourceMutationVariables,
  ChangeHauptaufgabeMutation,
  ChangeHauptaufgabeMutationVariables,
  DeployResourceMutation,
  DeployResourceMutationVariables,
  GetIncidentResourcesQuery,
  GetIncidentResourcesQueryVariables,
  MarkResourceReadyMutation,
  MarkResourceReadyMutationVariables,
  RelieveResourceMutation,
  RelieveResourceMutationVariables,
  StandDownResourceMutation,
  StandDownResourceMutationVariables,
  UpdatePersonnelCountMutation,
  UpdatePersonnelCountMutationVariables,
} from "../../gql/next/graphql";

export type { AlertResourceInput, GetIncidentResourcesQuery, GetIncidentResourcesQueryVariables };

// ── Fragments ─────────────────────────────────────────────────────────────────

export const RESOURCE_FIELDS = gql`
  fragment ResourceFields on Resource {
    id
    incidentId
    schadenplatzId
    formation
    name
    size
    personnelCount
    hauptaufgabe
    contact {
      medium
      detail
    }
    homeLocation {
      name
      lat
      lng
    }
    deploymentLocation {
      lat
      lng
      label
    }
    status
    statusAt
    alertedAt
    readyAt
    deployedAt
    stoodDownAt
    relievedAt
    einsatzBeginn
    einsatzEnde
    predecessorId
    successorId
    sourceMessageId
    deploymentHistory {
      startedAt
      endedAt
      schadenplatzId
      formation
      name
      homeLocationName
      deploymentLabel
      hauptaufgabe
      personnelCount
    }
  }
`;

export const SCHADENPLATZ_FIELDS = gql`
  fragment SchadenplatzFields on Schadenplatz {
    id
    incidentId
    name
    isDefault
    casualties {
      vermisste
      tote
      verletzte
      obdachlose
      eingeschlossene
    }
    isMerged
    mergedInto
  }
`;

// ── Queries ───────────────────────────────────────────────────────────────────

export const GET_INCIDENT_RESOURCES: TypedDocumentNode<
  GetIncidentResourcesQuery,
  GetIncidentResourcesQueryVariables
> = gql`
  ${SCHADENPLATZ_FIELDS}
  ${RESOURCE_FIELDS}
  query GetIncidentResources($incidentId: ID!) {
    incident(id: $incidentId) {
      id
      name
      childIncidents {
        id
        name
        schadenplaetze {
          ...SchadenplatzFields
        }
      }
      resources {
        ...ResourceFields
      }
      schadenplaetze {
        ...SchadenplatzFields
        resources {
          ...ResourceFields
        }
      }
    }
  }
`;

// ── Mutations ─────────────────────────────────────────────────────────────────

export const ALERT_RESOURCE: TypedDocumentNode<
  AlertResourceMutation,
  AlertResourceMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation AlertResource($input: AlertResourceInput!) {
    alertResource(input: $input) {
      ...ResourceFields
    }
  }
`;

export const MARK_RESOURCE_READY: TypedDocumentNode<
  MarkResourceReadyMutation,
  MarkResourceReadyMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation MarkResourceReady($id: ID!, $at: DateTime) {
    markResourceReady(id: $id, at: $at) {
      ...ResourceFields
    }
  }
`;

export const DEPLOY_RESOURCE: TypedDocumentNode<
  DeployResourceMutation,
  DeployResourceMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation DeployResource($id: ID!, $at: DateTime) {
    deployResource(id: $id, at: $at) {
      ...ResourceFields
    }
  }
`;

export const STAND_DOWN_RESOURCE: TypedDocumentNode<
  StandDownResourceMutation,
  StandDownResourceMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation StandDownResource($id: ID!, $at: DateTime) {
    standDownResource(id: $id, at: $at) {
      ...ResourceFields
    }
  }
`;

export const RELIEVE_RESOURCE: TypedDocumentNode<
  RelieveResourceMutation,
  RelieveResourceMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation RelieveResource($id: ID!, $successorId: ID, $at: DateTime) {
    relieveResource(id: $id, successorId: $successorId, at: $at) {
      ...ResourceFields
    }
  }
`;

export const CHANGE_HAUPTAUFGABE: TypedDocumentNode<
  ChangeHauptaufgabeMutation,
  ChangeHauptaufgabeMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation ChangeHauptaufgabe($id: ID!, $hauptaufgabe: String!, $at: DateTime) {
    changeHauptaufgabe(id: $id, hauptaufgabe: $hauptaufgabe, at: $at) {
      ...ResourceFields
    }
  }
`;

export const UPDATE_PERSONNEL_COUNT: TypedDocumentNode<
  UpdatePersonnelCountMutation,
  UpdatePersonnelCountMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation UpdatePersonnelCount($id: ID!, $count: Int!, $at: DateTime) {
    updatePersonnelCount(id: $id, count: $count, at: $at) {
      ...ResourceFields
    }
  }
`;

export const REASSIGN_RESOURCE = gql`
  ${RESOURCE_FIELDS}
  mutation ReassignResource($id: ID!, $schadenplatzId: ID!, $at: DateTime) {
    reassignResource(id: $id, schadenplatzId: $schadenplatzId, at: $at) {
      ...ResourceFields
    }
  }
`;

export const UPDATE_DEPLOYMENT_LOCATION = gql`
  ${RESOURCE_FIELDS}
  mutation UpdateDeploymentLocation($id: ID!, $label: String!, $at: DateTime) {
    updateDeploymentLocation(id: $id, location: { label: $label }, at: $at) {
      ...ResourceFields
    }
  }
`;

export const UPDATE_CONTACT = gql`
  ${RESOURCE_FIELDS}
  mutation UpdateContact($id: ID!, $medium: ContactMedium!, $detail: String!, $at: DateTime) {
    updateContact(id: $id, contact: { medium: $medium, detail: $detail }, at: $at) {
      ...ResourceFields
    }
  }
`;
