import type {
  Division,
  Incident,
  IncidentReview,
  KpiDuration,
  KpiMetric,
  Location,
  ReviewPriorityGroup,
} from "types";
import { toDate, toOptionalDate } from "../common/mapper";
import type { FetchIncidentsQuery, GetIncidentDetailQuery, GetIncidentReviewQuery } from "gql/next";

type WireIncidentSummary = FetchIncidentsQuery["incidents"][0];
type WireIncidentDetail = NonNullable<GetIncidentDetailQuery["incident"]>;

function toLocation(w: WireIncidentSummary["location"] | WireIncidentDetail["location"]): Location {
  if (!w) return { id: "", name: "", coordinates: "" };
  return {
    id: "",
    name: w.name,
    coordinates: w.coordinates ? JSON.stringify(w.coordinates) : "",
  };
}

export function toIncidentSummary(w: WireIncidentSummary): Incident {
  return {
    id: w.id,
    parentId: w.parentId ?? null,
    name: w.name,
    createdAt: toDate(w.createdAt),
    updatedAt: toOptionalDate(w.updatedAt),
    deletedAt: null,
    closedAt: toOptionalDate(w.closedAt),
    canWrite: w.canWrite,
    canManage: w.canManage,
    canDelete: w.canDelete,
    canManageAccess: false,
    accessMode: w.accessMode,
    location: toLocation(w.location),
    divisions: [],
    childIncidents: [],
    layers: [],
  };
}

export function toIncidentDetails(w: WireIncidentDetail): Incident {
  return {
    id: w.id,
    parentId: w.parentId ?? null,
    name: w.name,
    createdAt: toDate(w.createdAt),
    updatedAt: toOptionalDate(w.updatedAt),
    deletedAt: null,
    closedAt: toOptionalDate(w.closedAt),
    canWrite: false,
    canManage: w.canManage,
    canDelete: w.canDelete,
    canManageAccess: w.canManageAccess,
    accessMode: "OPEN_OPERATIONAL",
    location: toLocation(w.location),
    divisions: w.divisions.map((d): Division => ({
      id: d.id,
      name: d.name,
      description: d.description,
      kind: d.kind,
    })),
    childIncidents: [],
    layers: [],
  };
}

type WireReview = NonNullable<NonNullable<GetIncidentReviewQuery["incident"]>["review"]>;
type WireDuration = NonNullable<WireReview["triage"]["duration"]>;

function toKpiDuration(w: WireDuration | null | undefined): KpiDuration | null {
  if (!w) return null;

  return { count: w.count, median: w.medianSeconds, p90: w.p90Seconds, max: w.maxSeconds };
}

function toKpiMetric(w: WireReview["triage"]): KpiMetric {
  return {
    total: w.total,
    completed: w.completed,
    ratio: w.ratio,
    duration: toKpiDuration(w.duration),
    distribution: w.distribution.map((b) => ({
      from: b.fromSeconds,
      to: b.toSeconds,
      count: b.count,
    })),
  };
}

function toPriorityGroup(w: WireReview["triageHigh"]): ReviewPriorityGroup {
  return { count: w.count, duration: toKpiDuration(w.duration) };
}

/** The review of an incident's messages; null when there is none (an imported incident). */
export function toIncidentReview(w: WireReview | null | undefined): IncidentReview | null {
  if (!w) return null;

  return {
    openedAt: toDate(w.openedAt),
    closedAt: toOptionalDate(w.closedAt),
    messageCount: w.messageCount,
    triage: toKpiMetric(w.triage),
    draw: toKpiMetric(w.draw),
    triageHigh: toPriorityGroup(w.triageHigh),
    triageNormal: toPriorityGroup(w.triageNormal),
    divisions: w.divisions.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      kind: d.kind,
      assigned: d.assigned,
      acknowledged: d.acknowledged,
      duration: toKpiDuration(d.duration),
    })),
    unassigned: w.unassigned,
    rework: { ...w.rework },
    reportingLag: toKpiDuration(w.reportingLag),
    load: {
      bucketSeconds: w.load.bucketSeconds,
      buckets: w.load.buckets.map((b) => ({
        start: toDate(b.start),
        entered: b.entered,
        backlog: b.backlog,
      })),
      peakEntered: w.load.peakEntered,
      peakEnteredAt: toOptionalDate(w.load.peakEnteredAt),
      peakBacklog: w.load.peakBacklog,
      peakBacklogAt: toOptionalDate(w.load.peakBacklogAt),
    },
  };
}
