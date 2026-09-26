// Tracks when a write mutation last fired so polling can be suppressed
// during the projector's processing window.
let lastMutationAt = 0;

export function recordMutation(): void {
  lastMutationAt = Date.now();
}

// Returns true if a mutation fired within the last 2 s — callers should skip
// their poll attempt to avoid overwriting the mutation result with stale
// read-model data before the projector has had time to process the event.
export function isMutationRecent(): boolean {
  return Date.now() - lastMutationAt < 2000;
}
