import { useQuery } from "@apollo/client/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResult } from "../result";
import { graphQlError, serverError } from "../testing/mutations";
import {
  useAccessGroups,
  useAccessUsers,
  useDefaultAccess,
  useGlobalRoles,
  useGroupMembers,
  useIncidentAccess,
  useIncidentAccessMode,
  useMyGlobalRoles,
} from "./queries";

vi.mock("@apollo/client/react", () => ({ useQuery: vi.fn() }));

const refetch = vi.fn();

function mockQuery(result: Record<string, unknown>) {
  vi.mocked(useQuery).mockReturnValue({ loading: false, refetch, ...result } as never);
}

beforeEach(() => {
  refetch.mockReset();
  vi.mocked(useQuery).mockReset();
});

interface Case {
  name: string;
  run: () => QueryResult<unknown>;
  /** Wire data as the server sends it, and what the hook must turn it into. */
  wire: Record<string, unknown>;
  mapped: unknown;
  /** What the hook reports when the response carries no data field. */
  empty: unknown;
  refreshes: boolean;
}

const cases: Case[] = [
  {
    name: "useIncidentAccess",
    run: () => useIncidentAccess("inc-1"),
    wire: {
      incidentAccess: [
        {
          __typename: "IncidentAccessGrant",
          incidentId: "inc-1",
          principalKind: "USER",
          principalId: "u-1",
          principalName: "Ann",
          role: "OWNER",
        },
      ],
    },
    mapped: {
      grants: [
        {
          incidentId: "inc-1",
          principalKind: "USER",
          principalId: "u-1",
          principalName: "Ann",
          role: "OWNER",
        },
      ],
    },
    empty: { grants: [] },
    refreshes: true,
  },
  {
    name: "useIncidentAccessMode",
    run: () => useIncidentAccessMode("inc-1"),
    wire: { incidentAccessMode: "RESTRICTED" },
    mapped: { mode: "RESTRICTED" },
    empty: { mode: "OPEN_OPERATIONAL" },
    refreshes: true,
  },
  {
    name: "useAccessGroups",
    run: () => useAccessGroups(),
    wire: {
      accessGroups: [
        { id: "g-1", name: "Staff", description: "d", archivedAt: "2026-01-02T03:04:05Z" },
      ],
    },
    mapped: {
      groups: [
        {
          id: "g-1",
          name: "Staff",
          description: "d",
          archivedAt: new Date("2026-01-02T03:04:05Z"),
        },
      ],
    },
    empty: { groups: [] },
    refreshes: true,
  },
  {
    name: "useGroupMembers",
    run: () => useGroupMembers("g-1"),
    wire: { groupMembers: ["s-1", "s-2"] },
    mapped: { subjects: ["s-1", "s-2"] },
    empty: { subjects: [] },
    refreshes: true,
  },
  {
    name: "useAccessUsers",
    run: () => useAccessUsers(),
    wire: { users: [{ sub: "s-1", name: "Ann", email: "a@x.ch", extra: 1 }] },
    mapped: { users: [{ sub: "s-1", name: "Ann", email: "a@x.ch" }] },
    empty: { users: [] },
    refreshes: true,
  },
  {
    name: "useMyGlobalRoles",
    run: () => useMyGlobalRoles(),
    wire: {
      myGlobalRoles: [{ subject: "s-1", role: "SYSTEM_ADMIN", name: "Ann", email: "a@x.ch" }],
    },
    mapped: { grants: [{ subject: "s-1", role: "SYSTEM_ADMIN", name: "Ann", email: "a@x.ch" }] },
    empty: { grants: [] },
    refreshes: false,
  },
  {
    name: "useGlobalRoles",
    run: () => useGlobalRoles(),
    wire: { globalRoles: [{ subject: "s-1", role: "GROUP_ADMIN", name: "Ann", email: "a@x.ch" }] },
    mapped: { grants: [{ subject: "s-1", role: "GROUP_ADMIN", name: "Ann", email: "a@x.ch" }] },
    empty: { grants: [] },
    refreshes: true,
  },
  {
    name: "useDefaultAccess",
    run: () => useDefaultAccess(),
    wire: {
      defaultAccess: {
        mode: "OPEN_OPERATIONAL",
        grants: [{ principalKind: "ALL", principalId: "", role: "VIEWER" }],
      },
    },
    mapped: {
      mode: "OPEN_OPERATIONAL",
      grants: [{ principalKind: "ALL", principalId: "", role: "VIEWER" }],
    },
    empty: { mode: "RESTRICTED", grants: [] },
    refreshes: true,
  },
];

describe.each(cases)("$name", ({ run, wire, mapped, empty, refreshes }) => {
  it("is loading while the first response is pending", () => {
    mockQuery({ loading: true, data: undefined });
    const { result } = renderHook(run);

    expect(result.current).toMatchObject({
      status: "loading",
      data: undefined,
      error: undefined,
      isRefreshing: false,
    });
  });

  it("is ready with the mapped data", () => {
    mockQuery({ data: wire });
    const { result } = renderHook(run);

    expect(result.current).toMatchObject({
      status: "ready",
      data: mapped,
      error: undefined,
      isRefreshing: false,
    });
  });

  it("stays ready and marks a background refetch as refreshing", () => {
    mockQuery({ loading: true, data: wire });
    const { result } = renderHook(run);

    expect(result.current).toMatchObject({ status: "ready", data: mapped, isRefreshing: true });
  });

  it("falls back to an empty result when the response carries no data", () => {
    mockQuery({ data: undefined });
    const { result } = renderHook(run);

    expect(result.current).toMatchObject({ status: "ready", data: empty });
  });

  it("is an error with an ApiError and no data when the request failed", () => {
    mockQuery({ error: graphQlError("FORBIDDEN"), data: undefined });
    const { result } = renderHook(run);

    expect(result.current).toMatchObject({
      status: "error",
      data: undefined,
      error: { name: "ApiError", code: "FORBIDDEN" },
    });
  });

  it("keeps the stale data next to the error", () => {
    mockQuery({ error: graphQlError("INTERNAL_ERROR"), data: wire });
    const { result } = renderHook(run);

    expect(result.current).toMatchObject({
      status: "error",
      data: mapped,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("refresh refetches the query only when the hook supports it", () => {
    mockQuery({ data: wire });
    const { result } = renderHook(run);

    result.current.refresh();

    expect(refetch).toHaveBeenCalledTimes(refreshes ? 1 : 0);
  });
});

describe("useMyGlobalRoles refresh", () => {
  it.each([
    { state: "loading", result: { loading: true, data: undefined } },
    { state: "error", result: { error: graphQlError("FORBIDDEN"), data: undefined } },
  ])("is a harmless no-op while $state", ({ result: queryResult }) => {
    mockQuery(queryResult);
    const { result } = renderHook(() => useMyGlobalRoles());

    expect(() => result.current.refresh()).not.toThrow();
    expect(refetch).not.toHaveBeenCalled();
  });
});

describe("transport failures", () => {
  it("are reported as NETWORK_ERROR", () => {
    mockQuery({ error: serverError(), data: undefined });
    const { result } = renderHook(() => useAccessGroups());

    expect(result.current).toMatchObject({ status: "error", error: { code: "NETWORK_ERROR" } });
  });
});

describe("variables and skip logic", () => {
  it("useIncidentAccess queries by incident id and skips without one", () => {
    mockQuery({ data: undefined });
    renderHook(() => useIncidentAccess("inc-1"));
    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({
      variables: { incidentId: "inc-1" },
      skip: false,
    });

    const { result } = renderHook(() => useIncidentAccess(undefined));
    expect(vi.mocked(useQuery).mock.calls[1]![1]).toEqual({
      variables: { incidentId: "" },
      skip: true,
    });
    expect(result.current.status).toBe("loading");
  });

  it("useIncidentAccessMode queries by incident id and skips without one", () => {
    mockQuery({ data: undefined });
    renderHook(() => useIncidentAccessMode("inc-1"));
    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({
      variables: { incidentId: "inc-1" },
      skip: false,
    });

    const { result } = renderHook(() => useIncidentAccessMode(undefined));
    expect(vi.mocked(useQuery).mock.calls[1]![1]).toEqual({
      variables: { incidentId: "" },
      skip: true,
    });
    expect(result.current.status).toBe("loading");
  });

  it("useGroupMembers queries by group id, polls every second and skips without one", () => {
    mockQuery({ data: undefined });
    renderHook(() => useGroupMembers("g-1"));
    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({
      variables: { groupId: "g-1" },
      skip: false,
      pollInterval: 1000,
    });

    const { result } = renderHook(() => useGroupMembers(undefined));
    expect(vi.mocked(useQuery).mock.calls[1]![1]).toMatchObject({
      variables: { groupId: "" },
      skip: true,
    });
    expect(result.current.status).toBe("loading");
  });

  it("useAccessGroups is loading and passes skip through when skipped", () => {
    mockQuery({ data: undefined });
    const { result } = renderHook(() => useAccessGroups(true));

    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({ skip: true });
    expect(result.current.status).toBe("loading");
  });

  it("useAccessGroups does not skip by default", () => {
    mockQuery({ data: undefined });
    renderHook(() => useAccessGroups());

    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({ skip: false });
  });

  it.each([
    { skip: true, expected: true },
    { skip: undefined, expected: false },
  ])("useMyGlobalRoles passes skip=$skip as $expected", ({ skip, expected }) => {
    mockQuery({ data: undefined });
    renderHook(() => useMyGlobalRoles(skip));

    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({ skip: expected });
  });
});
