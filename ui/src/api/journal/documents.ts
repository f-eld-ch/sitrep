import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  CloseJournalMutation,
  CloseJournalMutationVariables,
  GetJournalsQuery,
  GetJournalsQueryVariables,
  InsertJournalMutation,
  InsertJournalMutationVariables,
} from "gql";

export const GET_JOURNALS: TypedDocumentNode<GetJournalsQuery, GetJournalsQueryVariables> = gql`
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

export const INSERT_JOURNAL: TypedDocumentNode<
  InsertJournalMutation,
  InsertJournalMutationVariables
> = gql`
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

export const CLOSE_JOURNAL: TypedDocumentNode<CloseJournalMutation, CloseJournalMutationVariables> =
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
