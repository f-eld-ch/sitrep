import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { graphQlError } from "../testing/mutations";
import {
  cleanFeature,
  useAddFeature,
  useAddLayer,
  useDeleteFeature,
  useModifyFeature,
  useRestoreFeature,
} from "./commands";
import { GET_LAYERS } from "./documents";
import { afterLayerWrite } from "./invalidate";

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
  // Read lazily: the cache of the test at hand.
  useApolloClient: () => ({ cache }),
}));

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

describe("useAddLayer", () => {
  const ownLayer = {
    id: "layer-1",
    sourceIncidentId: "inc-1",
    sourceIncidentName: "Brand",
    name: "Lage",
    kind: "STANDARD",
    features: [],
  };

  it("shows the layer at once, as the server will answer it", async () => {
    cache = new FakeCache([ownLayer]);
    const mutate = await setupMutation({
      createLayer: { ...ownLayer, id: "real", name: "Neu" },
    });
    const { result } = renderHook(() => useAddLayer());

    await result.current[0]({ incidentId: "inc-1", name: "Neu" });

    const options = mutate.mock.calls[0][0];
    expect(options.optimisticResponse).toMatchObject({
      createLayer: {
        __typename: "Layer",
        sourceIncidentId: "inc-1",
        sourceIncidentName: "Brand",
        name: "Neu",
        kind: "STANDARD",
      },
    });
    expect((options.optimisticResponse as { createLayer: { id: string } }).createLayer.id).toMatch(
      /^pending-layer-/,
    );
  });

  it("adds the answered layer, empty, after the existing ones", async () => {
    cache = new FakeCache([ownLayer]);
    await setupMutation({ createLayer: { ...ownLayer, id: "real", name: "Neu" } });
    const { result } = renderHook(() => useAddLayer());

    const added = await result.current[0]({ incidentId: "inc-1", name: "Neu" });

    expect(added).toEqual({ layerId: "real" });
    const layers = (cache.written as { layersForIncident: { id: string; features: unknown[] }[] })
      .layersForIncident;
    expect(layers.map((l) => l.id)).toEqual(["layer-1", "real"]);
    expect(layers[1].features).toEqual([]);
  });

  it("fails when the server does not return a layer", async () => {
    await setupMutation({ createLayer: null });
    const { result } = renderHook(() => useAddLayer());

    await expect(result.current[0]({ incidentId: "inc-1", name: "Neu" })).rejects.toThrow(
      "Failed to add layer",
    );
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
    // the time given is the feature's time, so the label follows it before the server answers
    expect(options.optimisticResponse).toEqual({
      modifyFeature: {
        id: "a",
        geometry: point,
        properties: { label: "new" },
        placedAt: "2026-01-15T10:00:00.000Z",
      },
    });
  });

  it("does not guess the time of the feature when no time is given", async () => {
    const mutate = await setupMutation({ modifyFeature: feature("a") });
    const { result } = renderHook(() => useModifyFeature());

    await result.current[0]({
      id: "a",
      properties: { label: "new" },
      currentGeometry: point,
      currentProperties: { label: "new" },
      incidentId: "inc-1",
    });

    expect(mutate.mock.calls[0][0].optimisticResponse).toEqual({
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

  it("sends sparse geometry and properties with the effective time of the change", async () => {
    const mutate = await setupMutation({ modifyFeature: feature("a") });
    const { result } = renderHook(() => useModifyFeature());

    await result.current[0]({
      id: "a",
      geometry: point,
      currentGeometry: point,
      currentProperties: {},
      incidentId: "inc-1",
      change: { effectiveAt: new Date("2026-01-15T10:00:00.000Z") },
    });

    expect(mutate.mock.calls[0][0].variables).toEqual({
      id: "a",
      geometry: point,
      properties: undefined,
      change: { effectiveAt: "2026-01-15T10:00:00.000Z" },
    });
  });
});

describe("cleanFeature", () => {
  it("drops the properties the client adds for display, and keeps the rest", () => {
    const cleaned = cleanFeature({
      type: "Feature",
      id: "a",
      geometry: point as never,
      properties: {
        label: "Pumpe",
        createdAt: "x",
        updatedAt: "x",
        deletedAt: "x",
        layerId: "layer-1",
        featureId: "a",
      },
    });

    expect(cleaned).toEqual({
      type: "Feature",
      id: "a",
      geometry: point,
      properties: { label: "Pumpe" },
    });
  });
});

describe("layers result of the time shown", () => {
  const asOf = new Date("2026-01-15T10:00:00.000Z");

  it.each([
    {
      name: "useAddFeature",
      run: (hook: () => unknown) =>
        (hook() as [(a: unknown) => Promise<unknown>])[0]({
          layerId: "layer-1",
          clientKey: "k",
          geometry: point,
          properties: {},
          incidentId: "inc-1",
          asOf,
        }),
      hook: useAddFeature,
      data: { addFeature: feature("n") },
    },
    {
      name: "useDeleteFeature",
      run: (hook: () => unknown) =>
        (hook() as [(a: unknown) => Promise<unknown>])[0]({ id: "a", incidentId: "inc-1", asOf }),
      hook: useDeleteFeature,
      data: { deleteFeature: "a" },
    },
    {
      name: "useRestoreFeature",
      run: (hook: () => unknown) =>
        (hook() as [(a: unknown) => Promise<unknown>])[0]({
          id: "a",
          layerId: "layer-1",
          incidentId: "inc-1",
          current: { geometry: point, properties: {} },
          asOf,
        }),
      hook: useRestoreFeature,
      data: { restoreFeature: feature("a") },
    },
  ])("$name patches the result cached for that point in time", async ({ hook, run, data }) => {
    await setupMutation(data);
    const readQuery = vi.spyOn(cache, "readQuery");
    const { result } = renderHook(() => hook() as never);

    await run(() => result.current);

    expect(readQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { incidentId: "inc-1", asOf: "2026-01-15T10:00:00.000Z" },
      }),
    );
  });
});

describe("when the layers are not cached", () => {
  const uncached = () => {
    vi.spyOn(cache, "readQuery").mockReturnValue(null as never);
  };

  it.each([
    {
      name: "useAddFeature",
      hook: useAddFeature,
      data: { addFeature: feature("n") },
      args: {
        layerId: "layer-1",
        clientKey: "k",
        geometry: point,
        properties: {},
        incidentId: "inc-1",
      },
    },
    {
      name: "useDeleteFeature",
      hook: useDeleteFeature,
      data: { deleteFeature: "a" },
      args: { id: "a", incidentId: "inc-1" },
    },
    {
      name: "useRestoreFeature",
      hook: useRestoreFeature,
      data: { restoreFeature: feature("a") },
      args: {
        id: "a",
        layerId: "layer-1",
        incidentId: "inc-1",
        current: { geometry: point, properties: {} },
      },
    },
  ])("$name writes nothing", async ({ hook, data, args }) => {
    await setupMutation(data);
    uncached();
    const { result } = renderHook(() => hook() as never);

    await (result.current[0] as (a: unknown) => Promise<unknown>)(args);

    expect(cache.written).toBeUndefined();
    expect(cache.evicted).toEqual([]);
  });

  it("useAddLayer writes nothing", async () => {
    await setupMutation({ createLayer: { id: "layer-9", name: "Neu" } });
    uncached();
    const { result } = renderHook(() => useAddLayer());

    await result.current[0]({ incidentId: "inc-1", name: "Neu" });

    expect(cache.written).toBeUndefined();
  });

  it("useAddFeature writes nothing when the server answers no feature", async () => {
    await setupMutation(undefined);
    const { result } = renderHook(() => useAddFeature());

    await result.current[0]({
      layerId: "layer-1",
      clientKey: "k",
      geometry: point,
      properties: {},
      incidentId: "inc-1",
    }).catch(() => undefined);

    expect(cache.written).toBeUndefined();
  });
});

describe("layer command state", () => {
  it.each([
    { name: "useAddFeature", hook: useAddFeature },
    { name: "useModifyFeature", hook: useModifyFeature },
    { name: "useDeleteFeature", hook: useDeleteFeature },
    { name: "useRestoreFeature", hook: useRestoreFeature },
    { name: "useAddLayer", hook: useAddLayer },
  ])("$name reports an ApiError converted from the mutation error", async ({ hook }) => {
    const { useMutation } = await import("@apollo/client/react");
    vi.mocked(useMutation).mockReturnValue([
      vi.fn(),
      {
        loading: true,
        error: graphQlError("MESSAGE_TIME_LOCKED"),
        reset: vi.fn(),
        called: true,
      } as never,
    ]);
    const { result } = renderHook(() => hook());

    expect(result.current[1].loading).toBe(true);
    expect(result.current[1].error).toMatchObject({
      name: "ApiError",
      code: "MESSAGE_TIME_LOCKED",
    });
  });
});

describe("afterLayerWrite", () => {
  it("refetches the layers of the incident, at the time shown when there is one", () => {
    expect(afterLayerWrite("inc-1")).toEqual([
      { query: GET_LAYERS, variables: { incidentId: "inc-1" } },
    ]);
    expect(afterLayerWrite("inc-1", new Date("2026-01-15T10:00:00.000Z"))).toEqual([
      {
        query: GET_LAYERS,
        variables: { incidentId: "inc-1", asOf: "2026-01-15T10:00:00.000Z" },
      },
    ]);
  });
});
