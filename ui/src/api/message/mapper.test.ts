import { Medium, PriorityStatus, TriageStatus } from "types";
import { describe, expect, it } from "vitest";
import { toDivision, toMessage } from "./mapper";
import type { GetMessagesQuery } from "gql";

type WireMessage = GetMessagesQuery["messages"][0];
type WireDivision = WireMessage["divisions"][0]["division"];

const WIRE_DIVISION: WireDivision = {
  id: "div-1",
  name: "Alpha",
  description: "Alpha division",
};

const WIRE_MESSAGE: WireMessage = {
  id: "msg-1",
  content: "Test content",
  sender: "Station Alpha",
  senderDetail: "Rm 4",
  receiver: "HQ",
  receiverDetail: "",
  medium: "RADIO",
  time: "2024-03-15T09:00:00Z",
  createdAt: "2024-03-15T09:00:00Z",
  updatedAt: "2024-03-15T09:05:00Z",
  deletedAt: null,
  divisions: [{ division: WIRE_DIVISION }],
  triageId: "PENDING",
  priorityId: "NORMAL",
};

describe("toDivision", () => {
  it("maps id, name, and description", () => {
    const result = toDivision(WIRE_DIVISION);
    expect(result).toEqual({ id: "div-1", name: "Alpha", description: "Alpha division" });
  });

  it("does not include __typename or extra fields", () => {
    const wireWithExtra = { ...WIRE_DIVISION, __typename: "Division", extra: "noise" };
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

  it("maps a null deletedAt to the epoch", () => {
    const result = toMessage({ ...WIRE_MESSAGE, deletedAt: null });
    // Message.deletedAt is typed Date, not Date | null, so an absent value cannot be
    // represented directly and is collapsed to the epoch as a not-deleted sentinel.
    expect(result.deletedAt).toEqual(new Date(0));
  });

  it("parses deletedAt when present", () => {
    const result = toMessage({ ...WIRE_MESSAGE, deletedAt: "2024-03-16T00:00:00Z" });
    expect(result.deletedAt).toBeInstanceOf(Date);
    expect(result.deletedAt).not.toEqual(new Date(0));
  });

  it("unwraps the message_division join-table envelope", () => {
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

  it("falls back to TriageStatus.Pending for unknown triageId", () => {
    const result = toMessage({
      ...WIRE_MESSAGE,
      triageId: "UNKNOWN_STATUS" as WireMessage["triageId"],
    });
    expect(result.triageId).toBe(TriageStatus.Pending);
  });

  it("falls back to PriorityStatus.Normal for unknown priorityId", () => {
    const result = toMessage({
      ...WIRE_MESSAGE,
      priorityId: "TOP_SECRET" as WireMessage["priorityId"],
    });
    expect(result.priorityId).toBe(PriorityStatus.Normal);
  });

  it("preserves known enum values", () => {
    const result = toMessage({
      ...WIRE_MESSAGE,
      medium: "EMAIL",
      triageId: "DONE",
      priorityId: "HIGH",
    });
    expect(result.medium).toBe(Medium.Email);
    expect(result.triageId).toBe(TriageStatus.Triaged);
    expect(result.priorityId).toBe(PriorityStatus.High);
  });

  it("sets number to undefined (view-computed from list position)", () => {
    const result = toMessage(WIRE_MESSAGE);
    expect(result.number).toBeUndefined();
  });

  it("does not include __typename in the result", () => {
    const wireWithTypename = { ...WIRE_MESSAGE, __typename: "Messages" };
    const result = toMessage(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
  });
});
