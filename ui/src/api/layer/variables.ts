/** Variables of the GetLayersForIncident query; the cache key of a layers result. */
export function layersVariables(
  incidentId: string,
  asOf?: Date,
): { incidentId: string; asOf?: string } {
  return asOf ? { incidentId, asOf: asOf.toISOString() } : { incidentId };
}

/** When a feature change takes effect on the map timeline (see FeatureChangeInput in the schema). */
export interface FeatureChangeArgs {
  /** The message the change is drawn for. Required on the message map layer. */
  messageId?: string;
  /** Explicit effective time (never in the future). Not allowed together with `messageId`. */
  effectiveAt?: Date;
}

/** Wire form of FeatureChangeArgs; undefined when the change takes effect now. */
export function featureChangeVariable(
  change?: FeatureChangeArgs,
): { messageId?: string; effectiveAt?: string } | undefined {
  if (!change || (!change.messageId && !change.effectiveAt)) return undefined;

  return {
    ...(change.messageId ? { messageId: change.messageId } : {}),
    ...(change.effectiveAt ? { effectiveAt: change.effectiveAt.toISOString() } : {}),
  };
}
