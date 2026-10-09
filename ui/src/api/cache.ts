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
    // A layer's features are the whole list as of the query's point in time (live, or the time of
    // a message), so a newer answer replaces the list. Said explicitly, Apollo does not warn about
    // "cache data may be lost" whenever the Lagebild and the operator view take turns writing it.
    Layer: {
      fields: {
        features: { merge: false },
      },
    },
  },
});
