import { describe, expect, it } from "vitest";
import { toIncidentDetails, toIncidentSummary } from "./mapper";
import type { FetchIncidentsQuery, GetIncidentDetailQuery } from "gql/next";

const WIRE_SUMMARY: FetchIncidentsQuery["incidents"][0] = {
  id: "inc-1",
  name: "Forest Fire Alpha",
  createdAt: "2024-03-15T08:00:00Z",
  updatedAt: "2024-03-15T09:00:00Z",
  closedAt: null,
  isClosed: false,
  location: { name: "Sector 7", coordinates: null },
};

const WIRE_DETAILS: NonNullable<GetIncidentDetailQuery["incident"]> = {
  id: "inc-1",
  name: "Forest Fire Alpha",
  createdAt: "2024-03-15T08:00:00Z",
  updatedAt: "2024-03-15T09:00:00Z",
  closedAt: null,
  isClosed: false,
  location: { name: "Sector 7", coordinates: null },
  divisions: [{ id: "div-1", name: "Alpha", description: "Alpha division" }],
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

  it("initialises divisions, journals and layers as empty arrays", () => {
    const result = toIncidentSummary(WIRE_SUMMARY);
    expect(result.divisions).toEqual([]);
    expect(result.journals).toEqual([]);
    expect(result.layers).toEqual([]);
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
    });
  });

  it("returns empty journals array (journals removed from new schema)", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.journals).toEqual([]);
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
