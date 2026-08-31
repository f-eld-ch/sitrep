import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CreateMessageMutation,
  CreateMessageMutationVariables,
  GetIncidentMessagesQuery,
  GetIncidentMessagesQueryVariables,
  GetMessageForTriageQuery,
  GetMessageForTriageQueryVariables,
  TriageMessageMutation,
  TriageMessageMutationVariables,
  UpdateMessageMutation,
  UpdateMessageMutationVariables,
} from "gql/next";

// ── Queries ───────────────────────────────────────────────────────────────────

export const GET_INCIDENT_MESSAGES: TypedDocumentNode<
  GetIncidentMessagesQuery,
  GetIncidentMessagesQueryVariables
> = gql`
  query GetIncidentMessages($incidentId: ID!) {
    incident(id: $incidentId) {
      id
      divisions {
        id
        name
        description
      }
      messages {
        id
        number
        sender
        receiver
        senderDetail
        receiverDetail
        content
        medium
        time
        createdAt
        updatedAt
        triage
        priority
        divisions {
          id
          name
          description
        }
      }
    }
  }
`;

export const GET_MESSAGE_FOR_TRIAGE: TypedDocumentNode<
  GetMessageForTriageQuery,
  GetMessageForTriageQueryVariables
> = gql`
  query GetMessageForTriage($messageId: ID!, $incidentId: ID!) {
    message(id: $messageId) {
      id
      number
      sender
      receiver
      senderDetail
      receiverDetail
      content
      medium
      time
      createdAt
      updatedAt
      triage
      priority
      divisions {
        id
        name
        description
      }
    }
    incident(id: $incidentId) {
      divisions {
        id
        name
        description
      }
    }
  }
`;

// ── Mutations ─────────────────────────────────────────────────────────────────

export const CREATE_MESSAGE: TypedDocumentNode<
  CreateMessageMutation,
  CreateMessageMutationVariables
> = gql`
  mutation CreateMessage(
    $incidentId: ID!
    $sender: String!
    $receiver: String!
    $senderDetail: String!
    $receiverDetail: String!
    $content: String!
    $medium: Medium!
    $time: DateTime
  ) {
    createMessage(
      input: {
        incidentId: $incidentId
        sender: $sender
        receiver: $receiver
        senderDetail: $senderDetail
        receiverDetail: $receiverDetail
        content: $content
        medium: $medium
        time: $time
      }
    ) {
      id
      number
      sender
      receiver
      senderDetail
      receiverDetail
      content
      medium
      time
      createdAt
      updatedAt
      triage
      priority
      divisions {
        id
        name
        description
      }
    }
  }
`;

export const UPDATE_MESSAGE: TypedDocumentNode<
  UpdateMessageMutation,
  UpdateMessageMutationVariables
> = gql`
  mutation UpdateMessage(
    $id: ID!
    $sender: String
    $receiver: String
    $senderDetail: String
    $receiverDetail: String
    $content: String
    $medium: Medium
    $time: DateTime
  ) {
    updateMessage(
      id: $id
      input: {
        sender: $sender
        receiver: $receiver
        senderDetail: $senderDetail
        receiverDetail: $receiverDetail
        content: $content
        medium: $medium
        time: $time
      }
    ) {
      id
      number
      sender
      receiver
      senderDetail
      receiverDetail
      content
      medium
      time
      createdAt
      updatedAt
      triage
      priority
      divisions {
        id
        name
        description
      }
    }
  }
`;

export const TRIAGE_MESSAGE: TypedDocumentNode<
  TriageMessageMutation,
  TriageMessageMutationVariables
> = gql`
  mutation TriageMessage(
    $id: ID!
    $triage: TriageStatus!
    $priority: PriorityStatus!
    $divisionIds: [ID!]!
  ) {
    triageMessage(
      id: $id
      input: { triage: $triage, priority: $priority, divisionIds: $divisionIds }
    ) {
      id
      triage
      priority
      divisions {
        id
        name
        description
      }
    }
  }
`;
