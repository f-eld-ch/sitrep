import type { InMemoryCache } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET_INCIDENT_RESOURCES } from "../resource/documents";
import { graphQlError, mockMutation, mutateOptions, newCache } from "../testing/mutations";
import { useCreateSchadenplatz, useRecordCasualties } from "./commands";

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
  useApolloClient: vi.fn(),
}));

const zero = { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 };

const place = (id: string) => ({
  __typename: "Schadenplatz" as const,
  id,
  incidentId: "inc-1",
  name: `SP ${id}`,
  isDefault: false,
  casualties: zero,
  isMerged: false,
  mergedInto: null,
});

function seedPlaces(cache: InMemoryCache, ids: string[]) {
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
        schadenplaetze: ids.map((id) => ({ ...place(id), resources: [] })),
      },
    } as never,
  });
}

const readPlaces = (cache: InMemoryCache) =>
  cache.readQuery({ query: GET_INCIDENT_RESOURCES, variables: { incidentId: "inc-1" } })?.incident
    ?.schadenplaetze;

let cache: InMemoryCache;

beforeEach(() => {
  cache = newCache();
  vi.mocked(useApolloClient).mockReturnValue({ cache } as never);
});

describe("useCreateSchadenplatz", () => {
  const args = {
    incidentId: "inc-1",
    name: "Brandplatz",
    tempId: "tmp-1",
    occurredAt: new Date("2026-01-15T10:00:00Z"),
  };

  it("sends the incident, name and time and returns the new id with the temporary one", async () => {
    const mutate = await mockMutation({
      resolved: { data: { createSchadenplatz: place("sp-9") } },
    });
    const { result } = renderHook(() => useCreateSchadenplatz());

    await expect(result.current[0](args)).resolves.toEqual({ id: "sp-9", tempId: "tmp-1" });

    expect(mutateOptions(mutate).variables).toEqual({
      incidentId: "inc-1",
      name: "Brandplatz",
      occurredAt: "2026-01-15T10:00:00.000Z",
    });
  });

  it("sends a null time and generates a temporary id when none are given", async () => {
    const mutate = await mockMutation({
      resolved: { data: { createSchadenplatz: place("sp-9") } },
    });
    const { result } = renderHook(() => useCreateSchadenplatz());

    const created = await result.current[0]({ incidentId: "inc-1", name: "Brandplatz" });

    expect(created.tempId).toMatch(/^__optimistic_sp_\d+$/);
    expect(mutateOptions(mutate).variables).toMatchObject({ occurredAt: null });
  });

  it("optimistically shows an empty place under the temporary id", async () => {
    const mutate = await mockMutation({
      resolved: { data: { createSchadenplatz: place("sp-9") } },
    });
    const { result } = renderHook(() => useCreateSchadenplatz());

    await result.current[0](args);

    expect(mutateOptions(mutate).optimisticResponse).toEqual({
      createSchadenplatz: {
        __typename: "Schadenplatz",
        id: "tmp-1",
        incidentId: "inc-1",
        name: "Brandplatz",
        isDefault: false,
        isMerged: false,
        mergedInto: null,
        casualties: zero,
      },
    });
  });

  it("appends the new place, without resources, to the cached incident", async () => {
    const mutate = await mockMutation({
      resolved: { data: { createSchadenplatz: place("sp-9") } },
    });
    const { result } = renderHook(() => useCreateSchadenplatz());
    await result.current[0](args);
    seedPlaces(cache, ["sp-1"]);

    mutateOptions(mutate).update?.(cache, { data: { createSchadenplatz: place("sp-9") } });

    expect(readPlaces(cache)?.map((sp) => sp.id)).toEqual(["sp-1", "sp-9"]);
    expect(readPlaces(cache)?.[1]?.resources).toEqual([]);
  });

  it("does not add a place twice when the real response follows the optimistic one", async () => {
    const mutate = await mockMutation({
      resolved: { data: { createSchadenplatz: place("sp-9") } },
    });
    const { result } = renderHook(() => useCreateSchadenplatz());
    await result.current[0](args);
    seedPlaces(cache, ["sp-1", "sp-9"]);

    mutateOptions(mutate).update?.(cache, { data: { createSchadenplatz: place("sp-9") } });

    expect(readPlaces(cache)?.map((sp) => sp.id)).toEqual(["sp-1", "sp-9"]);
  });

  it("leaves an uncached incident alone and ignores an empty response", async () => {
    const mutate = await mockMutation({
      resolved: { data: { createSchadenplatz: place("sp-9") } },
    });
    const { result } = renderHook(() => useCreateSchadenplatz());
    await result.current[0](args);

    mutateOptions(mutate).update?.(cache, { data: { createSchadenplatz: place("sp-9") } });
    expect(readPlaces(cache)).toBeUndefined();

    seedPlaces(cache, ["sp-1"]);
    mutateOptions(mutate).update?.(cache, { data: undefined });
    expect(readPlaces(cache)?.map((sp) => sp.id)).toEqual(["sp-1"]);
  });

  it("fails with code UNKNOWN when the response carries no id", async () => {
    await mockMutation({ resolved: { data: { createSchadenplatz: null } } });
    const { result } = renderHook(() => useCreateSchadenplatz());

    await expect(result.current[0](args)).rejects.toMatchObject({
      message: "Create Schadenplatz failed",
      code: "UNKNOWN",
    });
  });
});

describe("useRecordCasualties", () => {
  const args = {
    schadenplatzId: "sp-1",
    messageId: "m-1",
    deltas: { vermisste: 1, tote: 2, verletzte: 3, obdachlose: 0, eingeschlossene: 4 },
    occurredAt: new Date("2026-01-15T10:00:00Z"),
  };

  function seedTotals(totals: Record<string, number>) {
    cache.restore({
      "Schadenplatz:sp-1": {
        __typename: "Schadenplatz",
        id: "sp-1",
        casualties: { __typename: "Casualties", ...zero, ...totals },
      },
    });
  }

  it("sends the deltas as input with the message as source", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRecordCasualties());

    await result.current[0](args);

    expect(mutateOptions(mutate).variables).toEqual({
      id: "sp-1",
      sourceMessageId: "m-1",
      occurredAt: "2026-01-15T10:00:00.000Z",
      input: args.deltas,
    });
  });

  it("sends a null time when none is given", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRecordCasualties());

    await result.current[0]({ ...args, occurredAt: undefined });

    expect(mutateOptions(mutate).variables).toMatchObject({ occurredAt: null });
  });

  it("has no optimistic response when the place is not cached", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRecordCasualties());

    await result.current[0](args);

    expect(mutateOptions(mutate).optimisticResponse).toBeUndefined();
  });

  it("optimistically adds the deltas to the cached totals", async () => {
    seedTotals({ vermisste: 10, tote: 10, verletzte: 10, obdachlose: 10, eingeschlossene: 10 });
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRecordCasualties());

    await result.current[0](args);

    expect(mutateOptions(mutate).optimisticResponse).toEqual({
      recordCasualties: {
        __typename: "Schadenplatz",
        id: "sp-1",
        casualties: {
          __typename: "Casualties",
          vermisste: 11,
          tote: 12,
          verletzte: 13,
          obdachlose: 10,
          eingeschlossene: 14,
        },
      },
    });
  });

  it("subtracts what the message recorded before, so a re-triage replaces its values", async () => {
    seedTotals({ vermisste: 10, tote: 10, verletzte: 10, obdachlose: 10, eingeschlossene: 10 });
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRecordCasualties());

    await result.current[0]({
      ...args,
      previous: { vermisste: 1, tote: 2, verletzte: 3, obdachlose: 4, eingeschlossene: 5 },
    });

    expect(mutateOptions(mutate).optimisticResponse).toMatchObject({
      recordCasualties: {
        casualties: { vermisste: 10, tote: 10, verletzte: 10, obdachlose: 6, eingeschlossene: 9 },
      },
    });
  });

  describe("cache update", () => {
    const entry = (schadenplatzId: string, tote: number) => ({
      __typename: "SchadenplatzCasualtyEntry",
      schadenplatzId,
      ...zero,
      tote,
    });
    const seedMessage = (entries: unknown[]) =>
      cache.restore({
        "Message:m-1": {
          __typename: "Message",
          id: "m-1",
          content: "Fire",
          schadenplatzCasualties: entries,
        },
      });
    const readMessage = () =>
      cache.extract()["Message:m-1"] as
        | { content: string; schadenplatzCasualties: unknown[] }
        | undefined;

    it("replaces this place's entry on the message and keeps the other places", async () => {
      seedMessage([entry("sp-1", 99), entry("sp-2", 5)]);
      const mutate = await mockMutation();
      const { result } = renderHook(() => useRecordCasualties());
      await result.current[0](args);

      mutateOptions(mutate).update?.(cache, {});

      expect(readMessage()?.schadenplatzCasualties).toEqual([
        { __typename: "SchadenplatzCasualtyEntry", schadenplatzId: "sp-2", ...zero, tote: 5 },
        { __typename: "SchadenplatzCasualtyEntry", schadenplatzId: "sp-1", ...args.deltas },
      ]);
      expect(readMessage()?.content).toBe("Fire");
    });

    it("adds the entry when the message had none", async () => {
      seedMessage([]);
      const mutate = await mockMutation();
      const { result } = renderHook(() => useRecordCasualties());
      await result.current[0](args);

      mutateOptions(mutate).update?.(cache, {});

      expect(readMessage()?.schadenplatzCasualties).toEqual([
        { __typename: "SchadenplatzCasualtyEntry", schadenplatzId: "sp-1", ...args.deltas },
      ]);
    });

    it("leaves a casualties field that is a reference rather than a list untouched", async () => {
      cache.restore({
        "Message:m-1": {
          __typename: "Message",
          id: "m-1",
          schadenplatzCasualties: { __ref: "Other:1" },
        },
        "Other:1": { __typename: "Other", id: "1" },
      });
      const mutate = await mockMutation();
      const { result } = renderHook(() => useRecordCasualties());
      await result.current[0](args);

      mutateOptions(mutate).update?.(cache, {});

      expect(cache.extract()["Message:m-1"]).toMatchObject({
        schadenplatzCasualties: { __ref: "Other:1" },
      });
    });

    it("does nothing when the message is not cached", async () => {
      const mutate = await mockMutation();
      const { result } = renderHook(() => useRecordCasualties());
      await result.current[0](args);

      mutateOptions(mutate).update?.(cache, {});

      expect(readMessage()).toBeUndefined();
    });
  });
});

describe("command state", () => {
  it.each([
    { name: "useCreateSchadenplatz", hook: useCreateSchadenplatz },
    { name: "useRecordCasualties", hook: useRecordCasualties },
  ])("$name reports an ApiError converted from the mutation error", async ({ hook }) => {
    const { useMutation } = await import("@apollo/client/react");
    vi.mocked(useMutation).mockReturnValue([
      vi.fn(),
      { loading: true, error: graphQlError("FORBIDDEN"), reset: vi.fn(), called: true } as never,
    ]);
    const { result } = renderHook(() => hook());

    expect(result.current[1].loading).toBe(true);
    expect(result.current[1].error).toMatchObject({ name: "ApiError", code: "FORBIDDEN" });
  });
});
