import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("mutation activity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Module state: every test starts with no write ever recorded.
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function load() {
    return import("./mutationActivity");
  }

  it("is not recent before any write", async () => {
    vi.setSystemTime(1_000_000);
    const { isMutationRecent } = await load();

    expect(isMutationRecent()).toBe(false);
  });

  it("is recent right after a write", async () => {
    vi.setSystemTime(1_000_000);
    const { isMutationRecent, recordMutation } = await load();

    recordMutation();

    expect(isMutationRecent()).toBe(true);
  });

  it("stays recent for just under 2 seconds and then ends", async () => {
    vi.setSystemTime(1_000_000);
    const { isMutationRecent, recordMutation } = await load();
    recordMutation();

    vi.setSystemTime(1_001_999);
    expect(isMutationRecent()).toBe(true);

    vi.setSystemTime(1_002_000);
    expect(isMutationRecent()).toBe(false);
  });

  it("restarts the window with each write", async () => {
    vi.setSystemTime(1_000_000);
    const { isMutationRecent, recordMutation } = await load();
    recordMutation();

    vi.setSystemTime(1_001_500);
    recordMutation();
    vi.setSystemTime(1_003_000);

    expect(isMutationRecent()).toBe(true);
  });
});
