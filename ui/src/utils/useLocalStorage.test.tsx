import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalStorage } from "./useLocalStorage";

// The hook re-reads storage whenever its arguments change identity, so object arguments must be
// stable across renders.
const EPOCH = new Date(0);
const NO_ITEMS: string[] = [];
const ZERO = { n: 0 };
const splitCommas = (raw: string) => raw.split(",");

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLocalStorage", () => {
  describe("reading", () => {
    it("returns the initial value when nothing is stored", () => {
      const { result } = renderHook(() => useLocalStorage("k", "fallback"));
      expect(result.current[0]).toBe("fallback");
    });

    it("does not write the initial value to storage", () => {
      renderHook(() => useLocalStorage("k", "fallback"));
      expect(window.localStorage.getItem("k")).toBeNull();
    });

    it("calls an initial value function", () => {
      const initial = () => ({ n: 1 });
      const { result } = renderHook(() => useLocalStorage("k", initial));
      expect(result.current[0]).toEqual({ n: 1 });
    });

    it.each([
      ["a string", JSON.stringify("hello"), "hello"],
      ["a number", "42", 42],
      ["a boolean", "false", false],
      ["an object", JSON.stringify({ a: [1, 2] }), { a: [1, 2] }],
      ["null", "null", null],
    ])("returns a stored %s", (_name, raw, expected) => {
      window.localStorage.setItem("k", raw);
      const { result } = renderHook(() => useLocalStorage<unknown>("k", "fallback"));
      expect(result.current[0]).toEqual(expected);
    });

    it("reads the literal string undefined as undefined", () => {
      window.localStorage.setItem("k", "undefined");
      const { result } = renderHook(() => useLocalStorage<string | undefined>("k", "fallback"));
      expect(result.current[0]).toBeUndefined();
    });

    it("falls back to the initial value for an empty stored string", () => {
      window.localStorage.setItem("k", "");
      const { result } = renderHook(() => useLocalStorage("k", "fallback"));
      expect(result.current[0]).toBe("fallback");
    });

    it("falls back to the initial value, and logs, when the JSON is invalid", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      window.localStorage.setItem("k", "{not json");
      const { result } = renderHook(() => useLocalStorage("k", "fallback"));
      expect(result.current[0]).toBe("fallback");
      expect(error).toHaveBeenCalledWith("Error parsing JSON:", expect.any(SyntaxError));
    });

    it("falls back to the initial value, and warns, when reading throws", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      const { result } = renderHook(() => useLocalStorage("k", "fallback"));
      expect(result.current[0]).toBe("fallback");
      expect(warn).toHaveBeenCalledWith("Error reading localStorage key “k”:", expect.any(Error));
    });

    it("still reads the stored value after mount when it does not initialize with it", () => {
      window.localStorage.setItem("k", JSON.stringify("stored"));
      const seen: string[] = [];
      const { result } = renderHook(() => {
        const value = useLocalStorage("k", "fallback", { initializeWithValue: false });
        seen.push(value[0]);
        return value;
      });
      // the first render has the initial value, the layout effect then syncs the stored one
      expect(seen[0]).toBe("fallback");
      expect(result.current[0]).toBe("stored");
    });
  });

  describe("options", () => {
    it("uses a custom serializer and deserializer", () => {
      const serializer = (value: Date) => value.toISOString();
      const deserializer = (raw: string) => new Date(raw);
      const { result } = renderHook(() =>
        useLocalStorage("k", EPOCH, { serializer, deserializer }),
      );
      act(() => result.current[1](new Date("2026-01-02T03:04:05.000Z")));
      expect(window.localStorage.getItem("k")).toBe("2026-01-02T03:04:05.000Z");
      expect(result.current[0]).toEqual(new Date("2026-01-02T03:04:05.000Z"));
    });

    it("hands the raw stored text to a custom deserializer, even when it is not JSON", () => {
      window.localStorage.setItem("k", "a,b,c");
      const { result } = renderHook(() =>
        useLocalStorage<string[]>("k", NO_ITEMS, { deserializer: splitCommas }),
      );
      expect(result.current[0]).toEqual(["a", "b", "c"]);
    });
  });

  describe("writing", () => {
    it("stores JSON and updates the value", () => {
      const { result } = renderHook(() => useLocalStorage("k", ZERO));
      act(() => result.current[1]({ n: 5 }));
      expect(result.current[0]).toEqual({ n: 5 });
      expect(window.localStorage.getItem("k")).toBe('{"n":5}');
    });

    it("accepts a functional update", () => {
      const { result } = renderHook(() => useLocalStorage("k", 1));
      act(() => result.current[1]((prev) => prev + 1));
      act(() => result.current[1]((prev) => prev + 1));
      expect(result.current[0]).toBe(3);
      expect(window.localStorage.getItem("k")).toBe("3");
    });

    it("bases a functional update on what is in storage, not on the rendered value", () => {
      const { result } = renderHook(() => useLocalStorage("k", 1));
      window.localStorage.setItem("k", "10");
      act(() => result.current[1]((prev) => prev + 1));
      expect(result.current[0]).toBe(11);
    });

    it("keeps the value, and warns, when writing fails", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { result } = renderHook(() => useLocalStorage("k", "before"));
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });
      act(() => result.current[1]("after"));
      expect(result.current[0]).toBe("before");
      expect(warn).toHaveBeenCalledWith("Error setting localStorage key “k”:", expect.any(Error));
    });

    it("keeps a stable setter across renders", () => {
      const { result, rerender } = renderHook(() => useLocalStorage("k", 1));
      const setter = result.current[1];
      rerender();
      expect(result.current[1]).toBe(setter);
    });
  });

  describe("synchronisation", () => {
    it("notifies other hooks on the same key within the document", () => {
      const a = renderHook(() => useLocalStorage("shared", 0));
      const b = renderHook(() => useLocalStorage("shared", 0));
      act(() => a.result.current[1](7));
      expect(b.result.current[0]).toBe(7);
    });

    it("dispatches a local-storage event carrying the key", () => {
      const listener = vi.fn();
      window.addEventListener("local-storage", listener);
      const { result } = renderHook(() => useLocalStorage("k", 0));
      act(() => result.current[1](1));
      window.removeEventListener("local-storage", listener);
      expect(listener).toHaveBeenCalledTimes(1);
      expect((listener.mock.calls[0][0] as StorageEvent).key).toBe("k");
    });

    it("leaves hooks on other keys alone", () => {
      const a = renderHook(() => useLocalStorage("one", 0));
      const b = renderHook(() => useLocalStorage("two", 0));
      act(() => a.result.current[1](7));
      expect(b.result.current[0]).toBe(0);
    });

    it("picks up a storage event for its key, as sent by another document", () => {
      const { result } = renderHook(() => useLocalStorage("k", "old"));
      act(() => {
        window.localStorage.setItem("k", JSON.stringify("from another tab"));
        window.dispatchEvent(new StorageEvent("storage", { key: "k" }));
      });
      expect(result.current[0]).toBe("from another tab");
    });

    it("ignores a storage event for another key", () => {
      const { result } = renderHook(() => useLocalStorage("k", "old"));
      act(() => {
        window.localStorage.setItem("k", JSON.stringify("changed"));
        window.dispatchEvent(new StorageEvent("storage", { key: "other" }));
      });
      expect(result.current[0]).toBe("old");
    });

    it("re-reads on a storage event without a key, as sent by localStorage.clear()", () => {
      window.localStorage.setItem("k", JSON.stringify("stored"));
      const { result } = renderHook(() => useLocalStorage("k", "fallback"));
      act(() => {
        window.localStorage.clear();
        window.dispatchEvent(new StorageEvent("storage"));
      });
      expect(result.current[0]).toBe("fallback");
    });

    it("stops listening once unmounted", () => {
      const { result, unmount } = renderHook(() => useLocalStorage("k", "old"));
      unmount();
      window.localStorage.setItem("k", JSON.stringify("new"));
      window.dispatchEvent(new StorageEvent("storage", { key: "k" }));
      expect(result.current[0]).toBe("old");
    });
  });

  describe("changing the key", () => {
    it("reads the value stored under the new key", () => {
      window.localStorage.setItem("a", JSON.stringify("value a"));
      window.localStorage.setItem("b", JSON.stringify("value b"));
      const { result, rerender } = renderHook(({ k }) => useLocalStorage(k, "fallback"), {
        initialProps: { k: "a" },
      });
      expect(result.current[0]).toBe("value a");
      rerender({ k: "b" });
      expect(result.current[0]).toBe("value b");
    });

    it("falls back to the initial value when the new key is empty, and writes to the new key", () => {
      window.localStorage.setItem("a", JSON.stringify("value a"));
      const { result, rerender } = renderHook(({ k }) => useLocalStorage(k, "fallback"), {
        initialProps: { k: "a" },
      });
      rerender({ k: "b" });
      expect(result.current[0]).toBe("fallback");
      act(() => result.current[1]("new"));
      expect(window.localStorage.getItem("b")).toBe('"new"');
      expect(window.localStorage.getItem("a")).toBe('"value a"');
    });
  });
});
