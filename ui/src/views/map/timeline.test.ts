import { describe, expect, it } from "vitest";
import { neighbourTick, thinTicks, timelineBounds, timelinePercent } from "./timeline";

describe("timelineBounds", () => {
  it("spans from the earliest candidate to now", () => {
    expect(timelineBounds([300, 100, 200], 1000)).toEqual({ min: 100, max: 1000 });
  });

  it("ignores candidates in the future and non-finite values", () => {
    expect(timelineBounds([2000, Number.NaN, 400], 1000)).toEqual({ min: 400, max: 1000 });
  });

  it("collapses to now without candidates", () => {
    expect(timelineBounds([], 1000)).toEqual({ min: 1000, max: 1000 });
  });
});

describe("timelinePercent", () => {
  const bounds = { min: 0, max: 200 };

  it("maps linearly and clamps", () => {
    expect(timelinePercent(50, bounds)).toBe(25);
    expect(timelinePercent(-10, bounds)).toBe(0);
    expect(timelinePercent(500, bounds)).toBe(100);
  });

  it("is 100 for an empty range", () => {
    expect(timelinePercent(5, { min: 5, max: 5 })).toBe(100);
  });
});

describe("neighbourTick", () => {
  const ticks = [30, 10, 20, 20];

  it("walks forward and backward without returning the current time", () => {
    expect(neighbourTick(ticks, 10, 1)).toBe(20);
    expect(neighbourTick(ticks, 20, 1)).toBe(30);
    expect(neighbourTick(ticks, 20, -1)).toBe(10);
  });

  it("works from a time between ticks", () => {
    expect(neighbourTick(ticks, 25, 1)).toBe(30);
    expect(neighbourTick(ticks, 25, -1)).toBe(20);
  });

  it("is undefined at the ends", () => {
    expect(neighbourTick(ticks, 30, 1)).toBeUndefined();
    expect(neighbourTick(ticks, 10, -1)).toBeUndefined();
    expect(neighbourTick([], 10, 1)).toBeUndefined();
  });
});

describe("thinTicks", () => {
  it("keeps ticks that are far enough apart and the first of a cluster", () => {
    const bounds = { min: 0, max: 1000 };
    expect(thinTicks([0, 5, 8, 500, 503, 1000], bounds, 2)).toEqual([0, 500, 1000]);
  });
});
