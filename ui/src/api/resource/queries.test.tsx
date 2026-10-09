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

  describe("while another point in time loads", () => {
    // Apollo hands out the same result object until the data changes; the mocks must too.
    const incident = (name: string) => ({
      incident: { id: "inc-1", name, childIncidents: [], resources: [], schadenplaetze: [] },
    });
    const at10 = incident("as of 10:00");
    const at11 = incident("as of 11:00");

    it("keeps showing the previous data instead of falling back to loading", () => {
      const first = new Date("2026-01-15T10:00:00Z");
      const second = new Date("2026-01-15T11:00:00Z");

      // the first point in time has arrived...
      useQuery.mockImplementation((_doc: unknown, options: Options) =>
        options.skip ? empty : { ...empty, data: at10 },
      );
      const { result, rerender } = renderHook(({ asOf }) => useIncidentResources("inc-1", asOf), {
        initialProps: { asOf: first },
      });
      expect(result.current.status).toBe("ready");
      expect(result.current.isRefreshing).toBe(false);

      // ...and the slider moves on: the new query has no data yet
      useQuery.mockImplementation((_doc: unknown, options: Options) =>
        options.skip ? empty : { ...empty, loading: true, data: undefined },
      );
      rerender({ asOf: second });

      expect(result.current.status).toBe("ready");
      expect(result.current.isRefreshing).toBe(true);
      expect(result.current.data?.incidentName).toBe("as of 10:00");

      // the new data replaces it
      useQuery.mockImplementation((_doc: unknown, options: Options) =>
        options.skip ? empty : { ...empty, data: at11 },
      );
      rerender({ asOf: second });
      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.data?.incidentName).toBe("as of 11:00");
    });

    it("shows loading on the very first load", () => {
      useQuery.mockReturnValue({ ...empty, loading: true });
      const { result } = renderHook(() => useIncidentResources("inc-1"));
      expect(result.current.status).toBe("loading");
    });
  });
});
