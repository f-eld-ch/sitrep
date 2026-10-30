import { describe, expect, it } from "vitest";
import { bucketLabel, chartTime, percent, rangeLabel, spansDays } from "./format";

describe("percent", () => {
  it.each([
    [0.87, 87],
    [0.874, 87],
    [0, 0],
    [1, 100],
    [0.996, 99],
  ])("shows %d as %d %%", (ratio, expected) => {
    expect(percent(ratio)).toBe(expected);
  });
});

describe("bucketLabel", () => {
  const t = (key: string, { count }: { count: number }) => `${key}:${count}`;

  it("says minutes below an hour and hours from there on", () => {
    expect(bucketLabel(900, t)).toBe("review.bucketMinutes:15");
    expect(bucketLabel(3600, t)).toBe("review.bucketHours:1");
    expect(bucketLabel(7200, t)).toBe("review.bucketHours:2");
  });
});

describe("chartTime", () => {
  const time = new Date(2026, 0, 15, 9, 5);

  it("shows the clock time within a day, the date as well across days", () => {
    expect(chartTime(time, 900, false)).toBe("09:05");
    expect(chartTime(time, 900, true)).toBe("15.01. 09:05");
  });

  it("shows only the date for buckets of a day", () => {
    expect(chartTime(time, 86400, true)).toBe("15.01.");
  });
});

describe("spansDays", () => {
  it("is true only when the buckets reach into another day", () => {
    expect(spansDays([new Date(2026, 0, 15, 9), new Date(2026, 0, 15, 20)])).toBe(false);
    expect(spansDays([new Date(2026, 0, 15, 20), new Date(2026, 0, 16, 2)])).toBe(true);
    expect(spansDays([new Date(2026, 0, 15, 9)])).toBe(false);
  });
});

describe("rangeLabel", () => {
  it.each([
    [0, 30, "< 30 s"],
    [30, 60, "30 s–1 min"],
    [60, 120, "1–2 min"],
    [120, 300, "2–5 min"],
    [300, 600, "5–10 min"],
    [600, 1800, "10–30 min"],
    [1800, 3600, "30 min–1 h"],
    [3600, 7200, "1–2 h"],
    [7200, null, "> 2 h"],
  ])("labels %d to %s seconds as %s", (from, to, expected) => {
    expect(rangeLabel(from, to)).toBe(expected);
  });
});
