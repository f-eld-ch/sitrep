import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isMutationRecent } from "../mutationActivity";
import { graphQlError } from "../testing/mutations";
import { useIncidentResources } from "./queries";
import { ApiError } from "../errors";

const useQuery = vi.hoisted(() => vi.fn());

vi.mock("@apollo/client/react", () => ({ useQuery }));
vi.mock("../mutationActivity", () => ({ isMutationRecent: vi.fn(() => false) }));

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

  describe("result mapping", () => {
    const zero = { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 };
    const wireResource = {
      id: "r-1",
      incidentId: "inc-1",
      schadenplatzId: "sp-1",
      formation: "FW",
      name: "Tanklöscher",
      size: "TRUPP",
      personnelCount: 3,
      hauptaufgabe: "Pumpen",
      contact: { medium: "RADIO", detail: "Kanal 3" },
      homeLocation: null,
      deploymentLocation: null,
      status: "EINGESETZT",
      statusAt: "2026-01-01T10:00:00Z",
      alertedAt: "2026-01-01T10:00:00Z",
      readyAt: null,
      deployedAt: null,
      stoodDownAt: null,
      relievedAt: null,
      einsatzBeginn: null,
      einsatzEnde: null,
      predecessorId: null,
      successorId: null,
      sourceMessageId: null,
      deploymentHistory: [],
    };
    const place = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      incidentId: "inc-1",
      name: `SP ${id}`,
      isDefault: false,
      isMerged: false,
      mergedInto: null,
      casualties: zero,
      resources: [wireResource],
      ...overrides,
    });
    const wireIncident = (overrides: Record<string, unknown> = {}) => ({
      id: "inc-1",
      name: "KFS",
      hasCasualtyRecords: true,
      childIncidents: [
        {
          id: "c-1",
          name: "Child",
          hasCasualtyRecords: true,
          schadenplaetze: [
            place("c-sp-1", { casualties: { ...zero, tote: 2, verletzte: 1 } }),
            place("c-sp-2", { casualties: { ...zero, tote: 3, verletzte: 4 } }),
            // A merged place is counted where it was merged into, not twice.
            place("c-sp-3", { isMerged: true, casualties: { ...zero, tote: 100 } }),
          ],
        },
      ],
      resources: [wireResource],
      schadenplaetze: [place("sp-1")],
      ...overrides,
    });

    it("maps the incident, its places with their resources and the child incidents' totals", () => {
      useQuery.mockReturnValue({ ...empty, data: { incident: wireIncident() } });

      const { result } = renderHook(() => useIncidentResources("inc-1"));

      expect(result.current.status).toBe("ready");
      expect(result.current.data).toMatchObject({
        incidentId: "inc-1",
        incidentName: "KFS",
        hasCasualtyRecords: true,
        resources: [{ id: "r-1", formation: "FW", status: "EINGESETZT", size: "TRUPP" }],
        schadenplaetze: [
          {
            id: "sp-1",
            isDefault: false,
            resources: [{ id: "r-1", contact: { medium: "RADIO" } }],
          },
        ],
        childIncidents: [
          {
            id: "c-1",
            name: "Child",
            hasCasualtyRecords: true,
            casualties: { ...zero, tote: 5, verletzte: 5 },
          },
        ],
      });
    });

    it("treats missing casualty-record flags as false and missing place resources as none", () => {
      const incident = wireIncident({
        hasCasualtyRecords: undefined,
        childIncidents: [{ id: "c-1", name: "Child", schadenplaetze: [] }],
        schadenplaetze: [place("sp-1", { resources: undefined })],
      });
      useQuery.mockReturnValue({ ...empty, data: { incident } });

      const { result } = renderHook(() => useIncidentResources("inc-1"));

      expect(result.current.data).toMatchObject({
        hasCasualtyRecords: false,
        childIncidents: [{ hasCasualtyRecords: false, casualties: zero }],
        schadenplaetze: [{ resources: [] }],
      });
    });

    it("is ready and refreshing while a poll is in flight", () => {
      useQuery.mockReturnValue({ ...empty, loading: true, data: { incident: wireIncident() } });

      const { result } = renderHook(() => useIncidentResources("inc-1"));

      expect(result.current).toMatchObject({ status: "ready", isRefreshing: true });
    });

    it("is an error with an ApiError and no data when the request failed", () => {
      useQuery.mockReturnValue({ ...empty, error: graphQlError("FORBIDDEN") });

      const { result } = renderHook(() => useIncidentResources("inc-1"));

      expect(result.current).toMatchObject({
        status: "error",
        data: undefined,
        error: { name: "ApiError", code: "FORBIDDEN" },
      });
    });

    it("is an error with code NOT_FOUND when the incident does not exist", () => {
      useQuery.mockReturnValue({ ...empty, data: { incident: null } });

      const { result } = renderHook(() => useIncidentResources("inc-1"));

      expect(result.current).toMatchObject({
        status: "error",
        data: undefined,
        error: { code: "NOT_FOUND" },
      });
      expect(result.current.error).toBeInstanceOf(ApiError);
    });

    it("is loading without an incident id", () => {
      const { result } = renderHook(() => useIncidentResources(undefined));

      expect(result.current.status).toBe("loading");
    });

    it("refresh refetches the query of the point in time in use", () => {
      const liveRefetch = vi.fn();
      const pastRefetch = vi.fn();
      const data = { incident: wireIncident() };
      useQuery.mockImplementation((_doc: unknown, options: Options) =>
        options.skip
          ? { ...empty, refetch: pastRefetch }
          : { ...empty, data, refetch: liveRefetch },
      );

      renderHook(() => useIncidentResources("inc-1")).result.current.refresh();

      expect(liveRefetch).toHaveBeenCalledTimes(1);
      expect(pastRefetch).not.toHaveBeenCalled();
    });

    it.each([
      { name: "the tab is hidden", hidden: true, recent: false, skipped: true },
      { name: "a write was just made", hidden: false, recent: true, skipped: true },
      {
        name: "the tab is visible and nothing was written",
        hidden: false,
        recent: false,
        skipped: false,
      },
    ])("skips a poll attempt: $name", ({ hidden, recent, skipped }) => {
      renderHook(() => useIncidentResources("inc-1"));
      const options = (useQuery.mock.calls[0] as [unknown, { skipPollAttempt: () => boolean }])[1];
      vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
      vi.mocked(isMutationRecent).mockReturnValue(recent);

      expect(options.skipPollAttempt()).toBe(skipped);

      vi.restoreAllMocks();
    });
  });
});
