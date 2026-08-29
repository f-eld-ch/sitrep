import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  WireGetMessageForTriageResult,
  WireGetMessagesResult,
  WireInsertMessageResult,
  WireSaveMessageTriageResult,
  WireUpdateMessageResult,
} from "./wire";

export interface InsertMessageVars {
  journalId: string;
  sender: string;
  receiver: string;
  time: Date;
  content: string;
  receiverDetail: string;
  senderDetail: string;
  medium: string;
}

export interface UpdateMessageVars {
  messageId: string;
  content: string;
  sender: string;
  receiver: string;
  time: Date;
  receiverDetail: string;
  senderDetail: string;
  medium: string;
}

export interface SaveMessageTriageVars {
  messageId: string;
  messageDivisions: Array<{ messageId: string; divisionId: string }>;
  priority: string;
  triage: string;
}

const GET_MESSAGES: TypedDocumentNode<WireGetMessagesResult, { journalId: string }> = gql`
  query GetMessages($journalId: uuid!) {
    journalsByPk(id: $journalId) {
      incident {
        id
        divisions {
          id
          name
          description
        }
      }
    }
    messages(
      where: { journal: { id: { _eq: $journalId } }, deletedAt: { _isNull: true } }
      orderBy: { time: DESC }
    ) {
      id
      content
      sender
      receiver
      senderDetail
      receiverDetail
      medium: mediumId
      time
      createdAt
      updatedAt
      deletedAt
      divisions {
        division {
          id
          name
          description
        }
      }
      triageId
      priorityId
    }
  }
`;

const GET_MESSAGE_FOR_TRIAGE: TypedDocumentNode<
  WireGetMessageForTriageResult,
  { messageId: string }
> = gql`
  query GetMessageForTriage($messageId: uuid!) {
    messagesByPk(id: $messageId) {
      id
      content
      sender
      receiver
      senderDetail
      receiverDetail
      medium: mediumId
      time
      divisions {
        division {
          id
          name
          description
        }
      }
      createdAt
      updatedAt
      deletedAt
      triageId
      priorityId
      journal {
        incident {
          divisions {
            id
            name
            description
          }
        }
      }
    }
  }
`;

const INSERT_MESSAGE: TypedDocumentNode<WireInsertMessageResult, InsertMessageVars> = gql`
  mutation InsertMessage(
    $journalId: uuid
    $sender: String
    $receiver: String
    $time: timestamptz
    $content: String
    $receiverDetail: String
    $senderDetail: String
    $medium: MediumEnum
  ) {
    insertMessagesOne(
      object: {
        content: $content
        journalId: $journalId
        receiver: $receiver
        sender: $sender
        time: $time
        mediumId: $medium
        senderDetail: $senderDetail
        receiverDetail: $receiverDetail
      }
    ) {
      id
      createdAt
      content
      receiver
      sender
      senderDetail
      receiverDetail
      medium: mediumId
      time
      updatedAt
      triageId
      priorityId
      divisions {
        division {
          name
        }
      }
      deletedAt
    }
  }
`;

const UPDATE_MESSAGE: TypedDocumentNode<WireUpdateMessageResult, UpdateMessageVars> = gql`
  mutation UpdateMessage(
    $messageId: uuid!
    $content: String
    $sender: String
    $receiver: String
    $time: timestamptz
    $receiverDetail: String
    $senderDetail: String
    $medium: MediumEnum
  ) {
    updateMessagesByPk(
      pkColumns: { id: $messageId }
      _set: {
        content: $content
        sender: $sender
        receiver: $receiver
        time: $time
        mediumId: $medium
        senderDetail: $senderDetail
        receiverDetail: $receiverDetail
      }
    ) {
      id
      createdAt
      content
      receiver
      sender
      senderDetail
      receiverDetail
      medium: mediumId
      time
      updatedAt
      triageId
      priorityId
      divisions {
        division {
          name
        }
      }
      deletedAt
    }
  }
`;

const SAVE_MESSAGE_TRIAGE: TypedDocumentNode<WireSaveMessageTriageResult, SaveMessageTriageVars> =
  gql`
    mutation SaveMessageTriage(
      $messageId: uuid!
      $priority: PriorityStatusEnum
      $triage: TriageStatusEnum
      $messageDivisions: [MessageDivisionInsertInput!]!
    ) {
      deleteMessageDivision(where: { messageId: { _eq: $messageId } }) {
        affectedRows
      }
      insertMessageDivision(objects: $messageDivisions) {
        affectedRows
      }
      updateMessagesByPk(
        pkColumns: { id: $messageId }
        _set: { priorityId: $priority, triageId: $triage }
      ) {
        id
        divisions {
          division {
            name
          }
        }
        triageId
        priorityId
      }
    }
  `;

export { GET_MESSAGE_FOR_TRIAGE, GET_MESSAGES, INSERT_MESSAGE, SAVE_MESSAGE_TRIAGE, UPDATE_MESSAGE };
