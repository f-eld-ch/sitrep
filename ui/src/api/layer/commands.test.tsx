import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAddFeature, useDeleteFeature, useModifyFeature, useRestoreFeature } from "./commands";

vi.mock("@apollo/client/react", () => ({ useMutation: vi.fn() }));

type MutateOptions = {
  variables: Record<string, unknown>;
  optimisticResponse?: unknown;
  update?: (cache: FakeCache, result: { data?: unknown }) => void;
};

/** A cache holding the layers result the commands patch. */
class FakeCache {
  written: unknown;
  modified: unknown;
  evicted: unknown[] = [];

  constructor(private layers: unknown[]) {}

  readQuery() {
    return { layersForIncident: this.layers };
  }

  writeQuery(options: { data: unknown }) {
    this.written = options.data;
  }

  modify(options: unknown) {
    this.modified = options;
  }

  identify(ref: { id: string }) {
    return `Feature:${ref.id}`;
  }

  evict(options: unknown) {
    this.evicted.push(options);
  }

  gc() {}
}

async function setupMutation(data: unknown) {
  const { useMutation } = await import("@apollo/client/react");
  const mutate = vi.fn((options: MutateOptions) => {
    options.update?.(cache, { data });

    return Promise.resolve({ data });
  });
  vi.mocked(useMutation).mockReturnValue([
    mutate,
    { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
  ]);

  return mutate;
}

const point = { type: "Point", coordinates: [8, 47] };
const feature = (id: string) => ({ id, geometry: point, properties: { label: id } });
let cache: FakeCache;

beforeEach(() => {
  cache = new FakeCache([
    { id: "layer-1", features: [feature("a"), feature("b")] },
    { id: "layer-2", features: [feature("c")] },
  ]);
});

describe("useRestoreFeature", () => {
  it("shows the feature at once, and answers with the real one", async () => {
    const mutate = await setupMutation({ restoreFeature: feature("a") });
    const { result } = renderHook(() => useRestoreFeature());

    await result.current[0]({
      id: "a",
      layerId: "layer-1",
      incidentId: "inc-1",
      current: { geometry: point, properties: { label: "last" } },
      change: { messageId: "msg-1" },
    });

    const options = mutate.mock.calls[0][0];
    expect(options.variables).toEqual({ id: "a", change: { messageId: "msg-1" } });
    expect(options.optimisticResponse).toEqual({
      restoreFeature: {
        __typename: "Feature",
        id: "a",
        geometry: point,
        properties: { label: "last" },
      },
    });
  });

  it("puts the feature back into its layer without duplicating it", async () => {
    await setupMutation({ restoreFeature: feature("a") });
    const { result } = renderHook(() => useRestoreFeature());

    await result.current[0]({
      id: "a",
      layerId: "layer-1",
      incidentId: "inc-1",
      current: { geometry: point, properties: {} },
    });

    const layers = (
      cache.written as { layersForIncident: { id: string; features: { id: string }[] }[] }
    ).layersForIncident;
    expect(layers[0].features.map((f) => f.id)).toEqual(["b", "a"]);
    expect(layers[1].features.map((f) => f.id)).toEqual(["c"]);
  });

  it("leaves the cache alone when the server answers nothing", async () => {
    await setupMutation(undefined);
    const { result } = renderHook(() => useRestoreFeature());

    await result.current[0]({
      id: "a",
      layerId: "layer-1",
      incidentId: "inc-1",
      current: { geometry: point, properties: {} },
    });

    expect(cache.written).toBeUndefined();
  });
});

describe("useDeleteFeature", () => {
  it("takes the feature out of the cached layers and the cache", async () => {
    const mutate = await setupMutation({ deleteFeature: "b" });
    const { result } = renderHook(() => useDeleteFeature());

    await result.current[0]({ id: "b", incidentId: "inc-1", change: { messageId: "msg-1" } });

    expect(mutate.mock.calls[0][0].variables).toEqual({
      id: "b",
      change: { messageId: "msg-1" },
    });

    const layers = (cache.written as { layersForIncident: { features: { id: string }[] }[] })
      .layersForIncident;
    expect(layers[0].features.map((f) => f.id)).toEqual(["a"]);
    expect(cache.evicted).toEqual([{ id: "Feature:b" }]);
  });
});

describe("useAddFeature", () => {
  it("sends the draw key and returns the id the server derived", async () => {
    const mutate = await setupMutation({ addFeature: feature("derived") });
    const { result } = renderHook(() => useAddFeature());

    const added = await result.current[0]({
      layerId: "layer-2",
      clientKey: "draw-1",
      geometry: point,
      properties: {},
      incidentId: "inc-1",
    });

    expect(added).toEqual({ featureId: "derived" });
    expect(mutate.mock.calls[0][0].variables).toMatchObject({
      incidentId: "inc-1",
      layerId: "layer-2",
      clientKey: "draw-1",
    });

    const layers = (cache.written as { layersForIncident: { features: { id: string }[] }[] })
      .layersForIncident;
    expect(layers[1].features.map((f) => f.id)).toEqual(["c", "derived"]);
  });

  it("fails when the server does not return a feature", async () => {
    await setupMutation({ addFeature: null });
    const { result } = renderHook(() => useAddFeature());

    await expect(
      result.current[0]({
        layerId: "layer-2",
        clientKey: "draw-1",
        geometry: point,
        properties: {},
        incidentId: "inc-1",
      }),
    ).rejects.toThrow("Failed to add feature");
  });
});

describe("useModifyFeature", () => {
  it("answers optimistically with the full current state", async () => {
    const mutate = await setupMutation({ modifyFeature: feature("a") });
    const { result } = renderHook(() => useModifyFeature());

    await result.current[0]({
      id: "a",
      properties: { label: "new" },
      currentGeometry: point,
      currentProperties: { label: "new" },
      incidentId: "inc-1",
      change: { effectiveAt: new Date("2026-01-15T10:00:00.000Z") },
    });

    const options = mutate.mock.calls[0][0];
    expect(options.variables).toMatchObject({
      id: "a",
      properties: { label: "new" },
      change: { effectiveAt: "2026-01-15T10:00:00.000Z" },
    });
    expect(options.optimisticResponse).toEqual({
      modifyFeature: { id: "a", geometry: point, properties: { label: "new" } },
    });
  });

  it("keeps the state of the time shown when an edit applies to another time", async () => {
    await setupMutation({ modifyFeature: feature("a") });
    const { result } = renderHook(() => useModifyFeature());

    await result.current[0]({
      id: "a",
      currentGeometry: point,
      currentProperties: { label: "as shown" },
      incidentId: "inc-1",
      asOf: new Date("2026-01-15T09:00:00.000Z"),
    });

    const fields = (cache.modified as { fields: Record<string, () => unknown> }).fields;
    expect(fields.geometry()).toEqual(point);
    expect(fields.properties()).toEqual({ label: "as shown" });
  });

  it("does not touch the cache for the live map", async () => {
    await setupMutation({ modifyFeature: feature("a") });
    const { result } = renderHook(() => useModifyFeature());

    await result.current[0]({
      id: "a",
      currentGeometry: point,
      currentProperties: {},
      incidentId: "inc-1",
    });

    expect(cache.modified).toBeUndefined();
  });
});
