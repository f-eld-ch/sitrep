import { describe, expect, it } from "vitest";
import { messageFeatureHalos, type HistoryChange } from "./halos";

const point = (x: number) => ({ type: "Point" as const, coordinates: [x, 0] });
const c = (
  featureId: string,
  change: HistoryChange["change"],
  minute: number,
  messageId: string | null,
  geometry?: HistoryChange["geometry"],
): HistoryChange => ({
  featureId,
  change,
  effectiveAt: new Date(2026, 0, 1, 12, minute),
  recordedAt: new Date(2026, 0, 1, 13, minute),
  messageId,
  geometry,
});

describe("messageFeatureHalos", () => {
  it("tells added, modified and removed apart", () => {
    const halos = messageFeatureHalos(
      [
        c("a", "PLACED", 10, "m2", point(1)),
        c("b", "PLACED", 0, "m1", point(2)),
        c("b", "RESTYLED", 10, "m2"),
        c("c", "PLACED", 0, "m1", point(3)),
        c("c", "MOVED", 5, "m1", point(4)),
        c("c", "REMOVED", 10, "m2"),
        c("d", "PLACED", 0, "m1", point(5)),
      ],
      "m2",
    );

    expect(halos.get("a")).toEqual({ kind: "added" });
    expect(halos.get("b")).toEqual({ kind: "modified" });
    expect(halos.get("c")).toEqual({
      kind: "removed",
      lastGeometry: point(4),
      lastProperties: undefined,
    });
    expect(halos.has("d")).toBe(false);
  });

  it("calls a feature placed and modified by the same message added", () => {
    const halos = messageFeatureHalos(
      [c("a", "PLACED", 10, "m", point(1)), c("a", "MOVED", 10, "m", point(2))],
      "m",
    );

    expect(halos.get("a")?.kind).toBe("added");
  });

  it("leaves out a feature the message both placed and removed", () => {
    const halos = messageFeatureHalos(
      [c("a", "PLACED", 10, "m", point(1)), c("a", "REMOVED", 10, "m")],
      "m",
    );

    expect(halos.size).toBe(0);
  });
});
