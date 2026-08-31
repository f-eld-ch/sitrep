import { GET_INCIDENT_DETAILS, GET_INCIDENTS } from "./documents.next";

type AfterIncidentWriteEntry =
  | { query: typeof GET_INCIDENTS }
  | { query: typeof GET_INCIDENT_DETAILS; variables: { incidentId: string } };

export function afterIncidentWrite(incidentId?: string): AfterIncidentWriteEntry[] {
  if (incidentId) {
    return [{ query: GET_INCIDENTS }, { query: GET_INCIDENT_DETAILS, variables: { incidentId } }];
  }
  return [{ query: GET_INCIDENTS }];
}
