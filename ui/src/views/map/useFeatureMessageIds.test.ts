import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeatureMessageIds } from "./useFeatureMessageIds";

const useFeatureMessages = vi.hoisted(() => vi.fn());

vi.mock("api", () => ({ useFeatureMessages }));

const ready = (ids: string[]) => ({
  status: "ready",
  data: { messages: ids.map((id) => ({ id })) },
});

describe("useFeatureMessageIds", () => {
  beforeEach(() => useFeatureMessages.mockReset());

  it("returns the ids of the feature's messages", () => {
    useFeatureMessages.mockReturnValue(ready(["m1", "m2"]));
    const { result } = renderHook(() => useFeatureMessageIds("f1"));
    expect(result.current).toEqual(["m1", "m2"]);
  });

  it("leaves the stack alone for a feature without messages", () => {
    useFeatureMessages.mockReturnValue(ready([]));
    const { result } = renderHook(() => useFeatureMessageIds("f1"));
    expect(result.current).toBeUndefined();
  });

  it("leaves the stack alone while loading or when nothing is selected", () => {
    useFeatureMessages.mockReturnValue({ status: "loading", data: undefined });
    expect(renderHook(() => useFeatureMessageIds("f1")).result.current).toBeUndefined();

    useFeatureMessages.mockReturnValue(ready(["m1"]));
    expect(renderHook(() => useFeatureMessageIds(undefined)).result.current).toBeUndefined();
  });
});
