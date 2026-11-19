import dayjs from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDate } from "./useDate";

dayjs.extend(LocalizedFormat); // App.tsx does this at startup

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" } }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 2, 3, 4, 5));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDate", () => {
  it("returns the current time, formatted for the language", () => {
    const { result } = renderHook(() => useDate());
    expect(result.current.now).toEqual(new Date(2026, 0, 2, 3, 4, 5));
    expect(result.current.date).toBe("January 2, 2026");
    expect(result.current.time).toBe("3:04 AM");
  });

  it("ticks every second", () => {
    const { result } = renderHook(() => useDate());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.now).toEqual(new Date(2026, 0, 2, 3, 4, 6));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.time).toBe("3:05 AM");
  });

  it("stops ticking on unmount", () => {
    const { unmount } = renderHook(() => useDate());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
