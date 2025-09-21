import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CloseJournalData,
  CloseJournalVars,
  GetJournalMessagesData,
  GetJournalMessagesVars,
  GetJournalsData,
  GetJournalsVars,
  InsertJournalData,
  InsertJournalVars,
  InsertMessageVars,
  Message,
  SaveMessageTriageData,
  SaveMessageTriageVars,
  TriageMessageData,
  TriageMessageVars,
  UpdateMessageVars,
} from "types/journal";

const GET_MESSAGES: TypedDocumentNode<
  GetJournalMessagesData,
  GetJournalMessagesVars
> = gql`
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
    messages(where: { journal: { id: { _eq: $journalId } }, deletedAt: { _isNull: true } }, orderBy: { time: DESC }) {
      id
      content
      sender
      receiver
      senderDetail
      receiverDetail
      mediumId
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
const INSERT_JOURNAL: TypedDocumentNode<InsertJournalData, InsertJournalVars> =
  gql`
  mutation InsertJournal($name: String!, $incidentId: uuid!) {
    insertJournalsOne(object: { incidentId: $incidentId, name: $name }) {
      id
      name
      createdAt
      updatedAt
      closedAt
      deletedAt
    }
  }
`;
const GET_JOURNALS: TypedDocumentNode<GetJournalsData, GetJournalsVars> = gql`
  query GetJournals($incidentId: uuid) {
    incidents(where: { id: { _eq: $incidentId } }) {
      id
      name
      journals(orderBy: { createdAt: ASC }) {
        id
        name
        createdAt
        updatedAt
        closedAt
        deletedAt
      }
    }
  }
`;
const CLOSE_JOURNAL: TypedDocumentNode<CloseJournalData, CloseJournalVars> =
  gql`
  mutation CloseJournal($journalId: uuid, $closedAt: timestamptz) {
    updateJournals(where: { id: { _eq: $journalId } }, _set: { closedAt: $closedAt }) {
      affectedRows
      returning {
        id
        closedAt
      }
    }
  }
`;

const INSERT_MESSAGE: TypedDocumentNode<Message, InsertMessageVars> = gql`
  mutation InsertMessage(
    $journalId: uuid
    $sender: String
    $receiver: String
    $time: timestamptz
    $content: String
    $receiverDetail: String
    $senderDetail: String
    $type: MediumEnum
  )
{
  insertMessagesOne(
      object: {
        content: $content
        journalId: $journalId
        receiver: $receiver
        sender: $sender
        time: $time
        mediumId: $type
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
      mediumId
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

const UPDATE_MESSAGE: TypedDocumentNode<Message, UpdateMessageVars> = gql`
  mutation UpdateMessage(
    $messageId: uuid!
    $content: String
    $sender: String
    $receiver: String
    $time: timestamptz
    $receiverDetail: String
    $senderDetail: String
    $mediumId: MediumEnum
  ) {
    updateMessagesByPk(
      pkColumns: { id: $messageId }
      _set: {
        content: $content
        sender: $sender
        receiver: $receiver
        time: $time
        mediumId: $mediumId
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
      mediumId
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
const SAVE_MESSAGE_TRIAGE: TypedDocumentNode<
  SaveMessageTriageData,
  SaveMessageTriageVars
> = gql`
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
    updateMessagesByPk(pkColumns: { id: $messageId }, _set: { priorityId: $priority, triageId: $triage }) {
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
const GET_MESSAGE_FOR_TRIAGE: TypedDocumentNode<
  TriageMessageData,
  TriageMessageVars
> = gql`
  query GetMessageForTriage($messageId: uuid!) {
    messagesByPk(id: $messageId) {
      id
      content
      sender
      receiver
      senderDetail
      receiverDetail
      mediumId
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

export {
  CLOSE_JOURNAL as CloseJournal,
  GET_MESSAGES as GetJournalMessages,
  GET_JOURNALS as GetJournals,
  GET_MESSAGE_FOR_TRIAGE as GetMessageForTriage,
  INSERT_JOURNAL as InsertJournal,
  INSERT_MESSAGE as InsertMessage,
  SAVE_MESSAGE_TRIAGE as SaveMessageTriage,
  UPDATE_MESSAGE as UpdateMessage,
};
