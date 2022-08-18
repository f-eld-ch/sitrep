import { gql } from "@apollo/client";

const GET_MESSAGES = gql`
  query GetMessages($journalId: uuid!) {
    journals_by_pk(id: $journalId) {
      incident {
        id
        divisions {
          id
          name
          description
        }
      }
    }
    messages(where: { journal: { id: { _eq: $journalId } }, deletedAt: { _is_null: true } }, order_by: { time: desc }) {
      id
      content
      sender
      receiver
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
      triage {
        name
        name
      }
      priority {
        name
      }
    }
  }
`;
const INSERT_JOURNAL = gql`
  mutation InsertJournal($name: String!, $incidentId: uuid!) {
    insert_journals_one(object: { incidentId: $incidentId, name: $name }) {
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
      journals(order_by: { createdAt: asc }) {
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
    update_journals(where: { id: { _eq: $journalId } }, _set: { closedAt: $closedAt }) {
      affected_rows
      returning {
        id
        closedAt
      }
    }
  }
`;
const INSERT_MESSAGE = gql`
  mutation InsertMessage($journalId: uuid, $sender: String, $receiver: String, $time: timestamptz, $content: String) {
    insert_messages_one(
      object: { content: $content, journalId: $journalId, receiver: $receiver, sender: $sender, time: $time }
    ) {
      id
      createdAt
      content
      receiver
      sender
      time
      updatedAt
      priority {
        name
      }
      triage {
        name
      }
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
  mutation UpdateMessage($messageId: uuid!, $content: String, $sender: String, $receiver: String, $time: timestamptz) {
    update_messages_by_pk(
      pk_columns: { id: $messageId }
      _set: { content: $content, sender: $sender, receiver: $receiver, time: $time }
    ) {
      id
      createdAt
      content
      receiver
      sender
      time
      updatedAt
      priority {
        name
      }
      triage {
        name
      }
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
    $priority: priority_status_enum
    $triage: triage_status_enum
    $messageDivisions: [message_division_insert_input!]!
  ) {
    delete_message_division(where: { messageId: { _eq: $messageId } }) {
      affected_rows
    }
    insert_message_division(objects: $messageDivisions) {
      affected_rows
    }
    update_messages_by_pk(pk_columns: { id: $messageId }, _set: { priorityId: $priority, triageId: $triage }) {
      id
      divisions {
        division {
          name
        }
      }
      priority {
        name
      }
      triage {
        name
      }
    }
  }
`;
const GET_MESSAGE_FOR_TRIAGE = gql`
  query GetMessageForTriage($messageId: uuid!) {
    messages_by_pk(id: $messageId) {
      id
      content
      sender
      receiver
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
      priority {
        name
      }
      triage {
        name
      }
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
  GET_MESSAGES as GetJournalMessages,
  GET_JOURNALS as GetJournals,
  INSERT_JOURNAL as InsertJournal,
  CLOSE_JOURNAL as CloseJournal,
  INSERT_MESSAGE as InsertMessage,
  UPDATE_MESSAGE as UpdateMessage,
  SAVE_MESSAGE_TRIAGE as SaveMessageTriage,
  GET_MESSAGE_FOR_TRIAGE as GetMessageForTriage,
};

