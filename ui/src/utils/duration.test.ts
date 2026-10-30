import { describe, expect, it } from "vitest";
import { formatDuration } from "./duration";

describe("formatDuration", () => {
  it.each([
    [0, "0 s"],
    [45, "45 s"],
    [60, "1 min"],
    [252, "4 min 12 s"],
    [3600, "1 h"],
    [3900, "1 h 5 min"],
    [7384, "2 h 3 min"],
  ])("formats %d seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("rounds to whole seconds", () => {
    expect(formatDuration(59.6)).toBe("1 min");
    expect(formatDuration(0.4)).toBe("0 s");
  });

  it("never shows a negative time", () => {
    expect(formatDuration(-5)).toBe("0 s");
  });
});
