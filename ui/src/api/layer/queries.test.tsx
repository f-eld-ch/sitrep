import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useFeatureChangeTimes,
  useFeatureMessages,
  useLayersForIncident,
  useMessageFeatureHalos,
} from "./queries";

vi.mock("@apollo/client/react", () => ({ useQuery: vi.fn() }));

const refetch = vi.fn();

async function mockQuery(result: Record<string, unknown>) {
  const { useQuery } = await import("@apollo/client/react");
  vi.mocked(useQuery).mockReturnValue({ loading: false, refetch, ...result } as never);

  return vi.mocked(useQuery);
}

const point = { type: "Point", coordinates: [8, 47] };
const change = (
  featureId: string,
  kind: string,
  effectiveAt: string,
  messageId: string | null,
  geometry: unknown = null,
) => ({
  featureId,
  change: kind,
  effectiveAt,
  recordedAt: effectiveAt,
  messageId,
  geometry,
  properties: null,
});

beforeEach(() => {
  refetch.mockClear();
});

describe("useMessageFeatureHalos", () => {
  it("says what the message did to each feature", async () => {
    await mockQuery({
      data: {
        featureChanges: [
          change("a", "PLACED", "2026-01-15T10:00:00Z", "m1", point),
          change("b", "PLACED", "2026-01-15T09:00:00Z", "m0", point),
          change("b", "REMOVED", "2026-01-15T10:00:00Z", "m1"),
        ],
      },
    });

    const { result } = renderHook(() => useMessageFeatureHalos("inc-1", "m1", "key"));

    expect(result.current.ready).toBe(true);
    expect(result.current.halos.get("a")?.kind).toBe("added");
    expect(result.current.halos.get("b")?.kind).toBe("removed");
  });

  it("is not ready, and has no halos, before the history is loaded", async () => {
    await mockQuery({ data: undefined, loading: true });

    const { result } = renderHook(() => useMessageFeatureHalos("inc-1", "m1", "key"));

    expect(result.current.ready).toBe(false);
    expect(result.current.halos.size).toBe(0);
  });

  it("does not ask without a message", async () => {
    const useQuery = await mockQuery({ data: undefined });

    const { result } = renderHook(() => useMessageFeatureHalos("inc-1", undefined, "key"));

    expect(useQuery.mock.calls[0][1]).toMatchObject({ skip: true });
    expect(result.current.halos.size).toBe(0);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("reads the history again whenever the map's features change", async () => {
    await mockQuery({ data: { featureChanges: [] } });

    const { rerender } = renderHook(({ key }) => useMessageFeatureHalos("inc-1", "m1", key), {
      initialProps: { key: "a" },
    });
    expect(refetch).toHaveBeenCalledTimes(1);

    rerender({ key: "a" });
    expect(refetch).toHaveBeenCalledTimes(1);

    rerender({ key: "a,b" });
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});

describe("useFeatureChangeTimes", () => {
  it("lists each point in time once, across all layers", async () => {
    await mockQuery({
      data: {
        featureChanges: [
          change("a", "PLACED", "2026-01-15T10:00:00Z", "m1"),
          change("b", "PLACED", "2026-01-15T10:00:00Z", "m1"),
          change("a", "MOVED", "2026-01-15T11:00:00Z", null),
        ],
      },
    });

    const { result } = renderHook(() => useFeatureChangeTimes("inc-1"));

    expect(result.current).toEqual([
      new Date("2026-01-15T10:00:00Z").getTime(),
      new Date("2026-01-15T11:00:00Z").getTime(),
    ]);
  });

  it("is empty until the changes are loaded", async () => {
    await mockQuery({ data: undefined });

    expect(renderHook(() => useFeatureChangeTimes("inc-1")).result.current).toEqual([]);
  });

  it("polls only when asked to, and not while the tab is hidden", async () => {
    const useQuery = await mockQuery({ data: undefined });

    renderHook(() => useFeatureChangeTimes("inc-1", { pollInterval: 10_000 }));

    const options = useQuery.mock.calls[0][1] as {
      pollInterval?: number;
      skipPollAttempt: () => boolean;
    };
    expect(options.pollInterval).toBe(10_000);

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    expect(options.skipPollAttempt()).toBe(true);
  });
});

describe("useLayersForIncident", () => {
  const wireLayer = {
    id: "layer-1",
    sourceIncidentId: "inc-1",
    sourceIncidentName: "Incident",
    name: "Lage",
    kind: "STANDARD",
    revision: 1,
    features: [{ id: "a", geometry: point, properties: {} }],
  };

  it("maps the layers once loaded", async () => {
    await mockQuery({ data: { layersForIncident: [wireLayer] } });

    const { result } = renderHook(() => useLayersForIncident("inc-1"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data?.layers[0].features).toHaveLength(1);
  });

  it("asks for the state at a point in time, and skips without an incident", async () => {
    const useQuery = await mockQuery({ data: undefined, loading: true });

    renderHook(() => useLayersForIncident(undefined, new Date("2026-01-15T10:00:00.000Z")));

    expect(useQuery.mock.calls[0][1]).toMatchObject({
      skip: true,
      variables: { incidentId: "", asOf: "2026-01-15T10:00:00.000Z" },
    });
  });

  it("is loading before the first answer", async () => {
    await mockQuery({ data: undefined, loading: true });

    expect(renderHook(() => useLayersForIncident("inc-1")).result.current.status).toBe("loading");
  });

  it("keeps the layers it has when a refresh fails", async () => {
    await mockQuery({
      data: { layersForIncident: [wireLayer] },
      error: Object.assign(new Error("network"), { name: "ApolloError" }),
    });

    const { result } = renderHook(() => useLayersForIncident("inc-1"));

    expect(result.current.status).toBe("error");
    expect(result.current.data?.layers).toHaveLength(1);
  });
});

describe("useFeatureMessages", () => {
  it("maps the messages connected to a feature", async () => {
    await mockQuery({
      data: {
        featureMessages: [
          {
            id: "m1",
            number: 7,
            sender: "A",
            receiver: "B",
            content: "text",
            time: "2026-01-15T10:00:00Z",
          },
        ],
      },
    });

    const { result } = renderHook(() => useFeatureMessages("f1"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data?.messages[0]).toMatchObject({ id: "m1", number: 7 });
  });

  it("does not ask while nothing is selected", async () => {
    const useQuery = await mockQuery({ data: undefined });

    renderHook(() => useFeatureMessages(undefined));

    expect(useQuery.mock.calls[0][1]).toMatchObject({ skip: true });
  });
});
