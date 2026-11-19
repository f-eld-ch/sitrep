import type { InMemoryCache } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordMutation } from "../mutationActivity";
import { graphQlError, mockMutation, mutateOptions, newCache } from "../testing/mutations";
import {
  useAlertResource,
  useChangeHauptaufgabe,
  useDeployResource,
  useHandOver,
  useMarkResourceReady,
  useReassignResource,
  useReactivateResource,
  useRelieveResource,
  useRenameResource,
  useStandDownResource,
  useUpdateContact,
  useUpdateDeploymentLocation,
  useUpdatePersonnelCount,
} from "./commands";
import { GET_INCIDENT_RESOURCES, RESOURCE_FIELDS } from "./documents";

// Complements commands.test.tsx: optimistic responses, cache updates, activity tracking, errors.

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
  useApolloClient: vi.fn(),
}));

vi.mock("../mutationActivity", () => ({ recordMutation: vi.fn(), isMutationRecent: vi.fn() }));

const wireResource = (id: string, overrides: Record<string, unknown> = {}) => ({
  __typename: "Resource" as const,
  id,
  incidentId: "inc-1",
  schadenplatzId: "sp-1",
  formation: "FW",
  name: `Res ${id}`,
  size: "TRUPP",
  personnelCount: 2,
  hauptaufgabe: "Pumpen",
  contact: null,
  homeLocation: null,
  deploymentLocation: null,
  status: "AUFGEBOTEN",
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
  ...overrides,
});

type WireResource = ReturnType<typeof wireResource>;

function seedResource(cache: InMemoryCache, resource: WireResource) {
  cache.writeFragment({
    id: cache.identify(resource),
    fragment: RESOURCE_FIELDS,
    fragmentName: "ResourceFields",
    data: resource as never,
  });
}

function readResource(cache: InMemoryCache, id: string) {
  return cache.readFragment<WireResource>({
    id: `Resource:${id}`,
    fragment: RESOURCE_FIELDS,
    fragmentName: "ResourceFields",
  });
}

const schadenplatz = (id: string, resources: WireResource[], isDefault = false) => ({
  __typename: "Schadenplatz" as const,
  id,
  incidentId: "inc-1",
  name: `SP ${id}`,
  isDefault,
  casualties: { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 },
  isMerged: false,
  mergedInto: null,
  resources,
});

function seedIncidentResources(cache: InMemoryCache, places: ReturnType<typeof schadenplatz>[]) {
  cache.writeQuery({
    query: GET_INCIDENT_RESOURCES,
    variables: { incidentId: "inc-1" },
    data: {
      incident: {
        __typename: "Incident",
        id: "inc-1",
        name: "KFS",
        hasCasualtyRecords: false,
        childIncidents: [],
        resources: [],
        schadenplaetze: places,
      },
    } as never,
  });
}

function readPlaces(cache: InMemoryCache) {
  return cache.readQuery({ query: GET_INCIDENT_RESOURCES, variables: { incidentId: "inc-1" } })
    ?.incident?.schadenplaetze;
}

let cache: InMemoryCache;

beforeEach(() => {
  cache = newCache();
  vi.mocked(useApolloClient).mockReturnValue({ cache } as never);
  vi.mocked(recordMutation).mockClear();
});

describe("useAlertResource", () => {
  const args = {
    incidentId: "inc-1",
    schadenplatzId: "sp-1",
    formation: "FW" as never,
    name: "Tanklöscher",
    size: "TRUPP" as never,
    personnelCount: 4,
    hauptaufgabe: "Pumpen",
    contact: { medium: "FUNK" as never, detail: "Kanal 3" },
    homeLocation: { name: "Depot", lat: 47.1, lng: 8.6 },
    sourceMessageId: "m-1",
    occurredAt: new Date("2026-01-15T10:00:00Z"),
    tempId: "tmp-1",
  };

  it("sends every field in the input and records the write", async () => {
    const mutate = await mockMutation({ resolved: { data: { alertResource: { id: "r-9" } } } });
    const { result } = renderHook(() => useAlertResource());

    await expect(result.current[0](args)).resolves.toEqual({ resourceId: "r-9" });

    expect(recordMutation).toHaveBeenCalledTimes(1);
    expect(mutateOptions(mutate).variables).toEqual({
      input: {
        incidentId: "inc-1",
        schadenplatzId: "sp-1",
        formation: "FW",
        name: "Tanklöscher",
        size: "TRUPP",
        personnelCount: 4,
        hauptaufgabe: "Pumpen",
        contact: { medium: "FUNK", detail: "Kanal 3" },
        homeLocation: { name: "Depot", lat: 47.1, lng: 8.6 },
        sourceMessageId: "m-1",
        occurredAt: "2026-01-15T10:00:00.000Z",
      },
    });
  });

  it("builds the optimistic resource from the arguments, using the caller's temporary id", async () => {
    const mutate = await mockMutation({ resolved: { data: { alertResource: { id: "r-9" } } } });
    const { result } = renderHook(() => useAlertResource());

    await result.current[0](args);

    expect(mutateOptions(mutate).optimisticResponse).toMatchObject({
      alertResource: {
        id: "tmp-1",
        incidentId: "inc-1",
        schadenplatzId: "sp-1",
        status: "AUFGEBOTEN",
        statusAt: "2026-01-15T10:00:00.000Z",
        alertedAt: "2026-01-15T10:00:00.000Z",
        contact: { medium: "FUNK", detail: "Kanal 3" },
        homeLocation: { name: "Depot", lat: 47.1, lng: 8.6 },
        sourceMessageId: "m-1",
        personnelCount: 4,
        readyAt: null,
        deploymentHistory: [],
      },
    });
  });

  it("defaults the optional fields in the optimistic resource and generates a temporary id", async () => {
    const mutate = await mockMutation({ resolved: { data: { alertResource: { id: "r-9" } } } });
    const { result } = renderHook(() => useAlertResource());

    await result.current[0]({
      incidentId: "inc-1",
      formation: "FW" as never,
      name: "X",
      size: "TRUPP" as never,
      personnelCount: 1,
      hauptaufgabe: "",
      homeLocation: { name: "Depot" },
    });

    const optimistic = (
      mutateOptions(mutate).optimisticResponse as { alertResource: Record<string, unknown> }
    ).alertResource;
    expect(optimistic).toMatchObject({
      id: expect.stringMatching(/^temp-\d+$/),
      schadenplatzId: "",
      contact: null,
      homeLocation: { name: "Depot", lat: null, lng: null },
      sourceMessageId: null,
    });
    expect(optimistic["statusAt"]).toBe(optimistic["alertedAt"]);
  });

  it("adds the alerted resource to its Schadenplatz only", async () => {
    const created = wireResource("r-9", { schadenplatzId: "sp-2" });
    const mutate = await mockMutation({ resolved: { data: { alertResource: created } } });
    const { result } = renderHook(() => useAlertResource());
    await result.current[0](args);
    const existing = wireResource("r-1");
    seedIncidentResources(cache, [schadenplatz("sp-1", [existing]), schadenplatz("sp-2", [])]);

    mutateOptions(mutate).update?.(cache, { data: { alertResource: created } });

    expect(readPlaces(cache)?.map((sp) => sp.resources.map((r) => r.id))).toEqual([
      ["r-1"],
      ["r-9"],
    ]);
  });

  it("leaves an uncached incident alone and ignores an empty response", async () => {
    const created = wireResource("r-9");
    const mutate = await mockMutation({ resolved: { data: { alertResource: created } } });
    const { result } = renderHook(() => useAlertResource());
    await result.current[0](args);

    mutateOptions(mutate).update?.(cache, { data: { alertResource: created } });
    expect(readPlaces(cache)).toBeUndefined();

    seedIncidentResources(cache, [schadenplatz("sp-1", [])]);
    mutateOptions(mutate).update?.(cache, { data: undefined });
    expect(readPlaces(cache)?.[0]?.resources).toEqual([]);
  });

  it("fails with code UNKNOWN when the response carries no id", async () => {
    await mockMutation({ resolved: { data: { alertResource: null } } });
    const { result } = renderHook(() => useAlertResource());

    await expect(result.current[0](args)).rejects.toMatchObject({
      message: "Alert resource failed",
      code: "UNKNOWN",
    });
  });
});

describe("resource status commands", () => {
  const base = wireResource("r-1");
  const at = new Date("2026-01-15T10:00:00Z");

  const cases = [
    {
      name: "useMarkResourceReady",
      hook: useMarkResourceReady,
      field: "markResourceReady",
      args: { id: "r-1", at },
      variables: { id: "r-1", at: at.toISOString() },
      optimistic: { status: "EINSATZBEREIT" },
      tracked: true,
    },
    {
      name: "useDeployResource",
      hook: useDeployResource,
      field: "deployResource",
      args: { id: "r-1", at },
      variables: { id: "r-1", at: at.toISOString() },
      optimistic: { status: "EINGESETZT" },
      tracked: true,
    },
    {
      name: "useStandDownResource",
      hook: useStandDownResource,
      field: "standDownResource",
      args: { id: "r-1", at },
      variables: { id: "r-1", at: at.toISOString() },
      optimistic: { status: "EINSATZBEREIT" },
      tracked: true,
    },
    {
      name: "useRelieveResource",
      hook: useRelieveResource,
      field: "relieveResource",
      args: { id: "r-1", successorId: "r-2", at },
      variables: { id: "r-1", successorId: "r-2", at: at.toISOString() },
      optimistic: { status: "ABGELOEST", successorId: "r-2" },
      tracked: true,
    },
    {
      name: "useChangeHauptaufgabe",
      hook: useChangeHauptaufgabe,
      field: "changeHauptaufgabe",
      args: { id: "r-1", hauptaufgabe: "Retten", at },
      variables: { id: "r-1", hauptaufgabe: "Retten", at: at.toISOString() },
      optimistic: { hauptaufgabe: "Retten" },
      tracked: false,
    },
    {
      name: "useUpdatePersonnelCount",
      hook: useUpdatePersonnelCount,
      field: "updatePersonnelCount",
      args: { id: "r-1", count: 7, at },
      variables: { id: "r-1", count: 7, at: at.toISOString() },
      optimistic: { personnelCount: 7 },
      tracked: false,
    },
    {
      name: "useRenameResource",
      hook: useRenameResource,
      field: "renameResource",
      args: { id: "r-1", name: "Neu", at },
      variables: { id: "r-1", name: "Neu", at: at.toISOString() },
      optimistic: { name: "Neu" },
      tracked: false,
    },
    {
      name: "useReassignResource",
      hook: useReassignResource,
      field: "reassignResource",
      args: { id: "r-1", schadenplatzId: "sp-2", at },
      variables: { id: "r-1", schadenplatzId: "sp-2", at: at.toISOString() },
      optimistic: { schadenplatzId: "sp-2" },
      tracked: false,
    },
    {
      name: "useUpdateDeploymentLocation",
      hook: useUpdateDeploymentLocation,
      field: "updateDeploymentLocation",
      args: { id: "r-1", label: "Brücke", at },
      variables: { id: "r-1", label: "Brücke", at: at.toISOString() },
      optimistic: { deploymentLocation: { lat: null, lng: null, label: "Brücke" } },
      tracked: false,
    },
    {
      name: "useUpdateContact",
      hook: useUpdateContact,
      field: "updateContact",
      args: { id: "r-1", medium: "FUNK" as never, detail: "Kanal 3", at },
      variables: { id: "r-1", medium: "FUNK", detail: "Kanal 3", at: at.toISOString() },
      optimistic: { contact: { medium: "FUNK", detail: "Kanal 3" } },
      tracked: false,
    },
  ];

  it.each(cases)("$name sends the variables", async ({ hook, args, variables }) => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => hook());

    await (result.current[0] as (a: unknown) => Promise<void>)(args);

    expect(mutateOptions(mutate).variables).toEqual(variables);
  });

  it.each(cases)(
    "$name records the write only where it should",
    async ({ hook, args, tracked }) => {
      await mockMutation();
      const { result } = renderHook(() => hook());

      await (result.current[0] as (a: unknown) => Promise<void>)(args);

      expect(vi.mocked(recordMutation)).toHaveBeenCalledTimes(tracked ? 1 : 0);
    },
  );

  it.each(cases)(
    "$name optimistically changes the cached resource",
    async ({ hook, args, optimistic, field }) => {
      seedResource(cache, base);
      const mutate = await mockMutation();
      const { result } = renderHook(() => hook());

      await (result.current[0] as (a: unknown) => Promise<void>)(args);

      expect(mutateOptions(mutate).optimisticResponse).toEqual({
        [field]: expect.objectContaining({ ...base, ...optimistic }),
      });
    },
  );

  it.each(cases)(
    "$name has no optimistic response when the resource is not cached",
    async ({ hook, args }) => {
      const mutate = await mockMutation();
      const { result } = renderHook(() => hook());

      await (result.current[0] as (a: unknown) => Promise<void>)(args);

      expect(mutateOptions(mutate).optimisticResponse).toBeUndefined();
    },
  );

  it.each(cases)(
    "$name writes the response resource to the cache",
    async ({ hook, args, field }) => {
      seedResource(cache, base);
      const mutate = await mockMutation();
      const { result } = renderHook(() => hook());
      await (result.current[0] as (a: unknown) => Promise<void>)(args);

      mutateOptions(mutate).update?.(cache, {
        data: { [field]: wireResource("r-1", { name: "From server" }) },
      });

      expect(readResource(cache, "r-1")?.name).toBe("From server");
    },
  );

  it.each(cases)("$name ignores an empty response", async ({ hook, args }) => {
    seedResource(cache, base);
    const mutate = await mockMutation();
    const { result } = renderHook(() => hook());
    await (result.current[0] as (a: unknown) => Promise<void>)(args);

    mutateOptions(mutate).update?.(cache, { data: undefined });

    expect(readResource(cache, "r-1")).toEqual(base);
  });

  it.each([
    { name: "useMarkResourceReady", hook: useMarkResourceReady },
    { name: "useChangeHauptaufgabe", hook: useChangeHauptaufgabe },
  ])("$name sends no time when none is given", async ({ hook }) => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => hook());

    await (result.current[0] as (a: unknown) => Promise<void>)({ id: "r-1", hauptaufgabe: "x" });

    const variables = mutateOptions(mutate).variables as Record<string, unknown>;
    expect(variables["at"] ?? null).toBeNull();
  });

  it("useRelieveResource sends no successor and clears it optimistically when none is given", async () => {
    seedResource(cache, wireResource("r-1", { successorId: "r-old" }));
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRelieveResource());

    await result.current[0]({ id: "r-1" });

    expect(mutateOptions(mutate).variables).toEqual({
      id: "r-1",
      successorId: undefined,
      at: undefined,
    });
    expect(mutateOptions(mutate).optimisticResponse).toMatchObject({
      relieveResource: { status: "ABGELOEST", successorId: null },
    });
  });
});

describe("useHandOver", () => {
  const at = new Date("2026-01-15T10:00:00Z");

  it("sends the ids and the time and records the write", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useHandOver());

    await result.current[0]({ id: "r-1", successorId: "r-2", at });

    expect(recordMutation).toHaveBeenCalledTimes(1);
    expect(mutateOptions(mutate).variables).toEqual({
      id: "r-1",
      successorId: "r-2",
      at: at.toISOString(),
    });
  });

  it("optimistically relieves the predecessor and deploys the successor", async () => {
    seedResource(cache, wireResource("r-1"));
    seedResource(cache, wireResource("r-2"));
    const mutate = await mockMutation();
    const { result } = renderHook(() => useHandOver());

    await result.current[0]({ id: "r-1", successorId: "r-2" });

    expect(mutateOptions(mutate).optimisticResponse).toMatchObject({
      handOver: {
        relieved: { id: "r-1", status: "ABGELOEST", successorId: "r-2" },
        successor: { id: "r-2", status: "EINGESETZT", predecessorId: "r-1" },
      },
    });
  });

  it.each([
    { name: "the predecessor", cached: ["r-2"] },
    { name: "the successor", cached: ["r-1"] },
  ])("has no optimistic response when $name is not cached", async ({ cached }) => {
    cached.forEach((id) => seedResource(cache, wireResource(id)));
    const mutate = await mockMutation();
    const { result } = renderHook(() => useHandOver());

    await result.current[0]({ id: "r-1", successorId: "r-2" });

    expect(mutateOptions(mutate).optimisticResponse).toBeUndefined();
  });

  it("writes both resources of the response to the cache", async () => {
    seedResource(cache, wireResource("r-1"));
    seedResource(cache, wireResource("r-2"));
    const mutate = await mockMutation();
    const { result } = renderHook(() => useHandOver());
    await result.current[0]({ id: "r-1", successorId: "r-2" });

    mutateOptions(mutate).update?.(cache, {
      data: {
        handOver: {
          relieved: wireResource("r-1", { status: "ABGELOEST" }),
          successor: wireResource("r-2", { status: "EINGESETZT" }),
        },
      },
    });

    expect(readResource(cache, "r-1")?.status).toBe("ABGELOEST");
    expect(readResource(cache, "r-2")?.status).toBe("EINGESETZT");
  });

  it("ignores an empty response", async () => {
    seedResource(cache, wireResource("r-1"));
    const mutate = await mockMutation();
    const { result } = renderHook(() => useHandOver());
    await result.current[0]({ id: "r-1", successorId: "r-2" });

    mutateOptions(mutate).update?.(cache, { data: undefined });

    expect(readResource(cache, "r-1")?.status).toBe("AUFGEBOTEN");
  });
});

describe("useReactivateResource", () => {
  it("records the write", async () => {
    await mockMutation();
    const { result } = renderHook(() => useReactivateResource());

    await result.current[0]({ id: "r-1" });

    expect(recordMutation).toHaveBeenCalledTimes(1);
  });

  it("has no optimistic response when the incident has no default Schadenplatz cached", async () => {
    seedResource(cache, wireResource("r-1", { status: "ABGELOEST" }));
    seedIncidentResources(cache, [schadenplatz("sp-1", [])]);
    const mutate = await mockMutation();
    const { result } = renderHook(() => useReactivateResource());

    await result.current[0]({ id: "r-1" });

    expect(mutateOptions(mutate).optimisticResponse).toBeUndefined();
  });
});

describe("command state", () => {
  it.each([
    { name: "useAlertResource", hook: useAlertResource },
    { name: "useMarkResourceReady", hook: useMarkResourceReady },
    { name: "useHandOver", hook: useHandOver },
    { name: "useReactivateResource", hook: useReactivateResource },
  ])("$name reports an ApiError converted from the mutation error", async ({ hook }) => {
    const { useMutation } = await import("@apollo/client/react");
    vi.mocked(useMutation).mockReturnValue([
      vi.fn(),
      { loading: true, error: graphQlError("CONFLICT"), reset: vi.fn(), called: true } as never,
    ]);
    const { result } = renderHook(() => hook());

    expect(result.current[1].loading).toBe(true);
    expect(result.current[1].error).toMatchObject({ name: "ApiError", code: "CONFLICT" });
  });
});
