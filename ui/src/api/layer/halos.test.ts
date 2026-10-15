import { describe, expect, it } from "vitest";
import { messageFeatureHalos, withLocalRemovals, type HistoryChange } from "./halos";

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

    expect(halos.get("a")).toEqual({ kind: "added", geometry: point(1) });
    expect(halos.get("b")).toEqual({ kind: "modified", geometry: point(2) });
    expect(halos.get("c")).toEqual({
      kind: "removed",
      geometry: point(4),
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

  it("treats a removal the same message undid as no change", () => {
    const halos = messageFeatureHalos(
      [
        c("a", "PLACED", 0, "m1", point(1)),
        c("a", "REMOVED", 10, "m2"),
        c("a", "RESTORED", 10, "m2", point(1)),
      ],
      "m2",
    );

    expect(halos.size).toBe(0);
  });

  it("calls a feature a later message brought back added, and a removed-again one removed", () => {
    const history = [
      c("a", "PLACED", 0, "m1", point(1)),
      c("a", "REMOVED", 5, "m2"),
      c("a", "RESTORED", 10, "m3", point(1)),
      c("b", "PLACED", 0, "m1", point(2)),
      c("b", "REMOVED", 5, "m2"),
      c("b", "RESTORED", 10, "m3", point(2)),
      c("b", "REMOVED", 10, "m3"),
    ];

    expect(messageFeatureHalos(history, "m3").get("a")?.kind).toBe("added");
    expect(messageFeatureHalos(history, "m3").get("b")?.kind).toBe("removed");
  });
});

describe("withLocalRemovals", () => {
  const removal = (id: string, messageId = "m") => ({
    id,
    messageId,
    geometry: point(1),
    properties: { icon: "x" },
  });

  it("shows a feature just deleted for the message as a ghost", () => {
    const out = withLocalRemovals(new Map(), [removal("a")], "m", new Set());

    expect(out.get("a")).toEqual({
      kind: "removed",
      lastGeometry: point(1),
      lastProperties: { icon: "x" },
    });
  });

  it("leaves the history in charge of what it already knows", () => {
    const known = new Map([["a", { kind: "removed" as const, lastGeometry: point(9) }]]);
    const out = withLocalRemovals(known, [removal("a")], "m", new Set());

    expect(out.get("a")?.lastGeometry).toEqual(point(9));
  });

  it("ignores deletions for another message", () => {
    expect(withLocalRemovals(new Map(), [removal("a", "other")], "m", new Set()).size).toBe(0);
  });

  it("shows nothing for a feature the message placed itself", () => {
    expect(withLocalRemovals(new Map(), [removal("a")], "m", new Set(["a"])).size).toBe(0);
  });

  it("does not change the halos it is given", () => {
    const halos = new Map<string, { kind: "added" }>([["b", { kind: "added" }]]);
    const out = withLocalRemovals(halos, [removal("a")], "m", new Set());

    expect(halos.size).toBe(1);
    expect(out.size).toBe(2);
  });
});
