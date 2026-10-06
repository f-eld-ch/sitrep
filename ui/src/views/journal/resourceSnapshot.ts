import type { Resource, ResourceStatus } from "api";

export interface ResourceSnapshot {
  status: ResourceStatus;
  personnelCount: number;
  hauptaufgabe: string;
  deploymentLabel: string | null;
  successorId: string | null;
}

const time = (iso: string) => new Date(iso).getTime();

/**
 * The state of a resource as it was at `at`, reconstructed from its timestamps and deployment
 * history. Used so a triaged message shows the resource as it was when the message was written,
 * not as it is now.
 *
 * A reactivated resource has its cycle timestamps (ready, relieved, …) reset, so earlier days are
 * reconstructed from the deployment periods that are kept: before the first deployment it was
 * alerted, between two deployments of the same day it was ready, and after the last deployment
 * before the reactivation it was relieved. A stand-down followed by a later relief on the same
 * day is not distinguishable any more and reads as relieved.
 */
export function resourceStateAt(r: Resource, at: Date): ResourceSnapshot {
  const ts = at.getTime();

  // Check deployment history periods in chronological order
  const activePeriod = r.deploymentHistory.find((p) => {
    const start = time(p.startedAt);
    const end = p.endedAt ? time(p.endedAt) : Infinity;
    return ts >= start && ts < end;
  });
  if (activePeriod) {
    // For ongoing deployments (endedAt null) prefer the live resource fields —
    // the history entry's deploymentLabel was captured at deploy time and may
    // predate a subsequent updateDeploymentLocation call.
    const ongoing = activePeriod.endedAt === null;
    return {
      status: "EINGESETZT",
      personnelCount: activePeriod.personnelCount,
      hauptaufgabe: ongoing ? r.hauptaufgabe : activePeriod.hauptaufgabe,
      deploymentLabel: ongoing
        ? (r.deploymentLocation?.label ?? activePeriod.deploymentLabel ?? null)
        : (activePeriod.deploymentLabel ?? null),
      successorId: null,
    };
  }

  const snapshot = (
    status: ResourceStatus,
    successorId: string | null = null,
  ): ResourceSnapshot => ({
    status,
    personnelCount: r.personnelCount,
    hauptaufgabe: "",
    deploymentLabel: null,
    successorId,
  });

  // Before the current cycle began (the resource was reactivated since): fall back to the
  // deployment periods of the earlier cycles.
  const cycleStart = time(r.alertedAt);
  const earlier = r.deploymentHistory
    .filter((p) => time(p.startedAt) < cycleStart)
    .sort((a, b) => time(a.startedAt) - time(b.startedAt));
  if (earlier.length > 0 && ts < cycleStart) {
    const lastEnd = (p: (typeof earlier)[number]) => (p.endedAt ? time(p.endedAt) : Infinity);
    const ended = earlier.filter((p) => lastEnd(p) <= ts);
    if (ended.length === 0) return snapshot("AUFGEBOTEN");
    const isFinalPeriodOfEarlierCycle = ended.includes(earlier[earlier.length - 1]);
    return isFinalPeriodOfEarlierCycle ? snapshot("ABGELOEST") : snapshot("EINSATZBEREIT");
  }

  if (r.relievedAt && ts >= time(r.relievedAt)) {
    return snapshot("ABGELOEST", r.successorId ?? null);
  }

  if (r.readyAt && ts >= time(r.readyAt)) {
    return snapshot("EINSATZBEREIT");
  }

  return snapshot("AUFGEBOTEN");
}
