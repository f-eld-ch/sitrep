import type { InMemoryCache } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { act, renderHook } from "@testing-library/react";
import { Medium, PriorityStatus, TriageStatus } from "types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors";
import { graphQlError, mockMutation, mutateOptions, newCache } from "../testing/mutations";
import {
  useAcknowledgeMessage,
  useCreateMessage,
  useRemoveAttachment,
  useRevokeMessageAcknowledgement,
  useTriageMessage,
  useUpdateMessage,
  useUploadAttachment,
} from "./commands";
import { GET_INCIDENT_MESSAGES } from "./documents";

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
  useApolloClient: vi.fn(),
}));

const division = (id: string) => ({
  id,
  name: `Div ${id}`,
  description: "",
  kind: "STANDARD" as const,
});

const attachment = (id: string) => ({
  id,
  filename: `${id}.jpg`,
  contentType: "image/jpeg",
  size: 10,
  createdAt: "2026-01-01T00:00:00Z",
  uploadedBy: "u-1",
  url: `/a/${id}`,
});

function wireMessage(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    number: 1,
    sender: "S",
    receiver: "R",
    senderDetail: "",
    receiverDetail: "",
    content: "c",
    medium: "RADIO" as const,
    time: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    triage: "PENDING" as const,
    priority: "NORMAL" as const,
    author: null,
    divisions: [],
    acknowledgements: [],
    attachments: [],
    ...overrides,
  };
}

type WireMessage = ReturnType<typeof wireMessage>;

function seedMessages(
  cache: InMemoryCache,
  messages: WireMessage[],
  divisions = [division("d-1"), division("d-2")],
) {
  cache.writeQuery({
    query: GET_INCIDENT_MESSAGES,
    variables: { incidentId: "inc-1" },
    data: { incident: { id: "inc-1", divisions, messages } as never },
  });
}

function readMessages(cache: InMemoryCache) {
  return cache.readQuery({ query: GET_INCIDENT_MESSAGES, variables: { incidentId: "inc-1" } })
    ?.incident?.messages;
}

beforeEach(() => {
  vi.mocked(useApolloClient).mockReset();
});

describe("useCreateMessage", () => {
  const args = {
    incidentId: "inc-1",
    sender: "Alpha",
    receiver: "HQ",
    senderDetail: "Rm 4",
    receiverDetail: "Rm 1",
    content: "Fire",
    medium: Medium.Radio,
    time: new Date("2026-03-01T10:00:00Z"),
  };

  it("sends every field with the time as an ISO string and returns the new id", async () => {
    const mutate = await mockMutation({ resolved: { data: { createMessage: { id: "m-9" } } } });
    const { result } = renderHook(() => useCreateMessage());

    await expect(result.current[0](args)).resolves.toBe("m-9");

    expect(mutateOptions(mutate).variables).toEqual({
      incidentId: "inc-1",
      sender: "Alpha",
      receiver: "HQ",
      senderDetail: "Rm 4",
      receiverDetail: "Rm 1",
      content: "Fire",
      medium: Medium.Radio,
      time: "2026-03-01T10:00:00.000Z",
    });
  });

  it("returns an empty id when the response carries none", async () => {
    await mockMutation({ resolved: { data: undefined } });
    const { result } = renderHook(() => useCreateMessage());

    await expect(result.current[0](args)).resolves.toBe("");
  });

  it("appends the created message, without attachments, to the cached incident messages", async () => {
    const mutate = await mockMutation({ resolved: { data: { createMessage: { id: "m-9" } } } });
    const { result } = renderHook(() => useCreateMessage());
    await result.current[0](args);
    const cache = newCache();
    seedMessages(cache, [wireMessage("m-1")]);

    mutateOptions(mutate).update?.(cache, {
      data: { createMessage: wireMessage("m-9", { attachments: undefined }) },
    });

    expect(readMessages(cache)?.map((m) => m.id)).toEqual(["m-1", "m-9"]);
    expect(readMessages(cache)?.[1]?.attachments).toEqual([]);
  });

  it("leaves the cache alone when the incident is not cached or the response is empty", async () => {
    const mutate = await mockMutation({ resolved: { data: { createMessage: { id: "m-9" } } } });
    const { result } = renderHook(() => useCreateMessage());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, { data: { createMessage: wireMessage("m-9") } });
    expect(readMessages(cache)).toBeUndefined();

    seedMessages(cache, [wireMessage("m-1")]);
    mutateOptions(mutate).update?.(cache, { data: undefined });
    expect(readMessages(cache)?.map((m) => m.id)).toEqual(["m-1"]);
  });
});

describe("useUpdateMessage", () => {
  it("sends the message id as id and the time as an ISO string", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useUpdateMessage());

    await result.current[0]({
      incidentId: "inc-1",
      messageId: "m-1",
      sender: "Alpha",
      receiver: "HQ",
      senderDetail: "",
      receiverDetail: "",
      content: "Updated",
      medium: Medium.Phone,
      time: new Date("2026-03-01T10:00:00Z"),
    });

    expect(mutate).toHaveBeenCalledWith({
      variables: {
        id: "m-1",
        sender: "Alpha",
        receiver: "HQ",
        senderDetail: "",
        receiverDetail: "",
        content: "Updated",
        medium: Medium.Phone,
        time: "2026-03-01T10:00:00.000Z",
      },
    });
  });
});

describe("useTriageMessage", () => {
  const args = {
    incidentId: "inc-1",
    messageId: "m-1",
    priority: PriorityStatus.High,
    triage: TriageStatus.Triaged,
    divisionIds: ["d-1"],
    divisions: [division("d-1")],
    linkedResourceIds: ["r-1"],
  };

  it("sends the triage decision with the ids", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useTriageMessage());

    await result.current[0](args);

    expect(mutateOptions(mutate).variables).toEqual({
      id: "m-1",
      priority: PriorityStatus.High,
      triage: TriageStatus.Triaged,
      divisionIds: ["d-1"],
      linkedResourceIds: ["r-1"],
    });
  });

  it("optimistically shows the chosen priority and divisions with no acknowledgements", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useTriageMessage());

    await result.current[0](args);

    expect(mutateOptions(mutate).optimisticResponse).toEqual({
      triageMessage: {
        id: "m-1",
        triage: TriageStatus.Triaged,
        priority: PriorityStatus.High,
        divisions: [division("d-1")],
        acknowledgements: [],
        linkedResourceIds: ["r-1"],
      },
    });
  });

  it("optimistically resets the priority to normal when more information is requested", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useTriageMessage());

    await result.current[0]({ ...args, triage: TriageStatus.MoreInfo });

    expect(mutateOptions(mutate).optimisticResponse).toMatchObject({
      triageMessage: { triage: TriageStatus.MoreInfo, priority: PriorityStatus.Normal },
    });
  });

  it("merges the response into the cached message and leaves the others", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useTriageMessage());
    await result.current[0](args);
    const cache = newCache();
    seedMessages(cache, [wireMessage("m-1"), wireMessage("m-2")]);

    mutateOptions(mutate).update?.(cache, {
      data: {
        triageMessage: {
          id: "m-1",
          triage: "DONE",
          priority: "HIGH",
          divisions: [division("d-1")],
          acknowledgements: [],
        },
      },
    });

    const messages = readMessages(cache);
    expect(messages?.[0]).toMatchObject({
      id: "m-1",
      triage: "DONE",
      priority: "HIGH",
      divisions: [division("d-1")],
    });
    expect(messages?.[1]).toMatchObject({ id: "m-2", triage: "PENDING", priority: "NORMAL" });
  });

  it("falls back to the incident's cached divisions when the response lists none", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useTriageMessage());
    await result.current[0]({ ...args, divisionIds: ["d-2"] });
    const cache = newCache();
    seedMessages(cache, [wireMessage("m-1")]);

    mutateOptions(mutate).update?.(cache, {
      data: {
        triageMessage: {
          id: "m-1",
          triage: "DONE",
          priority: "HIGH",
          divisions: [],
          acknowledgements: [],
        },
      },
    });

    expect(readMessages(cache)?.[0]?.divisions).toEqual([division("d-2")]);
  });

  it("leaves the cache alone when the incident is not cached or the response is empty", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useTriageMessage());
    await result.current[0](args);
    const cache = newCache();
    const response = {
      triageMessage: {
        id: "m-1",
        triage: "DONE",
        priority: "HIGH",
        divisions: [],
        acknowledgements: [],
      },
    };

    mutateOptions(mutate).update?.(cache, { data: response });
    expect(readMessages(cache)).toBeUndefined();

    seedMessages(cache, [wireMessage("m-1")]);
    mutateOptions(mutate).update?.(cache, { data: undefined });
    expect(readMessages(cache)?.[0]?.triage).toBe("PENDING");
  });
});

describe("message acknowledgement commands", () => {
  it.each([
    { name: "useAcknowledgeMessage", hook: useAcknowledgeMessage },
    { name: "useRevokeMessageAcknowledgement", hook: useRevokeMessageAcknowledgement },
  ])("$name sends the message id as id together with the division", async ({ hook }) => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => hook());

    await result.current[0]({ messageId: "m-1", divisionId: "d-1" });

    expect(mutate).toHaveBeenCalledWith({ variables: { id: "m-1", divisionId: "d-1" } });
  });
});

describe("a rejected command", () => {
  it.each([
    { name: "useAcknowledgeMessage", hook: useAcknowledgeMessage },
    { name: "useRevokeMessageAcknowledgement", hook: useRevokeMessageAcknowledgement },
  ])("$name rejects with an ApiError carrying the server's code", async ({ hook }) => {
    await mockMutation({ rejection: graphQlError("NOT_TRIAGED_TO_DIVISION") });
    const { result } = renderHook(() => hook());

    const error = await result.current[0]({ messageId: "m-1", divisionId: "d-1" }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_TRIAGED_TO_DIVISION" });
  });
});

describe("useRemoveAttachment", () => {
  const args = { incidentId: "inc-1", messageId: "m-1", attachmentId: "a-1" };

  it("sends the ids with an optimistic response", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRemoveAttachment());

    await result.current[0](args);

    expect(mutateOptions(mutate).variables).toEqual({ messageId: "m-1", attachmentId: "a-1" });
    expect(mutateOptions(mutate).optimisticResponse).toEqual({ removeAttachment: "a-1" });
  });

  it("drops the attachment from that message only", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRemoveAttachment());
    await result.current[0](args);
    const cache = newCache();
    seedMessages(cache, [
      wireMessage("m-1", { attachments: [attachment("a-1"), attachment("a-2")] }),
      wireMessage("m-2", { attachments: [attachment("a-1")] }),
    ]);

    mutateOptions(mutate).update?.(cache, {});

    const messages = readMessages(cache);
    expect(messages?.[0]?.attachments.map((a) => a.id)).toEqual(["a-2"]);
    expect(messages?.[1]?.attachments.map((a) => a.id)).toEqual(["a-1"]);
  });

  it("leaves an uncached incident alone", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRemoveAttachment());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, {});

    expect(readMessages(cache)).toBeUndefined();
  });
});

describe("command state", () => {
  it("reports an ApiError converted from the mutation error", async () => {
    const { useMutation } = await import("@apollo/client/react");
    vi.mocked(useMutation).mockReturnValue([
      vi.fn(),
      { loading: true, error: graphQlError("FORBIDDEN"), reset: vi.fn(), called: true } as never,
    ]);
    const { result } = renderHook(() => useAcknowledgeMessage());

    expect(result.current[1].loading).toBe(true);
    expect(result.current[1].error).toMatchObject({ name: "ApiError", code: "FORBIDDEN" });
  });
});

describe("useUploadAttachment", () => {
  const args = {
    incidentId: "inc-1",
    messageId: "m-1",
    file: new File(["x"], "photo.jpg", { type: "image/jpeg" }),
  };
  const wireResponse = {
    ID: "a-9",
    Filename: "photo.jpg",
    ContentType: "image/jpeg",
    Size: 1,
    CreatedAt: "2026-03-01T10:00:00Z",
    UploaderSub: "u-1",
    URL: "/api/v2/attachments/a-9",
  };
  const fetchMock = vi.fn();
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = newCache();
    vi.mocked(useApolloClient).mockReturnValue(cache as never);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, body: unknown) {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }

  it("posts the file as multipart form data with credentials and the upload header", async () => {
    respond(200, wireResponse);
    const { result } = renderHook(() => useUploadAttachment());

    await act(async () => {
      await result.current[0](args);
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v2/messages/m-1/attachments");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { "X-Sitrep-Upload": "1" },
    });
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(((init.body as FormData).get("file") as File).name).toBe("photo.jpg");
  });

  it("maps the response to an Attachment", async () => {
    respond(200, wireResponse);
    const { result } = renderHook(() => useUploadAttachment());

    let uploaded: unknown;
    await act(async () => {
      uploaded = await result.current[0](args);
    });

    expect(uploaded).toEqual({
      id: "a-9",
      filename: "photo.jpg",
      contentType: "image/jpeg",
      size: 1,
      createdAt: new Date("2026-03-01T10:00:00Z"),
      uploadedBy: "u-1",
      url: "/api/v2/attachments/a-9",
    });
    expect(result.current[1]).toEqual({ loading: false, error: undefined });
  });

  it("adds the attachment to that message in the cache", async () => {
    respond(200, wireResponse);
    seedMessages(cache, [wireMessage("m-1"), wireMessage("m-2")]);
    const { result } = renderHook(() => useUploadAttachment());

    await act(async () => {
      await result.current[0](args);
    });

    const messages = readMessages(cache);
    expect(messages?.[0]?.attachments).toEqual([
      {
        id: "a-9",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        size: 1,
        createdAt: "2026-03-01T10:00:00.000Z",
        uploadedBy: "u-1",
        url: "/api/v2/attachments/a-9",
      },
    ]);
    expect(messages?.[1]?.attachments).toEqual([]);
  });

  it("still succeeds when the incident's messages are not cached", async () => {
    respond(200, wireResponse);
    const { result } = renderHook(() => useUploadAttachment());

    await act(async () => {
      await expect(result.current[0](args)).resolves.toMatchObject({ id: "a-9" });
    });

    expect(readMessages(cache)).toBeUndefined();
  });

  it.each([
    { status: 413, body: {}, code: "ATTACHMENT_TOO_LARGE", detail: undefined },
    { status: 501, body: {}, code: "ATTACHMENT_DISABLED", detail: undefined },
    { status: 400, body: { error: "bad file" }, code: "UNKNOWN", detail: "bad file" },
    { status: 500, body: {}, code: "UNKNOWN", detail: "upload failed: 500" },
  ])("rejects a $status response with $code", async ({ status, body, code, detail }) => {
    respond(status, body);
    const { result } = renderHook(() => useUploadAttachment());

    await act(async () => {
      await expect(result.current[0](args)).rejects.toMatchObject({ code, detail });
    });

    expect(result.current[1].error).toBeInstanceOf(ApiError);
    expect(result.current[1].error?.code).toBe(code);
    expect(result.current[1].loading).toBe(false);
  });

  it("tolerates an error response whose body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError("not json")),
    });
    const { result } = renderHook(() => useUploadAttachment());

    await act(async () => {
      await expect(result.current[0](args)).rejects.toMatchObject({
        code: "UNKNOWN",
        detail: "upload failed: 502",
      });
    });
  });

  it("reports a network failure as UNKNOWN and rethrows the original error", async () => {
    const failure = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValue(failure);
    const { result } = renderHook(() => useUploadAttachment());

    await act(async () => {
      await expect(result.current[0](args)).rejects.toBe(failure);
    });

    expect(result.current[1].error?.code).toBe("UNKNOWN");
  });

  it("clears the previous error when a new upload starts", async () => {
    respond(413, {});
    const { result } = renderHook(() => useUploadAttachment());
    await act(async () => {
      await result.current[0](args).catch(() => undefined);
    });
    expect(result.current[1].error?.code).toBe("ATTACHMENT_TOO_LARGE");

    respond(200, wireResponse);
    await act(async () => {
      await result.current[0](args);
    });

    expect(result.current[1].error).toBeUndefined();
  });
});
