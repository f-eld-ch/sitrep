import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAutoSelectedMessage } from "./useAutoSelectedMessage";

describe("useAutoSelectedMessage", () => {
  it("selects the default candidate", () => {
    const { result } = renderHook(({ id }) => useAutoSelectedMessage(id), {
      initialProps: { id: "a" as string | undefined },
    });
    expect(result.current.effectiveId).toBe("a");
    expect(result.current.isExplicit).toBe(false);
  });

  it("keeps the locked message when polling delivers an older candidate", () => {
    const { result, rerender } = renderHook(({ id }) => useAutoSelectedMessage(id), {
      initialProps: { id: "newer" as string | undefined },
    });
    rerender({ id: "older" });
    expect(result.current.effectiveId).toBe("newer");
  });

  it("an explicit choice wins and clearing it falls back to a fresh default", () => {
    const { result, rerender } = renderHook(({ id }) => useAutoSelectedMessage(id), {
      initialProps: { id: "a" as string | undefined },
    });

    act(() => result.current.select("picked"));
    expect(result.current.effectiveId).toBe("picked");
    expect(result.current.isExplicit).toBe(true);

    rerender({ id: "b" });
    act(() => result.current.select(undefined));
    expect(result.current.effectiveId).toBe("b");
  });

  it("moves on to the next candidate once a message is handled", () => {
    const { result, rerender } = renderHook(({ id }) => useAutoSelectedMessage(id), {
      initialProps: { id: "a" as string | undefined },
    });

    act(() => result.current.handled("a"));
    // The cache still reports "a" as the candidate: it must not be re-selected.
    expect(result.current.effectiveId).toBeUndefined();

    rerender({ id: "b" });
    expect(result.current.effectiveId).toBe("b");
  });

  it("has nothing selected when there is no candidate", () => {
    const { result } = renderHook(() => useAutoSelectedMessage(undefined));
    expect(result.current.effectiveId).toBeUndefined();
  });
});
