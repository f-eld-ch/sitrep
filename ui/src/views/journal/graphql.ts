import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CloseJournalData,
  CloseJournalVars,
  GetJournalsData,
  GetJournalsVars,
  InsertJournalData,
  InsertJournalVars,
} from "types/journal";

// Message operations have moved to src/api/message/documents.ts.
// Only journal-level operations remain here pending the journal aggregate migration.

const INSERT_JOURNAL: TypedDocumentNode<InsertJournalData, InsertJournalVars> = gql`
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
const CLOSE_JOURNAL: TypedDocumentNode<CloseJournalData, CloseJournalVars> = gql`
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

export {
  CLOSE_JOURNAL as CloseJournal,
  GET_JOURNALS as GetJournals,
  INSERT_JOURNAL as InsertJournal,
};
