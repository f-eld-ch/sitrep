import { Medium, PriorityStatus, TriageStatus } from "types";
import { describe, expect, it } from "vitest";
import { toDivision, toMessage } from "./mapper";
import type { GetIncidentMessagesQuery } from "gql/next";

type WireMessage = NonNullable<GetIncidentMessagesQuery["incident"]>["messages"][0];
type WireDivision = WireMessage["divisions"][0];

const WIRE_DIVISION: WireDivision = {
  id: "div-1",
  name: "Alpha",
  description: "Alpha division",
};

const WIRE_MESSAGE: WireMessage = {
  id: "msg-1",
  number: 1,
  content: "Test content",
  sender: "Station Alpha",
  senderDetail: "Rm 4",
  receiver: "HQ",
  receiverDetail: "",
  medium: "RADIO",
  time: "2024-03-15T09:00:00Z",
  createdAt: "2024-03-15T09:00:00Z",
  updatedAt: "2024-03-15T09:05:00Z",
  triage: "PENDING",
  priority: "NORMAL",
  divisions: [WIRE_DIVISION],
};

describe("toDivision", () => {
  it("maps id, name, and description", () => {
    const result = toDivision(WIRE_DIVISION);
    expect(result).toEqual({ id: "div-1", name: "Alpha", description: "Alpha division" });
  });

  it("does not include __typename or extra fields", () => {
    const wireWithExtra = { ...WIRE_DIVISION, __typename: "Division" as const, extra: "noise" };
    const result = toDivision(wireWithExtra);
    expect(Object.keys(result)).toEqual(["id", "name", "description"]);
  });
});

describe("toMessage", () => {
  it("parses date strings to Date instances", () => {
    const result = toMessage(WIRE_MESSAGE);
    expect(result.time).toBeInstanceOf(Date);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("sets deletedAt to epoch (not in new schema; server hides deleted messages)", () => {
    const result = toMessage(WIRE_MESSAGE);
    // Message.deletedAt is typed Date in the domain type; use epoch as a sentinel.
    expect(result.deletedAt).toEqual(new Date(0));
  });

  it("wraps flat divisions into the DivisionList envelope the views expect", () => {
    const result = toMessage(WIRE_MESSAGE);
    expect(result.divisions).toHaveLength(1);
    expect(result.divisions[0]).toEqual({
      division: { id: "div-1", name: "Alpha", description: "Alpha division" },
    });
  });

  it("falls back to Medium.Radio for unknown medium", () => {
    const result = toMessage({
      ...WIRE_MESSAGE,
      medium: "CARRIER_PIGEON" as WireMessage["medium"],
    });
    expect(result.medium).toBe(Medium.Radio);
  });

  it("maps triage field to triageId on the domain type", () => {
    const result = toMessage({ ...WIRE_MESSAGE, triage: "PENDING" });
    expect(result.triageId).toBe(TriageStatus.Pending);
  });

  it("falls back to TriageStatus.Pending for unknown triage", () => {
    const result = toMessage({
      ...WIRE_MESSAGE,
      triage: "UNKNOWN_STATUS" as WireMessage["triage"],
    });
    expect(result.triageId).toBe(TriageStatus.Pending);
  });

  it("maps priority field to priorityId on the domain type", () => {
    const result = toMessage({ ...WIRE_MESSAGE, priority: "NORMAL" });
    expect(result.priorityId).toBe(PriorityStatus.Normal);
  });

  it("falls back to PriorityStatus.Normal for unknown priority", () => {
    const result = toMessage({
      ...WIRE_MESSAGE,
      priority: "TOP_SECRET" as WireMessage["priority"],
    });
    expect(result.priorityId).toBe(PriorityStatus.Normal);
  });

  it("preserves known enum values", () => {
    const result = toMessage({
      ...WIRE_MESSAGE,
      medium: "EMAIL",
      triage: "DONE",
      priority: "HIGH",
    });
    expect(result.medium).toBe(Medium.Email);
    expect(result.triageId).toBe(TriageStatus.Triaged);
    expect(result.priorityId).toBe(PriorityStatus.High);
  });

  it("exposes the server-assigned message number", () => {
    const result = toMessage(WIRE_MESSAGE);
    expect(result.number).toBe(1);
  });

  it("does not include __typename in the result", () => {
    const wireWithTypename = { ...WIRE_MESSAGE, __typename: "Message" as const };
    const result = toMessage(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
  });
});
