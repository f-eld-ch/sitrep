import { useQuery } from "@apollo/client/react";
import { renderHook } from "@testing-library/react";
import { Medium, PriorityStatus, TriageStatus } from "types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { graphQlError } from "../testing/mutations";
import { useIncidentMessages, useJournalMessages, useMessageForTriage } from "./queries";

vi.mock("@apollo/client/react", () => ({ useQuery: vi.fn() }));

const refetch = vi.fn();

function mockQuery(result: Record<string, unknown>) {
  vi.mocked(useQuery).mockReturnValue({ loading: false, refetch, ...result } as never);
}

const wireDivision = { id: "d-1", name: "Alpha", description: "A", kind: "STANDARD" };

const wireMessage = {
  id: "m-1",
  number: 7,
  sender: "S",
  receiver: "R",
  senderDetail: "",
  receiverDetail: "",
  content: "Fire",
  medium: "PHONE",
  time: "2026-01-01T10:00:00Z",
  createdAt: "2026-01-01T10:00:00Z",
  updatedAt: "2026-01-01T10:00:00Z",
  triage: "DONE",
  priority: "HIGH",
  author: "ann",
  divisions: [wireDivision],
  acknowledgements: [],
  attachments: [],
};

beforeEach(() => {
  refetch.mockReset();
  vi.mocked(useQuery).mockReset();
});

describe("useIncidentMessages", () => {
  const data = { incident: { id: "inc-1", divisions: [wireDivision], messages: [wireMessage] } };

  it("is ready with the mapped messages and divisions", () => {
    mockQuery({ data });
    const { result } = renderHook(() => useIncidentMessages("inc-1"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data?.incidentDivisions).toEqual([
      { id: "d-1", name: "Alpha", description: "A", kind: "STANDARD" },
    ]);
    expect(result.current.data?.messages).toHaveLength(1);
    expect(result.current.data?.messages[0]).toMatchObject({
      id: "m-1",
      number: 7,
      medium: Medium.Phone,
      triageId: TriageStatus.Triaged,
      priorityId: PriorityStatus.High,
      time: new Date("2026-01-01T10:00:00Z"),
    });
  });

  it("returns the same converted data object while the response is unchanged", () => {
    mockQuery({ data });
    const { result, rerender } = renderHook(() => useIncidentMessages("inc-1"));
    const first = result.current.data;

    rerender();

    expect(result.current.data).toBe(first);
  });

  it("is ready and empty when the incident is not in the response", () => {
    mockQuery({ data: { incident: null } });
    const { result } = renderHook(() => useIncidentMessages("inc-1"));

    expect(result.current).toMatchObject({
      status: "ready",
      data: { messages: [], incidentDivisions: [] },
    });
  });

  it("is loading while the first response is pending", () => {
    mockQuery({ loading: true, data: undefined });
    const { result } = renderHook(() => useIncidentMessages("inc-1"));

    expect(result.current).toMatchObject({
      status: "loading",
      data: undefined,
      isRefreshing: false,
    });
  });

  it("is loading without an incident id", () => {
    mockQuery({ data: undefined });
    const { result } = renderHook(() => useIncidentMessages(""));

    expect(result.current.status).toBe("loading");
  });

  it("is ready and refreshing while a background fetch runs", () => {
    mockQuery({ loading: true, data });
    const { result } = renderHook(() => useIncidentMessages("inc-1"));

    expect(result.current).toMatchObject({ status: "ready", isRefreshing: true });
  });

  it("is an error without data when nothing was loaded before", () => {
    mockQuery({ error: graphQlError("FORBIDDEN"), data: undefined });
    const { result } = renderHook(() => useIncidentMessages("inc-1"));

    expect(result.current).toMatchObject({
      status: "error",
      data: undefined,
      error: { name: "ApiError", code: "FORBIDDEN" },
    });
  });

  it("keeps the stale messages next to the error", () => {
    mockQuery({ error: graphQlError("INTERNAL_ERROR"), data });
    const { result } = renderHook(() => useIncidentMessages("inc-1"));

    expect(result.current.status).toBe("error");
    expect(result.current.data?.messages).toHaveLength(1);
  });

  it("refresh refetches", () => {
    mockQuery({ data });
    const { result } = renderHook(() => useIncidentMessages("inc-1"));

    result.current.refresh();

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("polls every 5 seconds by default, pausing while the tab is hidden", () => {
    mockQuery({ data });
    renderHook(() => useIncidentMessages("inc-1"));

    const options = vi.mocked(useQuery).mock.calls[0]![1] as {
      variables: unknown;
      skip: boolean;
      pollInterval: number;
      skipPollAttempt: () => boolean;
    };
    expect(options.variables).toEqual({ incidentId: "inc-1" });
    expect(options.skip).toBeFalsy();
    expect(options.pollInterval).toBe(5000);

    const hidden = vi.spyOn(document, "hidden", "get");
    hidden.mockReturnValue(true);
    expect(options.skipPollAttempt()).toBe(true);
    hidden.mockReturnValue(false);
    expect(options.skipPollAttempt()).toBe(false);
    hidden.mockRestore();
  });

  it.each([
    { name: "no incident id", id: "", options: {}, skip: true },
    { name: "skip option", id: "inc-1", options: { skip: true }, skip: true },
    { name: "id and no skip", id: "inc-1", options: {}, skip: false },
  ])("passes skip=$skip for $name", ({ id, options, skip }) => {
    mockQuery({ data: undefined });
    renderHook(() => useIncidentMessages(id, options));

    expect(Boolean((vi.mocked(useQuery).mock.calls[0]![1] as { skip?: boolean }).skip)).toBe(skip);
  });

  it("uses the given poll interval", () => {
    mockQuery({ data });
    renderHook(() => useIncidentMessages("inc-1", { pollInterval: 1234 }));

    expect(vi.mocked(useQuery).mock.calls[0]![1]).toMatchObject({ pollInterval: 1234 });
  });
});

describe("useJournalMessages", () => {
  it("is the deprecated alias of useIncidentMessages with the default options", () => {
    mockQuery({
      data: { incident: { id: "inc-1", divisions: [], messages: [wireMessage] } },
    });
    const { result } = renderHook(() => useJournalMessages("inc-1"));

    expect(result.current.data?.messages).toHaveLength(1);
    expect(vi.mocked(useQuery).mock.calls[0]![1]).toMatchObject({
      variables: { incidentId: "inc-1" },
      pollInterval: 5000,
    });
  });
});

describe("useMessageForTriage", () => {
  const data = {
    message: {
      ...wireMessage,
      linkedResourceIds: ["r-1"],
      schadenplatzCasualties: [
        {
          schadenplatzId: "s-1",
          vermisste: 1,
          tote: 2,
          verletzte: 3,
          obdachlose: 4,
          eingeschlossene: 5,
        },
      ],
    },
    incident: { divisions: [wireDivision] },
  };

  it("is ready with the message, divisions, linked resources and casualties", () => {
    mockQuery({ data });
    const { result } = renderHook(() => useMessageForTriage("m-1", "inc-1"));

    expect(result.current.status).toBe("ready");
    expect(result.current.data).toMatchObject({
      message: { id: "m-1", content: "Fire" },
      incidentDivisions: [{ id: "d-1", name: "Alpha", description: "A", kind: "STANDARD" }],
      linkedResourceIds: ["r-1"],
      schadenplatzCasualties: data.message.schadenplatzCasualties,
    });
  });

  it("defaults the divisions, linked resources and casualties when they are absent", () => {
    mockQuery({
      data: {
        message: { ...wireMessage, linkedResourceIds: null, schadenplatzCasualties: null },
        incident: null,
      },
    });
    const { result } = renderHook(() => useMessageForTriage("m-1"));

    expect(result.current.data).toMatchObject({
      incidentDivisions: [],
      linkedResourceIds: [],
      schadenplatzCasualties: [],
    });
  });

  it("is an error with code NOT_FOUND when the message does not exist", () => {
    mockQuery({ data: { message: null, incident: null } });
    const { result } = renderHook(() => useMessageForTriage("m-1"));

    expect(result.current).toMatchObject({
      status: "error",
      data: undefined,
      error: { code: "NOT_FOUND" },
    });
  });

  it("is an error with an ApiError when the request failed", () => {
    mockQuery({ error: graphQlError("FORBIDDEN"), data: undefined });
    const { result } = renderHook(() => useMessageForTriage("m-1"));

    expect(result.current).toMatchObject({
      status: "error",
      data: undefined,
      error: { name: "ApiError", code: "FORBIDDEN" },
    });
  });

  it("is loading while the first response is pending", () => {
    mockQuery({ loading: true, data: undefined });
    const { result } = renderHook(() => useMessageForTriage("m-1"));

    expect(result.current.status).toBe("loading");
  });

  it("is ready and refreshing while cache-and-network refetches", () => {
    mockQuery({ loading: true, data });
    const { result } = renderHook(() => useMessageForTriage("m-1"));

    expect(result.current).toMatchObject({ status: "ready", isRefreshing: true });
  });

  it("is loading and skips the query without a message id", () => {
    mockQuery({ data: undefined });
    const { result } = renderHook(() => useMessageForTriage(undefined, "inc-1"));

    expect(result.current.status).toBe("loading");
    expect(vi.mocked(useQuery).mock.calls[0]![1]).toMatchObject({
      variables: { messageId: "", incidentId: "inc-1" },
      skip: true,
    });
  });

  it("queries cache-and-network with a 10 second poll and empty incident id by default", () => {
    mockQuery({ data });
    renderHook(() => useMessageForTriage("m-1"));

    expect(vi.mocked(useQuery).mock.calls[0]![1]).toEqual({
      variables: { messageId: "m-1", incidentId: "" },
      skip: false,
      fetchPolicy: "cache-and-network",
      pollInterval: 10000,
    });
  });

  it("refresh refetches", () => {
    mockQuery({ data });
    const { result } = renderHook(() => useMessageForTriage("m-1"));

    result.current.refresh();

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
