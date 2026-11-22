import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_RECENT_ICONS, useRecentIcons } from "./useRecentIcons";

const KEY = "sitrep.recentIcons";

describe("useRecentIcons", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts empty", () => {
    const { result } = renderHook(() => useRecentIcons());

    expect(result.current.recent).toEqual([]);
  });

  it("puts the latest symbol first and moves a repeated one to the front", () => {
    const { result } = renderHook(() => useRecentIcons());

    act(() => result.current.remember("4103"));
    act(() => result.current.remember("7114"));
    act(() => result.current.remember("4103"));

    expect(result.current.recent).toEqual(["4103", "7114"]);
  });

  it("keeps the last few only", () => {
    const { result } = renderHook(() => useRecentIcons());
    const ids = [
      "4101",
      "4102",
      "4103",
      "4104",
      "4105",
      "4106",
      "4107",
      "4108",
      "4201",
      "4202",
    ] as const;

    for (const id of ids) act(() => result.current.remember(id));

    expect(result.current.recent).toHaveLength(MAX_RECENT_ICONS);
    expect(result.current.recent[0]).toBe("4202");
  });

  it("is shared through the browser storage", () => {
    const first = renderHook(() => useRecentIcons());
    act(() => first.result.current.remember("7114"));

    const second = renderHook(() => useRecentIcons());

    expect(second.result.current.recent).toEqual(["7114"]);
  });

  it("ignores stored values that are not symbols the picker offers", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(["4103", "nonsense", 42, null, "1113", "7114"]),
    );

    const { result } = renderHook(() => useRecentIcons());

    // 1113 is a line symbol: it has its own control and is never placed as a point.
    expect(result.current.recent).toEqual(["4103", "7114"]);
  });

  it("survives a stored value of the wrong shape", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ oops: true }));

    const { result } = renderHook(() => useRecentIcons());
    expect(result.current.recent).toEqual([]);

    act(() => result.current.remember("4103"));
    expect(result.current.recent).toEqual(["4103"]);
  });
});
