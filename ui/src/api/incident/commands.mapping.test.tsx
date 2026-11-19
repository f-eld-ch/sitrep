import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GET_INCIDENT_MESSAGES } from "../message/documents";
import { graphQlError, mockMutation, mutateOptions, newCache } from "../testing/mutations";
import {
  useCloseIncident,
  useCreateIncident,
  useDeleteIncident,
  useLinkIncidentParent,
  useReopenIncident,
  useUnlinkIncidentParent,
  useUpdateIncident,
} from "./commands";
import { CREATE_INCIDENT, GET_INCIDENT_DETAILS, GET_INCIDENTS } from "./documents";
import { afterIncidentWrite } from "./invalidate";

// Complements commands.test.tsx: variable mapping, cache seeding, error state, plain commands.

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
}));

const wireIncident = (id: string, overrides: Record<string, unknown> = {}) => ({
  __typename: "Incident",
  id,
  parentId: null,
  name: "KFS",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  closedAt: null,
  isClosed: false,
  canManage: true,
  canDelete: true,
  canManageAccess: true,
  location: { name: "Altdorf", coordinates: null },
  divisions: [
    { __typename: "Division", id: "d-1", name: "Alpha", description: "A", kind: "STANDARD" },
  ],
  ...overrides,
});

const listedIncident = (id: string) => ({
  id,
  parentId: null,
  name: "Old",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: null,
  closedAt: null,
  isClosed: false,
  hasReview: false,
  canWrite: true,
  canManage: true,
  canDelete: true,
  accessMode: "OPEN_OPERATIONAL",
  location: null,
});

async function setupCreate(created: unknown) {
  const { useMutation } = await import("@apollo/client/react");
  const response = { data: { createIncident: { incident: created } } };
  const mutate = vi.fn().mockResolvedValue(response);
  const mutateWithParent = vi.fn().mockResolvedValue(response);
  const state = { loading: false, error: undefined, reset: vi.fn(), called: false } as never;
  vi.mocked(useMutation).mockImplementation(((doc: unknown) =>
    doc === CREATE_INCIDENT ? [mutate, state] : [mutateWithParent, state]) as never);

  return { mutate, mutateWithParent };
}

describe("useCreateIncident variables", () => {
  const base = {
    name: "KFS",
    location: "Altdorf",
    divisions: [{ name: "Alpha", description: "A" }],
  };

  it.each([
    {
      name: "an extra layer is requested",
      args: { ...base, layerName: "Lage" },
      expected: {
        name: "KFS",
        location: "Altdorf",
        divisions: base.divisions,
        layers: [{ name: "Lage" }],
      },
    },
    {
      name: "no extra layer is requested",
      args: base,
      expected: { name: "KFS", location: "Altdorf", divisions: base.divisions, layers: [] },
    },
    {
      name: "the location is empty",
      args: { ...base, location: "" },
      expected: { name: "KFS", location: undefined, divisions: base.divisions, layers: [] },
    },
  ])("maps the arguments when $name", async ({ args, expected }) => {
    const { mutate } = await setupCreate(wireIncident("inc-1"));
    const { result } = renderHook(() => useCreateIncident());

    await result.current[0](args);

    expect(mutateOptions(mutate).variables).toEqual(expected);
  });

  it("fails with code UNKNOWN when the response carries no incident id", async () => {
    await setupCreate(null);
    const { result } = renderHook(() => useCreateIncident());

    await expect(result.current[0](base)).rejects.toMatchObject({
      message: "Create incident failed",
      code: "UNKNOWN",
    });
  });
});

describe("useCreateIncident cache seeding", () => {
  it.each([{ withParent: false }, { withParent: true }])(
    "keeps the seeded details when it seeds the empty message list (withParent=$withParent)",
    async ({ withParent }) => {
      const incident = wireIncident("inc-new", withParent ? { parentId: "p-1" } : {});
      const { mutate, mutateWithParent } = await setupCreate(incident);
      const { result } = renderHook(() => useCreateIncident());
      await result.current[0]({
        name: "KFS",
        location: "",
        divisions: [],
        ...(withParent ? { parentId: "p-1" } : {}),
      });
      const cache = newCache();

      mutateOptions(withParent ? mutateWithParent : mutate).update?.(cache, {
        data: { createIncident: { incident } },
      });

      expect(
        cache.readQuery({ query: GET_INCIDENT_DETAILS, variables: { incidentId: "inc-new" } }),
      ).toMatchObject({ incident: { id: "inc-new", name: "KFS" } });
      expect(
        cache.readQuery({ query: GET_INCIDENT_MESSAGES, variables: { incidentId: "inc-new" } }),
      ).toMatchObject({
        incident: { id: "inc-new", divisions: incident.divisions, messages: [] },
      });
    },
  );

  it.each([{ withParent: false }, { withParent: true }])(
    "does nothing when the response carries no incident (withParent=$withParent)",
    async ({ withParent }) => {
      const { mutate, mutateWithParent } = await setupCreate(wireIncident("inc-new"));
      const { result } = renderHook(() => useCreateIncident());
      await result.current[0]({
        name: "KFS",
        location: "",
        divisions: [],
        ...(withParent ? { parentId: "p-1" } : {}),
      });
      const cache = newCache();

      mutateOptions(withParent ? mutateWithParent : mutate).update?.(cache, {
        data: { createIncident: null },
      });

      expect(
        cache.readQuery({ query: GET_INCIDENT_DETAILS, variables: { incidentId: "inc-new" } }),
      ).toBeNull();
    },
  );

  it.each([{ parentId: undefined }, { parentId: "p-1" }])(
    "adds the new incident to a cached incident list (parentId=$parentId)",
    async ({ parentId }) => {
      const incident = wireIncident("inc-new");
      const { mutate, mutateWithParent } = await setupCreate(incident);
      const { result } = renderHook(() => useCreateIncident());
      await result.current[0]({ name: "KFS", location: "", divisions: [], parentId });
      const cache = newCache();
      cache.writeQuery({
        query: GET_INCIDENTS,
        data: { incidents: [listedIncident("inc-old")] as never },
      });
      const write = vi.spyOn(cache, "writeQuery");
      // The hook's list entry lacks hasReview/canWrite/accessMode; Apollo reports that on stderr.
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      mutateOptions(parentId ? mutateWithParent : mutate).update?.(cache, {
        data: { createIncident: { incident } },
      });
      consoleError.mockRestore();

      const listWrite = write.mock.calls.find(([options]) => options.query === GET_INCIDENTS);
      const written = listWrite?.[0].data as {
        incidents: { id: string; parentId: string | null }[];
      };
      expect(written.incidents.map((i) => i.id)).toEqual(["inc-old", "inc-new"]);
      expect(written.incidents[1]).toMatchObject({
        parentId: parentId ?? null,
        closedAt: null,
        isClosed: false,
      });
    },
  );

  it("does not write the incident list when it is not cached", async () => {
    const incident = wireIncident("inc-new");
    const { mutate } = await setupCreate(incident);
    const { result } = renderHook(() => useCreateIncident());
    await result.current[0]({ name: "KFS", location: "", divisions: [] });
    const cache = newCache();
    const write = vi.spyOn(cache, "writeQuery");

    mutateOptions(mutate).update?.(cache, { data: { createIncident: { incident } } });

    expect(write.mock.calls.some(([options]) => options.query === GET_INCIDENTS)).toBe(false);
  });
});

describe("plain incident commands", () => {
  it("useUpdateIncident sends the incident id as id with the new fields", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useUpdateIncident());
    const divisions = [
      { id: "d-1", name: "Alpha", description: "A" },
      { name: "New", description: "" },
    ];

    await result.current[0]({ incidentId: "inc-1", name: "KFS", location: "Bern", divisions });

    expect(mutate).toHaveBeenCalledWith({
      variables: { id: "inc-1", name: "KFS", location: "Bern", divisions },
    });
  });

  it.each([
    { name: "useCloseIncident", hook: useCloseIncident },
    { name: "useReopenIncident", hook: useReopenIncident },
  ])("$name sends the incident id as id", async ({ hook }) => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => hook());

    await result.current[0]({ incidentId: "inc-1" });

    expect(mutate).toHaveBeenCalledWith({ variables: { id: "inc-1" } });
  });

  it("useLinkIncidentParent sends the child and parent ids", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useLinkIncidentParent());

    await result.current[0]({ childId: "c-1", parentId: "p-1" });

    expect(mutate).toHaveBeenCalledWith({ variables: { childId: "c-1", parentId: "p-1" } });
  });

  it("useUnlinkIncidentParent sends only the child id", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useUnlinkIncidentParent());

    await result.current[0]({ childId: "c-1", parentId: "p-1" });

    expect(mutate).toHaveBeenCalledWith({ variables: { childId: "c-1" } });
  });

  it("useDeleteIncident evicts the incident from the cache and collects garbage", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useDeleteIncident());
    await result.current[0]({ incidentId: "inc-1" });
    const cache = newCache();
    const evict = vi.spyOn(cache, "evict");
    const gc = vi.spyOn(cache, "gc");

    expect(mutateOptions(mutate).variables).toEqual({ id: "inc-1" });
    mutateOptions(mutate).update?.(cache, {});

    expect(evict).toHaveBeenCalledWith({ id: "Incident:inc-1" });
    expect(gc).toHaveBeenCalled();
  });
});

describe("incident command state", () => {
  it("combines loading of both create mutations and reports an ApiError", async () => {
    const { useMutation } = await import("@apollo/client/react");
    const idle = { loading: false, error: undefined, reset: vi.fn(), called: false } as never;
    const failing = {
      loading: true,
      error: graphQlError("INVALID_PARENT_INCIDENT"),
      reset: vi.fn(),
      called: true,
    } as never;
    vi.mocked(useMutation).mockImplementation(((doc: unknown) =>
      doc === CREATE_INCIDENT ? [vi.fn(), idle] : [vi.fn(), failing]) as never);

    const { result } = renderHook(() => useCreateIncident());

    expect(result.current[1].loading).toBe(true);
    expect(result.current[1].error).toMatchObject({
      name: "ApiError",
      code: "INVALID_PARENT_INCIDENT",
    });
  });

  it.each([
    { name: "useUpdateIncident", hook: useUpdateIncident },
    { name: "useCloseIncident", hook: useCloseIncident },
    { name: "useReopenIncident", hook: useReopenIncident },
    { name: "useDeleteIncident", hook: useDeleteIncident },
    { name: "useLinkIncidentParent", hook: useLinkIncidentParent },
    { name: "useUnlinkIncidentParent", hook: useUnlinkIncidentParent },
  ])("$name reports an ApiError converted from the mutation error", async ({ hook }) => {
    const { useMutation } = await import("@apollo/client/react");
    vi.mocked(useMutation).mockReturnValue([
      vi.fn(),
      {
        loading: false,
        error: graphQlError("INCIDENT_NOT_OPEN"),
        reset: vi.fn(),
        called: true,
      } as never,
    ]);
    const { result } = renderHook(() => hook());

    expect(result.current[1].error).toMatchObject({ name: "ApiError", code: "INCIDENT_NOT_OPEN" });
  });
});

describe("afterIncidentWrite", () => {
  it("refetches the list and, when given an id, that incident's details", () => {
    expect(afterIncidentWrite()).toEqual([{ query: GET_INCIDENTS }]);
    expect(afterIncidentWrite("inc-1")).toEqual([
      { query: GET_INCIDENTS },
      { query: GET_INCIDENT_DETAILS, variables: { incidentId: "inc-1" } },
    ]);
  });
});
