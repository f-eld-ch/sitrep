import type { Division } from "./journal";
import type { Layer } from "./layer";

export interface Location {
  name: string;
  id: string;
  coordinates: string;
}

/** How long a step took, in seconds, over the messages that got through it. */
export interface KpiDuration {
  /** How many messages the figures are based on. */
  count: number;
  median: number;
  /** 90 percent of the messages were at least this fast. */
  p90: number;
  max: number;
}

/** How many messages took a time within a range, in seconds. */
export interface KpiBucket {
  /** Included. */
  from: number;
  /** Excluded; null for the last range, which has no upper end. */
  to: number | null;
  count: number;
}

/** One key figure of an incident. */
export interface KpiMetric {
  /** How many messages it applies to. */
  total: number;
  /** How many of those got through. */
  completed: number;
  /** Share of messages that got through, from 0 to 1; null when none applied. */
  ratio: number | null;
  /** How long it took the messages that got through; null when none did. */
  duration: KpiDuration | null;
  /** How many of them took which time, shortest range first; empty when none got through. */
  distribution: KpiBucket[];
}

/** The triage time of the triaged messages of one priority. */
export interface ReviewPriorityGroup {
  count: number;
  duration: KpiDuration | null;
}

/** How many messages a division was given, how many it acknowledged, and how long that took. */
export interface ReviewDivision {
  id: string;
  /** The short name. */
  name: string;
  /** The full name. */
  description: string;
  /** The Nachrichtenkarte acknowledges a message by drawing it. */
  kind: "STANDARD" | "MESSAGE_MAP";
  assigned: number;
  acknowledged: number;
  duration: KpiDuration | null;
}

/** How many messages had to be handled again; a message can be in several of them. */
export interface ReviewRework {
  total: number;
  moreInfo: number;
  reset: number;
  correctedAfterTriage: number;
  reworked: number;
}

export interface ReviewLoadBucket {
  start: Date;
  /** Messages entered in it. */
  entered: number;
  /** Messages still waiting for their first triage at its end. */
  backlog: number;
}

/** How many messages came in over time, and how many were waiting. */
export interface ReviewLoad {
  bucketSeconds: number;
  buckets: ReviewLoadBucket[];
  peakEntered: number;
  peakEnteredAt: Date | null;
  peakBacklog: number;
  peakBacklogAt: Date | null;
}

/** Where one value of an incident lies among the same value of the other incidents. */
export interface ReviewBenchmark {
  /** This incident's value, null when it has none. Times are in seconds, shares from 0 to 1. */
  value: number | null;
  /** How many other incidents have a value. */
  peers: number;
  /** Whether there are enough of them to compare with. */
  sufficient: boolean;
  lowest: number;
  /** A quarter of the other incidents are at or below this. */
  q1: number;
  median: number;
  /** Three quarters of the other incidents are at or below this. */
  q3: number;
  highest: number;
  /** The share of the other incidents this one beats, 0 to 1; null without a value or peers. */
  betterThan: number | null;
}

/** How an incident's headline compares with the other incidents. */
export interface ReviewComparison {
  triageMedian: ReviewBenchmark;
  triageRatio: ReviewBenchmark;
  drawMedian: ReviewBenchmark;
  drawRatio: ReviewBenchmark;
}

/**
 * The review of an incident's messages, for the discussion after the operation. For a closed
 * incident it is always the same; for an open one it is an interim status.
 */
export interface IncidentReview {
  comparison: ReviewComparison;
  openedAt: Date;
  /** Null while the incident is open. */
  closedAt: Date | null;
  messageCount: number;
  /** From a message being entered to it being triaged. */
  triage: KpiMetric;
  /** From a message being triaged to the Nachrichtenkarte to it being drawn. */
  draw: KpiMetric;
  triageHigh: ReviewPriorityGroup;
  triageNormal: ReviewPriorityGroup;
  divisions: ReviewDivision[];
  /** Triaged messages that no division was given. */
  unassigned: number;
  rework: ReviewRework;
  /** How long after an event it was entered; null when there are no messages. */
  reportingLag: KpiDuration | null;
  load: ReviewLoad;
}

export interface Incident {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
  closedAt: Date | null;
  canWrite: boolean;
  canManage: boolean;
  canDelete: boolean;
  canManageAccess: boolean;
  accessMode: "OPEN_OPERATIONAL" | "RESTRICTED";
  location: Location;
  divisions: Division[];
  childIncidents: Incident[];
  layers: Layer[];
}
