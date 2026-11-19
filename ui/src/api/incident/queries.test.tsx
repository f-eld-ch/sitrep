import { useQuery } from "@apollo/client/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { graphQlError } from "../testing/mutations";
import { useIncidentDetails, useIncidentReview, useIncidents } from "./queries";

vi.mock("@apollo/client/react", () => ({ useQuery: vi.fn() }));

// The review mapping is covered by mapper.test.ts; here only the hook's wiring matters.
vi.mock("./mapper", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mapper")>()),
  toIncidentReview: vi.fn((review: unknown) => (review ? { mapped: review } : null)),
}));

const refetch = vi.fn();
const startPolling = vi.fn();
const stopPolling = vi.fn();

function mockQuery(result: Record<string, unknown>) {
  vi.mocked(useQuery).mockReturnValue({
    loading: false,
    refetch,
    startPolling,
    stopPolling,
    ...result,
  } as never);
}

const wireSummary = {
  id: "inc-1",
  parentId: null,
  name: "KFS",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  closedAt: "2026-01-02T00:00:00Z",
  isClosed: true,
  hasReview: true,
  canWrite: false,
  canManage: true,
  canDelete: false,
  accessMode: "RESTRICTED",
  location: { name: "Altdorf", coordinates: null },
};

const wireDetail = {
  id: "inc-1",
  parentId: "p-1",
  name: "KFS",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  closedAt: null,
  isClosed: false,
  canManage: true,
  canDelete: true,
  canManageAccess: true,
  location: null,
  divisions: [{ id: "d-1", name: "Alpha", description: "A", kind: "STANDARD" }],
};

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  refetch.mockReset();
  startPolling.mockReset();
  stopPolling.mockReset();
});

describe("useIncidents", () => {
  it("polls every 10 seconds", () => {
    mockQuery({ data: { incidents: [] } });
    renderHook(() => useIncidents());

    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({ pollInterval: 10000 });
  });

  it("is ready with the mapped summaries", () => {
    mockQuery({ data: { incidents: [wireSummary] } });
    const { result } = renderHook(() => useIncidents());

    expect(result.current.status).toBe("ready");
    expect(result.current.data?.incidents).toHaveLength(1);
    expect(result.current.data?.incidents[0]).toMatchObject({
      id: "inc-1",
      hasReview: true,
      canWrite: false,
      accessMode: "RESTRICTED",
      closedAt: new Date("2026-01-02T00:00:00Z"),
      location: { name: "Altdorf" },
    });
  });

  it("is ready and empty when the response carries no data", () => {
    mockQuery({ data: undefined });
    const { result } = renderHook(() => useIncidents());

    expect(result.current).toMatchObject({ status: "ready", data: { incidents: [] } });
  });

  it("is loading while the first response is pending", () => {
    mockQuery({ loading: true, data: undefined });
    const { result } = renderHook(() => useIncidents());

    expect(result.current).toMatchObject({
      status: "loading",
      data: undefined,
      isRefreshing: false,
    });
  });

  it("is ready and refreshing while a poll is in flight", () => {
    mockQuery({ loading: true, data: { incidents: [wireSummary] } });
    const { result } = renderHook(() => useIncidents());

    expect(result.current).toMatchObject({ status: "ready", isRefreshing: true });
  });

  it("is an error without data when nothing was loaded", () => {
    mockQuery({ error: graphQlError("FORBIDDEN"), data: undefined });
    const { result } = renderHook(() => useIncidents());

    expect(result.current).toMatchObject({
      status: "error",
      data: undefined,
      error: { name: "ApiError", code: "FORBIDDEN" },
    });
  });

  it("keeps the stale incidents next to the error", () => {
    mockQuery({ error: graphQlError("INTERNAL_ERROR"), data: { incidents: [wireSummary] } });
    const { result } = renderHook(() => useIncidents());

    expect(result.current.status).toBe("error");
    expect(result.current.data?.incidents).toHaveLength(1);
  });

  it("refresh refetches", () => {
    mockQuery({ data: { incidents: [] } });
    const { result } = renderHook(() => useIncidents());

    result.current.refresh();

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("useIncidentDetails", () => {
  it("queries cache-first by incident id", () => {
    mockQuery({ data: { incident: wireDetail } });
    renderHook(() => useIncidentDetails("inc-1"));

    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({
      variables: { incidentId: "inc-1" },
      skip: false,
      fetchPolicy: "cache-first",
    });
  });

  it("is ready with the mapped incident and its divisions", () => {
    mockQuery({ data: { incident: wireDetail } });
    const { result } = renderHook(() => useIncidentDetails("inc-1"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data?.incident).toMatchObject({
      id: "inc-1",
      parentId: "p-1",
      canManageAccess: true,
      divisions: [{ id: "d-1", name: "Alpha", description: "A", kind: "STANDARD" }],
    });
  });

  it("is loading and skips the query without an incident id", () => {
    mockQuery({ data: undefined });
    const { result } = renderHook(() => useIncidentDetails(undefined));

    expect(result.current.status).toBe("loading");
    expect(vi.mocked(useQuery).mock.calls[0]![1]).toMatchObject({
      variables: { incidentId: "" },
      skip: true,
    });
  });

  it("is loading while the first response is pending", () => {
    mockQuery({ loading: true, data: undefined });
    const { result } = renderHook(() => useIncidentDetails("inc-1"));

    expect(result.current.status).toBe("loading");
  });

  it("is ready and refreshing while a refetch runs", () => {
    mockQuery({ loading: true, data: { incident: wireDetail } });
    const { result } = renderHook(() => useIncidentDetails("inc-1"));

    expect(result.current).toMatchObject({ status: "ready", isRefreshing: true });
  });

  it("is an error with an ApiError when the request failed", () => {
    mockQuery({ error: graphQlError("FORBIDDEN"), data: undefined });
    const { result } = renderHook(() => useIncidentDetails("inc-1"));

    expect(result.current).toMatchObject({
      status: "error",
      data: undefined,
      error: { name: "ApiError", code: "FORBIDDEN" },
    });
  });

  it("is an error with code NOT_FOUND when the incident does not exist", () => {
    mockQuery({ data: { incident: null } });
    const { result } = renderHook(() => useIncidentDetails("inc-1"));

    expect(result.current).toMatchObject({
      status: "error",
      data: undefined,
      error: { code: "NOT_FOUND" },
    });
  });

  it("refresh refetches", () => {
    mockQuery({ data: { incident: wireDetail } });
    const { result } = renderHook(() => useIncidentDetails("inc-1"));

    result.current.refresh();

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("useIncidentReview", () => {
  const openReview = { openedAt: "2026-01-01T00:00:00Z", closedAt: null };
  const closedReview = { openedAt: "2026-01-01T00:00:00Z", closedAt: "2026-01-02T00:00:00Z" };
  const withReview = (review: unknown) => ({ incident: { id: "inc-1", name: "KFS", review } });

  it("queries cache-and-network by incident id", () => {
    mockQuery({ data: withReview(null) });
    renderHook(() => useIncidentReview("inc-1"));

    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({
      variables: { incidentId: "inc-1" },
      skip: false,
      fetchPolicy: "cache-and-network",
    });
  });

  it("is ready with the incident name and the mapped review", () => {
    mockQuery({ data: withReview(closedReview) });
    const { result } = renderHook(() => useIncidentReview("inc-1"));

    expect(result.current).toMatchObject({
      status: "ready",
      data: { incidentName: "KFS", review: { mapped: closedReview } },
    });
  });

  it("is ready with a null review for an imported incident", () => {
    mockQuery({ data: withReview(null) });
    const { result } = renderHook(() => useIncidentReview("inc-1"));

    expect(result.current).toMatchObject({
      status: "ready",
      data: { incidentName: "KFS", review: null },
    });
  });

  it("is loading and skips the query without an incident id", () => {
    mockQuery({ data: undefined });
    const { result } = renderHook(() => useIncidentReview(undefined));

    expect(result.current.status).toBe("loading");
    expect(vi.mocked(useQuery).mock.calls[0]![1]).toMatchObject({
      variables: { incidentId: "" },
      skip: true,
    });
  });

  it("is loading while the first response is pending", () => {
    mockQuery({ loading: true, data: undefined });
    const { result } = renderHook(() => useIncidentReview("inc-1"));

    expect(result.current.status).toBe("loading");
  });

  it("is ready and refreshing while a refetch runs", () => {
    mockQuery({ loading: true, data: withReview(closedReview) });
    const { result } = renderHook(() => useIncidentReview("inc-1"));

    expect(result.current).toMatchObject({ status: "ready", isRefreshing: true });
  });

  it("is an error with an ApiError when the request failed", () => {
    mockQuery({ error: graphQlError("NOT_FOUND"), data: undefined });
    const { result } = renderHook(() => useIncidentReview("inc-1"));

    expect(result.current).toMatchObject({
      status: "error",
      data: undefined,
      error: { name: "ApiError", code: "NOT_FOUND" },
    });
  });

  it("is an error with code NOT_FOUND when the incident does not exist", () => {
    mockQuery({ data: { incident: null } });
    const { result } = renderHook(() => useIncidentReview("inc-1"));

    expect(result.current).toMatchObject({ status: "error", error: { code: "NOT_FOUND" } });
  });

  it("polls every 30 seconds while the incident is open", () => {
    mockQuery({ data: withReview(openReview) });
    renderHook(() => useIncidentReview("inc-1"));

    expect(startPolling).toHaveBeenCalledWith(30_000);
  });

  it.each([
    { name: "closed", data: withReview(closedReview) },
    { name: "imported (no review)", data: withReview(null) },
    { name: "not loaded yet", data: undefined },
  ])("does not poll when the incident is $name", ({ data }) => {
    mockQuery({ data });
    renderHook(() => useIncidentReview("inc-1"));

    expect(startPolling).not.toHaveBeenCalled();
    expect(stopPolling).toHaveBeenCalled();
  });

  it("stops polling when the component unmounts", () => {
    mockQuery({ data: withReview(openReview) });
    const { unmount } = renderHook(() => useIncidentReview("inc-1"));
    stopPolling.mockClear();

    unmount();

    expect(stopPolling).toHaveBeenCalledTimes(1);
  });

  it("refresh refetches", () => {
    mockQuery({ data: withReview(closedReview) });
    const { result } = renderHook(() => useIncidentReview("inc-1"));

    result.current.refresh();

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
