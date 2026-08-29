import { GET_MESSAGES } from "./documents";

/**
 * Refetch queries to run after any message write for a given journal.
 * Use this instead of inline refetchQueries: [...] at call sites so
 * the document + variables pairing is kept in one place and can't drift.
 */
export function afterMessageWrite(
  journalId: string,
): Array<{ query: typeof GET_MESSAGES; variables: { journalId: string } }> {
  return [{ query: GET_MESSAGES, variables: { journalId } }];
}
