import { act, renderHook } from "@testing-library/react";
import type { MapRef } from "react-map-gl/maplibre";
import { describe, expect, it, vi } from "vitest";
import { useMapLoaded } from "./useMapLoaded";

// A map that can finish loading later, as the real one does.
function fakeMap(loaded: boolean) {
  const listeners = new Map<string, () => void>();
  const state = { loaded };
  const map = {
    loaded: vi.fn(() => state.loaded),
    once: vi.fn((event: string, fn: () => void) => void listeners.set(event, fn)),
    off: vi.fn((event: string) => void listeners.delete(event)),
  };

  return {
    map: map as unknown as MapRef,
    raw: map,
    listeners,
    finishLoading: () => {
      state.loaded = true;
      listeners.get("load")?.();
    },
    setLoaded: (value: boolean) => {
      state.loaded = value;
    },
  };
}

describe("useMapLoaded", () => {
  it("is false without a map", () => {
    const { result } = renderHook(() => useMapLoaded(undefined));

    expect(result.current).toBe(false);
  });

  it("is true at once for a map that has loaded", () => {
    const { map } = fakeMap(true);

    const { result } = renderHook(() => useMapLoaded(map));

    expect(result.current).toBe(true);
  });

  it("turns true when the map finishes loading, and not before", () => {
    const { map, finishLoading, listeners } = fakeMap(false);

    const { result } = renderHook(() => useMapLoaded(map));
    expect(result.current).toBe(false);
    expect(listeners.has("load")).toBe(true);

    act(() => finishLoading());

    expect(result.current).toBe(true);
  });

  it("stays true when the map reports not loaded again (style switch, tiles in flight)", () => {
    const { map, setLoaded, raw } = fakeMap(true);

    const { result, rerender } = renderHook(() => useMapLoaded(map));
    setLoaded(false);
    raw.loaded.mockClear();
    rerender();

    expect(result.current).toBe(true);
  });

  it("picks up a map that appears after the first render", () => {
    const { map, finishLoading } = fakeMap(false);

    const { result, rerender } = renderHook(({ m }) => useMapLoaded(m), {
      initialProps: { m: undefined as MapRef | undefined },
    });
    expect(result.current).toBe(false);

    rerender({ m: map });
    act(() => finishLoading());

    expect(result.current).toBe(true);
  });

  it("turns true when the map settles, for a component mounted after the map's load event", () => {
    // tiles are in flight: loaded() is false, and `load` has fired before and will not again
    const { map, listeners, setLoaded } = fakeMap(false);

    const { result } = renderHook(() => useMapLoaded(map));
    expect(result.current).toBe(false);
    expect(listeners.has("idle")).toBe(true);

    setLoaded(true);
    act(() => listeners.get("idle")?.());

    expect(result.current).toBe(true);
  });

  it("stops listening when it is unmounted before the map loaded", () => {
    const { map, listeners } = fakeMap(false);

    const { unmount } = renderHook(() => useMapLoaded(map));
    unmount();

    expect(listeners.has("load")).toBe(false);
    expect(listeners.has("idle")).toBe(false);
  });
});
