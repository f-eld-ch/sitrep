import { describe, expect, it } from "vitest";
import { formatTimeLabel } from "./timeLabel";

describe("formatTimeLabel", () => {
  const reference = new Date(2026, 9, 10, 18, 0);

  it("shows only the clock time on the same day", () => {
    expect(formatTimeLabel(new Date(2026, 9, 10, 8, 15), reference)).toBe("08:15");
  });

  it("adds the date on another day", () => {
    expect(formatTimeLabel(new Date(2026, 9, 9, 23, 59), reference)).toBe("09.10.2026 23:59");
    expect(formatTimeLabel(new Date(2026, 9, 11, 0, 5), reference)).toBe("11.10.2026 00:05");
  });
});
