import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSWChannel, now, type SWMessage } from "./swUpdateChannel";

const update: SWMessage = { type: "update-available", version: "1.2.3", tabId: "tab-1" };

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
}

beforeEach(() => {
  FakeBroadcastChannel.instances = [];
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createSWChannel with BroadcastChannel", () => {
  beforeEach(() => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });

  it("opens the shared channel", () => {
    createSWChannel(vi.fn());
    expect(FakeBroadcastChannel.instances.map((c) => c.name)).toEqual(["sitrep-sw-update"]);
  });

  it("hands received messages to the callback", () => {
    const onMessage = vi.fn();
    createSWChannel(onMessage);
    FakeBroadcastChannel.instances[0].onmessage?.({ data: update });
    expect(onMessage).toHaveBeenCalledWith(update);
  });

  it("posts messages to the channel", () => {
    const channel = createSWChannel(vi.fn());
    channel.post({ type: "apply-now", tabId: "tab-1" });
    expect(FakeBroadcastChannel.instances[0].postMessage).toHaveBeenCalledWith({
      type: "apply-now",
      tabId: "tab-1",
    });
  });

  it("closes the channel", () => {
    const channel = createSWChannel(vi.fn());
    channel.close();
    expect(FakeBroadcastChannel.instances[0].close).toHaveBeenCalledTimes(1);
  });
});

describe("createSWChannel without BroadcastChannel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new Error("unsupported");
        }
      },
    );
  });

  it("delivers a message written to storage by another tab", () => {
    const onMessage = vi.fn();
    createSWChannel(onMessage);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "sitrep-sw-update", newValue: JSON.stringify(update) }),
    );
    expect(onMessage).toHaveBeenCalledWith(update);
  });

  it.each([
    ["another key", { key: "other", newValue: JSON.stringify(update) }],
    ["a removal, which has no new value", { key: "sitrep-sw-update", newValue: null }],
    ["a value that is not JSON", { key: "sitrep-sw-update", newValue: "{oops" }],
  ])("ignores a storage event for %s", (_name, init) => {
    const onMessage = vi.fn();
    createSWChannel(onMessage);
    window.dispatchEvent(new StorageEvent("storage", init));
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("posts by writing to storage, and clears the entry after 500 ms so a repeat is seen", () => {
    vi.useFakeTimers();
    const channel = createSWChannel(vi.fn());
    channel.post(update);
    expect(window.localStorage.getItem("sitrep-sw-update")).toBe(JSON.stringify(update));
    vi.advanceTimersByTime(499);
    expect(window.localStorage.getItem("sitrep-sw-update")).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(window.localStorage.getItem("sitrep-sw-update")).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const channel = createSWChannel(vi.fn());
    expect(() => channel.post(update)).not.toThrow();
  });

  it("stops listening to storage when closed", () => {
    const onMessage = vi.fn();
    const channel = createSWChannel(onMessage);
    channel.close();
    window.dispatchEvent(
      new StorageEvent("storage", { key: "sitrep-sw-update", newValue: JSON.stringify(update) }),
    );
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe("now", () => {
  it("is the current time in milliseconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    expect(now()).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
  });
});
