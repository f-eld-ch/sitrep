import { describe, expect, it } from "vitest";
import { toJournal } from "./mapper";
import type { WireJournal } from "./wire";

const WIRE_JOURNAL: WireJournal = {
  id: "j-1",
  name: "Alpha Log",
  createdAt: "2024-03-15T08:00:00Z",
  updatedAt: "2024-03-15T09:00:00Z",
  closedAt: null,
  deletedAt: null,
};

describe("toJournal", () => {
  it("parses createdAt and updatedAt to Date instances", () => {
    const result = toJournal(WIRE_JOURNAL);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe("2024-03-15T08:00:00.000Z");
  });

  it("maps null closedAt to null (open journal)", () => {
    const result = toJournal(WIRE_JOURNAL);
    // The domain type lies and says Date, but the cast preserves null at runtime.
    expect(result.closedAt).toBeNull();
  });

  it("parses closedAt when present", () => {
    const result = toJournal({ ...WIRE_JOURNAL, closedAt: "2024-03-16T12:00:00Z" });
    expect(result.closedAt).toBeInstanceOf(Date);
  });

  it("maps null deletedAt to null (not deleted)", () => {
    const result = toJournal(WIRE_JOURNAL);
    expect(result.deletedAt).toBeNull();
  });

  it("maps id and name", () => {
    const result = toJournal(WIRE_JOURNAL);
    expect(result.id).toBe("j-1");
    expect(result.name).toBe("Alpha Log");
  });

  it("does not include __typename in the result", () => {
    const wireWithTypename = { ...WIRE_JOURNAL, __typename: "Journals" };
    const result = toJournal(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
  });
});
