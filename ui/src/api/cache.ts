import { InMemoryCache, makeVar } from "@apollo/client";

// active Incident
export const activeIncidentVar = makeVar<string>("");

export const cache: InMemoryCache = new InMemoryCache({
  typePolicies: {
    // IncidentAccessGrant has no synthetic `id`; its identity is the triple
    // (incidentId, principalKind, principalId) — one principal holds at most
    // one role per incident at a time.
    IncidentAccessGrant: {
      keyFields: ["incidentId", "principalKind", "principalId"],
    },
    // DefaultAccessGrant has no incidentId — keyed by (principalKind, principalId).
    DefaultAccessGrant: {
      keyFields: ["principalKind", "principalId"],
    },
  },
});
