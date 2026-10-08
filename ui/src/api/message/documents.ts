import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CreateMessageMutation,
  CreateMessageMutationVariables,
  AcknowledgeMessageMutation,
  AcknowledgeMessageMutationVariables,
  RevokeMessageAcknowledgementMutation,
  RevokeMessageAcknowledgementMutationVariables,
  GetIncidentMessagesQuery,
  GetIncidentMessagesQueryVariables,
  GetMessageForTriageQuery,
  GetMessageForTriageQueryVariables,
  RemoveAttachmentMutation,
  RemoveAttachmentMutationVariables,
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
        kind
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
        author
        divisions {
          id
          name
          description
          kind
        }
        acknowledgements {
          division {
            id
          }
          acknowledgedAt
          acknowledgedBy
        }
        attachments {
          id
          filename
          contentType
          size
          createdAt
          uploadedBy
          url
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
      author
      divisions {
        id
        name
        description
        kind
      }
      acknowledgements {
        division {
          id
        }
        acknowledgedAt
        acknowledgedBy
      }
      attachments {
        id
        filename
        contentType
        size
        createdAt
        uploadedBy
        url
      }
      schadenplatzCasualties {
        schadenplatzId
        vermisste
        tote
        verletzte
        obdachlose
        eingeschlossene
      }
      linkedResourceIds
    }
    incident(id: $incidentId) {
      id
      divisions {
        id
        name
        description
        kind
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
      author
      divisions {
        id
        name
        description
        kind
      }
      acknowledgements {
        division {
          id
        }
        acknowledgedAt
        acknowledgedBy
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
    $linkedResourceIds: [ID!]!
  ) {
    triageMessage(
      id: $id
      input: {
        triage: $triage
        priority: $priority
        divisionIds: $divisionIds
        linkedResourceIds: $linkedResourceIds
      }
    ) {
      id
      triage
      priority
      divisions {
        id
        name
        description
        kind
      }
      acknowledgements {
        division {
          id
        }
        acknowledgedAt
        acknowledgedBy
      }
      linkedResourceIds
    }
  }
`;

export const REMOVE_ATTACHMENT: TypedDocumentNode<
  RemoveAttachmentMutation,
  RemoveAttachmentMutationVariables
> = gql`
  mutation RemoveAttachment($messageId: ID!, $attachmentId: ID!) {
    removeAttachment(messageId: $messageId, attachmentId: $attachmentId)
  }
`;

export const ACKNOWLEDGE_MESSAGE: TypedDocumentNode<
  AcknowledgeMessageMutation,
  AcknowledgeMessageMutationVariables
> = gql`
  mutation AcknowledgeMessage($id: ID!, $divisionId: ID!) {
    acknowledgeMessage(id: $id, divisionId: $divisionId) {
      id
      acknowledgements {
        division {
          id
        }
        acknowledgedAt
        acknowledgedBy
      }
    }
  }
`;

export const REVOKE_MESSAGE_ACKNOWLEDGEMENT: TypedDocumentNode<
  RevokeMessageAcknowledgementMutation,
  RevokeMessageAcknowledgementMutationVariables
> = gql`
  mutation RevokeMessageAcknowledgement($id: ID!, $divisionId: ID!) {
    revokeMessageAcknowledgement(id: $id, divisionId: $divisionId) {
      id
      acknowledgements {
        division {
          id
        }
        acknowledgedAt
        acknowledgedBy
      }
    }
  }
`;
