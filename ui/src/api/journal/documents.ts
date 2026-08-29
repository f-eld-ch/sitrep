import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CloseJournalVars,
  GetJournalsVars,
  InsertJournalVars,
  WireCloseJournalResult,
  WireGetJournalsResult,
  WireInsertJournalResult,
} from "./wire";

export const GET_JOURNALS: TypedDocumentNode<WireGetJournalsResult, GetJournalsVars> = gql`
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

export const INSERT_JOURNAL: TypedDocumentNode<WireInsertJournalResult, InsertJournalVars> = gql`
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

export const CLOSE_JOURNAL: TypedDocumentNode<WireCloseJournalResult, CloseJournalVars> = gql`
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
