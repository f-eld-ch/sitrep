import { describe, expect, it } from "vitest";
import { toIncidentDetails, toIncidentReview, toIncidentSummary } from "./mapper";
import type { FetchIncidentsQuery, GetIncidentDetailQuery, GetIncidentReviewQuery } from "gql/next";

const WIRE_SUMMARY: FetchIncidentsQuery["incidents"][0] = {
  id: "inc-1",
  parentId: null,
  name: "Forest Fire Alpha",
  createdAt: "2024-03-15T08:00:00Z",
  updatedAt: "2024-03-15T09:00:00Z",
  closedAt: null,
  isClosed: false,
  canWrite: true,
  canManage: true,
  canDelete: true,
  accessMode: "OPEN_OPERATIONAL" as const,
  location: { name: "Sector 7", coordinates: null },
};

const WIRE_DETAILS: NonNullable<GetIncidentDetailQuery["incident"]> = {
  id: "inc-1",
  parentId: null,
  name: "Forest Fire Alpha",
  createdAt: "2024-03-15T08:00:00Z",
  updatedAt: "2024-03-15T09:00:00Z",
  closedAt: null,
  isClosed: false,
  canManage: true,
  canDelete: true,
  canManageAccess: true,
  location: { name: "Sector 7", coordinates: null },
  divisions: [{ id: "div-1", name: "Alpha", description: "Alpha division", kind: "STANDARD" }],
};

describe("toIncidentSummary", () => {
  it("parses createdAt to a Date instance", () => {
    const result = toIncidentSummary(WIRE_SUMMARY);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe("2024-03-15T08:00:00.000Z");
  });

  it("maps null optional dates to null", () => {
    const result = toIncidentSummary(WIRE_SUMMARY);
    expect(result.deletedAt).toBeNull();
    expect(result.closedAt).toBeNull();
  });

  it("parses closedAt when present", () => {
    const result = toIncidentSummary({ ...WIRE_SUMMARY, closedAt: "2024-03-16T10:00:00Z" });
    expect(result.closedAt).toBeInstanceOf(Date);
  });

  it("maps location without id (new schema has no location id)", () => {
    const result = toIncidentSummary(WIRE_SUMMARY);
    expect(result.location.id).toBe("");
    expect(result.location.name).toBe("Sector 7");
  });

  it("initialises divisions and layers as empty arrays", () => {
    const result = toIncidentSummary(WIRE_SUMMARY);
    expect(result.divisions).toEqual([]);
    expect(result.childIncidents).toEqual([]);
    expect(result.layers).toEqual([]);
  });

  it("maps parent id", () => {
    const result = toIncidentSummary({ ...WIRE_SUMMARY, parentId: "parent-1" });
    expect(result.parentId).toBe("parent-1");
  });

  it("does not include __typename in the result", () => {
    const wireWithTypename = { ...WIRE_SUMMARY, __typename: "Incidents" as const };
    const result = toIncidentSummary(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
  });
});

describe("toIncidentDetails", () => {
  it("parses date strings to Date instances", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("maps location (no id in new schema)", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.location.id).toBe("");
    expect(result.location.name).toBe("Sector 7");
  });

  it("maps divisions array", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.divisions).toHaveLength(1);
    expect(result.divisions[0]).toEqual({
      id: "div-1",
      name: "Alpha",
      description: "Alpha division",
      kind: "STANDARD",
    });
  });

  it("maps detail parent id", () => {
    const result = toIncidentDetails({ ...WIRE_DETAILS, parentId: "parent-1" });
    expect(result.parentId).toBe("parent-1");
  });

  it("sets deletedAt to null (not in new schema)", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.deletedAt).toBeNull();
  });

  it("does not include __typename in the result", () => {
    const wireWithTypename = { ...WIRE_DETAILS, __typename: "Incident" as const };
    const result = toIncidentDetails(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
  });
});

describe("toIncidentReview", () => {
  type Wire = NonNullable<NonNullable<GetIncidentReviewQuery["incident"]>["review"]>;

  const duration = { count: 8, medianSeconds: 60, p90Seconds: 120, maxSeconds: 300 };
  const distribution = [
    { fromSeconds: 0, toSeconds: 30, count: 3 },
    { fromSeconds: 7200, toSeconds: null, count: 5 },
  ];
  const metric = { total: 10, completed: 8, ratio: 0.8, duration, distribution };
  const wire: Wire = {
    openedAt: "2026-01-15T10:00:00Z",
    closedAt: null,
    messageCount: 10,
    triage: metric,
    draw: { total: 0, completed: 0, ratio: null, duration: null, distribution: [] },
    triageHigh: { count: 2, duration },
    triageNormal: { count: 6, duration: null },
    divisions: [
      {
        id: "d1",
        name: "FW",
        description: "Feuerwehr Altdorf",
        kind: "STANDARD",
        assigned: 5,
        acknowledged: 4,
        duration,
      },
    ],
    unassigned: 1,
    rework: { total: 10, moreInfo: 1, reset: 0, correctedAfterTriage: 2, reworked: 3 },
    reportingLag: duration,
    load: {
      bucketSeconds: 900,
      peakEntered: 4,
      peakEnteredAt: "2026-01-15T10:15:00Z",
      peakBacklog: 0,
      peakBacklogAt: null,
      buckets: [{ start: "2026-01-15T10:00:00Z", entered: 4, backlog: 1 }],
    },
  };

  it("is null when there is none", () => {
    expect(toIncidentReview(null)).toBeNull();
    expect(toIncidentReview(undefined)).toBeNull();
  });

  it("maps durations to seconds and times to dates, keeping what is missing as null", () => {
    const review = toIncidentReview(wire);

    expect(review?.openedAt).toEqual(new Date("2026-01-15T10:00:00Z"));
    expect(review?.closedAt).toBeNull();
    expect(review?.triage).toEqual({
      total: 10,
      completed: 8,
      ratio: 0.8,
      duration: { count: 8, median: 60, p90: 120, max: 300 },
      distribution: [
        { from: 0, to: 30, count: 3 },
        { from: 7200, to: null, count: 5 },
      ],
    });
    expect(review?.draw).toEqual({
      total: 0,
      completed: 0,
      ratio: null,
      duration: null,
      distribution: [],
    });
    expect(review?.triageNormal.duration).toBeNull();
    expect(review?.divisions[0]).toMatchObject({
      name: "FW",
      description: "Feuerwehr Altdorf",
      assigned: 5,
      acknowledged: 4,
    });
    expect(review?.rework.reworked).toBe(3);
    expect(review?.reportingLag?.max).toBe(300);
    expect(review?.load.buckets[0].start).toEqual(new Date("2026-01-15T10:00:00Z"));
    expect(review?.load.peakEnteredAt).toEqual(new Date("2026-01-15T10:15:00Z"));
    expect(review?.load.peakBacklogAt).toBeNull();
  });
});
