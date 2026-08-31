import { GET_INCIDENT_MESSAGES } from "./documents.next";

/**
 * Refetch queries to run after any message write for a given incident.
 * Use this instead of inline refetchQueries: [...] at call sites so
 * the document + variables pairing is kept in one place and can't drift.
 */
export function afterMessageWrite(
  incidentId: string,
): Array<{ query: typeof GET_INCIDENT_MESSAGES; variables: { incidentId: string } }> {
  return [{ query: GET_INCIDENT_MESSAGES, variables: { incidentId } }];
}
