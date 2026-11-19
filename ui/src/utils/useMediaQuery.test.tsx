import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

type Listener = () => void;

const originalMatchMedia = window.matchMedia;

/** A controllable stand-in for a MediaQueryList. */
function stubMatchMedia(initial: boolean, { legacy }: { legacy: boolean }) {
  const state = { matches: initial };
  const listeners = new Set<Listener>();
  const add = vi.fn((...args: unknown[]) => listeners.add(args[args.length - 1] as Listener));
  const remove = vi.fn((...args: unknown[]) => listeners.delete(args[args.length - 1] as Listener));
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() {
      return state.matches;
    },
    ...(legacy
      ? { addListener: add, removeListener: remove }
      : { addEventListener: add, removeEventListener: remove }),
  }));
  Object.defineProperty(window, "matchMedia", { value: matchMedia, configurable: true });
  return {
    matchMedia,
    add,
    remove,
    listeners,
    change(matches: boolean) {
      state.matches = matches;
      act(() => listeners.forEach((l) => l()));
    },
  };
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { value: originalMatchMedia, configurable: true });
});

describe.each([
  ["addListener (Safari < 14)", true],
  ["addEventListener", false],
])("useMediaQuery with %s", (_name, legacy) => {
  it("returns whether the query matches", () => {
    stubMatchMedia(true, { legacy });
    const { result } = renderHook(() => useMediaQuery("(min-width: 600px)"));
    expect(result.current).toBe(true);
  });

  it("follows changes of the media query", () => {
    const media = stubMatchMedia(false, { legacy });
    const { result } = renderHook(() => useMediaQuery("(min-width: 600px)"));
    expect(result.current).toBe(false);
    media.change(true);
    expect(result.current).toBe(true);
    media.change(false);
    expect(result.current).toBe(false);
  });

  it("subscribes on mount and unsubscribes the same listener on unmount", () => {
    const media = stubMatchMedia(false, { legacy });
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 600px)"));
    expect(media.add).toHaveBeenCalledTimes(1);
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.remove).toHaveBeenCalledTimes(1);
    expect(media.listeners.size).toBe(0);
  });

  it("evaluates the new query when it changes", () => {
    const media = stubMatchMedia(true, { legacy });
    const { rerender } = renderHook(({ q }) => useMediaQuery(q), { initialProps: { q: "(a)" } });
    rerender({ q: "(b)" });
    expect(media.matchMedia).toHaveBeenCalledWith("(b)");
    expect(media.remove).toHaveBeenCalledTimes(1);
    expect(media.add).toHaveBeenCalledTimes(2);
  });
});

describe("useMediaQuery without initializing with the value", () => {
  it("starts from the default value, then syncs once mounted", () => {
    stubMatchMedia(true, { legacy: false });
    const seen: boolean[] = [];
    const { result } = renderHook(() => {
      const matches = useMediaQuery("(x)", { initializeWithValue: false, defaultValue: false });
      seen.push(matches);
      return matches;
    });
    expect(seen[0]).toBe(false);
    expect(result.current).toBe(true);
  });
});
