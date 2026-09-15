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

export type {
  AlertResourceInput,
  GetIncidentResourcesQuery,
  GetIncidentResourcesQueryVariables,
};

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
    einsatzBeginn
    einsatzEnde
    predecessorId
    successorId
    sourceMessageId
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
  mutation MarkResourceReady($id: ID!) {
    markResourceReady(id: $id) {
      ...ResourceFields
    }
  }
`;

export const DEPLOY_RESOURCE: TypedDocumentNode<
  DeployResourceMutation,
  DeployResourceMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation DeployResource($id: ID!) {
    deployResource(id: $id) {
      ...ResourceFields
    }
  }
`;

export const STAND_DOWN_RESOURCE: TypedDocumentNode<
  StandDownResourceMutation,
  StandDownResourceMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation StandDownResource($id: ID!) {
    standDownResource(id: $id) {
      ...ResourceFields
    }
  }
`;

export const RELIEVE_RESOURCE: TypedDocumentNode<
  RelieveResourceMutation,
  RelieveResourceMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation RelieveResource($id: ID!, $successorId: ID) {
    relieveResource(id: $id, successorId: $successorId) {
      ...ResourceFields
    }
  }
`;

export const CHANGE_HAUPTAUFGABE: TypedDocumentNode<
  ChangeHauptaufgabeMutation,
  ChangeHauptaufgabeMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation ChangeHauptaufgabe($id: ID!, $hauptaufgabe: String!) {
    changeHauptaufgabe(id: $id, hauptaufgabe: $hauptaufgabe) {
      ...ResourceFields
    }
  }
`;

export const UPDATE_PERSONNEL_COUNT: TypedDocumentNode<
  UpdatePersonnelCountMutation,
  UpdatePersonnelCountMutationVariables
> = gql`
  ${RESOURCE_FIELDS}
  mutation UpdatePersonnelCount($id: ID!, $count: Int!) {
    updatePersonnelCount(id: $id, count: $count) {
      ...ResourceFields
    }
  }
`;

