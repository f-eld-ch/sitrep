import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIncidentResources } from "./queries";

const useQuery = vi.hoisted(() => vi.fn());

vi.mock("@apollo/client/react", () => ({ useQuery }));

interface Options {
  variables: { incidentId: string; asOf?: string };
  skip: boolean;
  fetchPolicy: string;
  pollInterval?: number;
}

const empty = { loading: false, error: undefined, data: undefined, refetch: vi.fn() };

describe("useIncidentResources", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useQuery.mockReturnValue(empty);
  });

  // Both queries are always called (hooks cannot be conditional); skip selects the one in use.
  const calls = () => {
    const [live, past] = useQuery.mock.calls as [[unknown, Options], [unknown, Options]];

    return { live: live[1], past: past[1] };
  };

  it("uses the live query while no point in time is chosen", () => {
    renderHook(() => useIncidentResources("inc-1"));

    const { live, past } = calls();
    expect(live.skip).toBe(false);
    expect(live.pollInterval).toBe(5000);
    expect(live.fetchPolicy).toBe("cache-and-network");
    expect(past.skip).toBe(true);
  });

  it("uses a cache-bypassing, unpolled query for a past point in time", () => {
    const asOf = new Date("2026-01-15T12:00:00Z");
    renderHook(() => useIncidentResources("inc-1", asOf));

    const { live, past } = calls();
    expect(live.skip).toBe(true);
    expect(past.skip).toBe(false);
    expect(past.variables).toEqual({ incidentId: "inc-1", asOf: "2026-01-15T12:00:00.000Z" });
    // Past resources would overwrite the current state of the same normalized entities.
    expect(past.fetchPolicy).toBe("no-cache");
    expect(past.pollInterval).toBeUndefined();
  });

  it("does not query without an incident", () => {
    renderHook(() => useIncidentResources(undefined, new Date()));

    const { live, past } = calls();
    expect(live.skip).toBe(true);
    expect(past.skip).toBe(true);
  });
});
