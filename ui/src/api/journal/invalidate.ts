import { GET_JOURNALS } from "./documents";

export function afterJournalWrite(incidentId: string) {
  return [{ query: GET_JOURNALS, variables: { incidentId } }];
}
