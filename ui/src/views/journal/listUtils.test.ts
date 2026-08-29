import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import { describe, expect, it } from "vitest";
import { buildMessageList, stableOrderByCreatedAt } from "./listUtils";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    number: undefined,
    content: "hello",
    sender: "Alice",
    senderDetail: "",
    receiver: "Bob",
    receiverDetail: "",
    time: new Date("2024-01-01T10:00:00Z"),
    createdAt: new Date("2024-01-01T09:00:00Z"),
    updatedAt: new Date(),
    deletedAt: new Date(0),
    divisions: [],
    medium: Medium.Radio,
    triageId: TriageStatus.Pending,
    priorityId: PriorityStatus.Normal,
    ...overrides,
  };
}

const ALL_FILTERS = { triage: "all", priority: "all", assignment: "all" };

describe("stableOrderByCreatedAt", () => {
  it("orders ascending by createdAt", () => {
    const older = makeMessage({ id: "a", createdAt: new Date("2024-01-01T08:00:00Z") });
    const newer = makeMessage({ id: "b", createdAt: new Date("2024-01-01T09:00:00Z") });
    expect(stableOrderByCreatedAt(older, newer)).toBeLessThan(0);
    expect(stableOrderByCreatedAt(newer, older)).toBeGreaterThan(0);
  });

  it("breaks equal timestamps by id lexicographic order", () => {
    const ts = new Date("2024-01-01T08:00:00Z");
    const a = makeMessage({ id: "aaa", createdAt: ts });
    const b = makeMessage({ id: "bbb", createdAt: ts });
    expect(stableOrderByCreatedAt(a, b)).toBe(-1);
    expect(stableOrderByCreatedAt(b, a)).toBe(1);
  });

  it("returns 0 for equal timestamp and equal id", () => {
    const ts = new Date("2024-01-01T08:00:00Z");
    const a = makeMessage({ id: "x", createdAt: ts });
    expect(stableOrderByCreatedAt(a, a)).toBe(0);
  });

  it("returns 0 when both entries have no id", () => {
    const ts = new Date("2024-01-01T08:00:00Z");
    const a = { createdAt: ts };
    const b = { createdAt: ts };
    expect(stableOrderByCreatedAt(a, b)).toBe(0);
  });
});

describe("buildMessageList", () => {
  describe("numbering", () => {
    it("assigns sequential numbers based on createdAt order", () => {
      const first = makeMessage({ id: "a", createdAt: new Date("2024-01-01T08:00:00Z") });
      const second = makeMessage({ id: "b", createdAt: new Date("2024-01-01T09:00:00Z") });
      const result = buildMessageList([second, first], ALL_FILTERS);
      const byId = Object.fromEntries(result.map((m) => [m.id, m]));
      expect(byId["a"].number).toBe(1);
      expect(byId["b"].number).toBe(2);
    });
  });

  describe("sort order", () => {
    it("returns messages newest-first by .time regardless of createdAt order", () => {
      const early = makeMessage({
        id: "a",
        createdAt: new Date("2024-01-01T07:00:00Z"),
        time: new Date("2024-01-01T10:00:00Z"),
      });
      const late = makeMessage({
        id: "b",
        createdAt: new Date("2024-01-01T08:00:00Z"),
        time: new Date("2024-01-01T20:00:00Z"),
      });
      const result = buildMessageList([early, late], ALL_FILTERS);
      expect(result[0].id).toBe("b");
      expect(result[1].id).toBe("a");
    });
  });

  describe("triage filter", () => {
    it("'all' passes every message", () => {
      const msgs = [
        makeMessage({ id: "a", triageId: TriageStatus.Pending }),
        makeMessage({ id: "b", triageId: TriageStatus.Triaged }),
      ];
      expect(buildMessageList(msgs, { ...ALL_FILTERS, triage: "all" })).toHaveLength(2);
    });

    it("specific value keeps only matching messages", () => {
      const msgs = [
        makeMessage({ id: "a", triageId: TriageStatus.Pending }),
        makeMessage({ id: "b", triageId: TriageStatus.Triaged }),
      ];
      const result = buildMessageList(msgs, { ...ALL_FILTERS, triage: TriageStatus.Pending });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a");
    });
  });

  describe("priority filter", () => {
    it("'all' passes every message", () => {
      const msgs = [
        makeMessage({ id: "a", priorityId: PriorityStatus.Normal }),
        makeMessage({ id: "b", priorityId: PriorityStatus.High }),
      ];
      expect(buildMessageList(msgs, { ...ALL_FILTERS, priority: "all" })).toHaveLength(2);
    });

    it("specific value keeps only matching messages", () => {
      const msgs = [
        makeMessage({ id: "a", priorityId: PriorityStatus.Normal }),
        makeMessage({ id: "b", priorityId: PriorityStatus.High }),
      ];
      const result = buildMessageList(msgs, { ...ALL_FILTERS, priority: PriorityStatus.High });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("b");
    });
  });

  describe("assignment filter", () => {
    it("'all' passes every message regardless of divisions", () => {
      const msgs = [
        makeMessage({ id: "a", divisions: [] }),
        makeMessage({
          id: "b",
          divisions: [{ division: { id: "d1", name: "Alpha", description: "" } }],
        }),
      ];
      expect(buildMessageList(msgs, { ...ALL_FILTERS, assignment: "all" })).toHaveLength(2);
    });

    it("specific division name keeps messages that include it", () => {
      const msgs = [
        makeMessage({
          id: "a",
          divisions: [{ division: { id: "d1", name: "Alpha", description: "" } }],
        }),
        makeMessage({
          id: "b",
          divisions: [{ division: { id: "d2", name: "Bravo", description: "" } }],
        }),
      ];
      const result = buildMessageList(msgs, { ...ALL_FILTERS, assignment: "Alpha" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("a");
    });

    it("matches a message that has the target division among several", () => {
      const msg = makeMessage({
        id: "a",
        divisions: [
          { division: { id: "d1", name: "Alpha", description: "" } },
          { division: { id: "d2", name: "Bravo", description: "" } },
        ],
      });
      const result = buildMessageList([msg], { ...ALL_FILTERS, assignment: "Bravo" });
      expect(result).toHaveLength(1);
    });

    it("excludes messages with no divisions when filter is set", () => {
      const msg = makeMessage({ id: "a", divisions: [] });
      const result = buildMessageList([msg], { ...ALL_FILTERS, assignment: "Alpha" });
      expect(result).toHaveLength(0);
    });
  });

  describe("null createdAt", () => {
    it("excludes messages where createdAt is null", () => {
      const valid = makeMessage({ id: "a", createdAt: new Date("2024-01-01T08:00:00Z") });
      const nullCreatedAt = makeMessage({ id: "b", createdAt: null as unknown as Date });
      const result = buildMessageList([valid, nullCreatedAt], ALL_FILTERS);
      expect(result.map((m) => m.id)).toEqual(["a"]);
    });
  });
});
