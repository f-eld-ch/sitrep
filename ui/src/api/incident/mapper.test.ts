import { describe, expect, it } from "vitest";
import { toIncidentDetails, toIncidentSummary } from "./mapper";
import type { WireIncidentDetails, WireIncidentSummary } from "./wire";

const WIRE_SUMMARY: WireIncidentSummary = {
  id: "inc-1",
  name: "Forest Fire Alpha",
  createdAt: "2024-03-15T08:00:00Z",
  updatedAt: null,
  deletedAt: null,
  closedAt: null,
  location: { name: "Sector 7", coordinates: "47.1,8.5" },
};

const WIRE_DETAILS: WireIncidentDetails = {
  id: "inc-1",
  name: "Forest Fire Alpha",
  createdAt: "2024-03-15T08:00:00Z",
  updatedAt: "2024-03-15T09:00:00Z",
  closedAt: null,
  location: { id: "loc-1", name: "Sector 7", coordinates: "47.1,8.5" },
  divisions: [{ id: "div-1", name: "Alpha", description: "Alpha division" }],
  journals: [{ id: "j-1", name: "Journal 1" }],
};

describe("toIncidentSummary", () => {
  it("parses createdAt to a Date instance", () => {
    const result = toIncidentSummary(WIRE_SUMMARY);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe("2024-03-15T08:00:00.000Z");
  });

  it("maps null optional dates to null", () => {
    const result = toIncidentSummary(WIRE_SUMMARY);
    expect(result.updatedAt).toBeNull();
    expect(result.deletedAt).toBeNull();
    expect(result.closedAt).toBeNull();
  });

  it("parses closedAt when present", () => {
    const result = toIncidentSummary({ ...WIRE_SUMMARY, closedAt: "2024-03-16T10:00:00Z" });
    expect(result.closedAt).toBeInstanceOf(Date);
  });

  it("maps location without id (summary has no location id)", () => {
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
    const wireWithTypename = { ...WIRE_SUMMARY, __typename: "Incidents" };
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

  it("preserves location id", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.location.id).toBe("loc-1");
  });

  it("maps divisions array", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.divisions).toHaveLength(1);
    expect(result.divisions[0]).toEqual({ id: "div-1", name: "Alpha", description: "Alpha division" });
  });

  it("maps journals to id+name stubs (other fields not fetched)", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.journals).toHaveLength(1);
    expect(result.journals[0].id).toBe("j-1");
    expect(result.journals[0].name).toBe("Journal 1");
  });

  it("sets deletedAt to null (not fetched in details query)", () => {
    const result = toIncidentDetails(WIRE_DETAILS);
    expect(result.deletedAt).toBeNull();
  });

  it("does not include __typename in the result", () => {
    const wireWithTypename = { ...WIRE_DETAILS, __typename: "Incidents" };
    const result = toIncidentDetails(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
  });
});
