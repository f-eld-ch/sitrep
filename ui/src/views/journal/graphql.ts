import { gql } from "@apollo/client";

const GET_MESSAGES = gql`
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
const INSERT_JOURNAL = gql`
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
const GET_JOURNALS = gql`
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
const CLOSE_JOURNAL = gql`
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
const INSERT_MESSAGE = gql`
  mutation InsertMessage(
    $journalId: uuid
    $sender: String
    $receiver: String
    $time: timestamptz
    $content: String
    $receiverDetail: String
    $senderDetail: String
    $type: MediumEnum
  ) {
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

const UPDATE_MESSAGE = gql`
  mutation UpdateMessage(
    $messageId: uuid!
    $content: String
    $sender: String
    $receiver: String
    $time: timestamptz
    $receiverDetail: String
    $senderDetail: String
    $type: MediumEnum
  ) {
    updateMessagesByPk(
      pkColumns: { id: $messageId }
      _set: {
        content: $content
        sender: $sender
        receiver: $receiver
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
const SAVE_MESSAGE_TRIAGE = gql`
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
const GET_MESSAGE_FOR_TRIAGE = gql`
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
