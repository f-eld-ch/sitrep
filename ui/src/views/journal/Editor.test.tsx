import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { ApiError } from "api";
import { readyResult } from "api/testing/results";
import { IncidentContext } from "utils";
import {
  Medium,
  PriorityStatus,
  TriageStatus,
  type Attachment,
  type Incident,
  type Message,
} from "types";
import Editor, { MessageEditorForm, type MessageEditorFormHandle } from "./Editor";

// The real locale file, so a missing translation fails the test.
function lookup(key: string | string[]): string {
  for (const k of Array.isArray(key) ? key : [key]) {
    const value = k
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
    if (typeof value === "string") return value;
  }
  return Array.isArray(key) ? key[0] : key;
}
const t = lookup;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language: "de" } }),
}));

// The markdown editor is a third-party widget; a textarea over the same editor state stands in.
vi.mock("./MarkdownEditor", async () => {
  const { useEditorContext } = await import("./editorState");
  return {
    ReactEditor: ({ id }: { id?: string }) => {
      const { state, dispatch } = useEditorContext();
      return (
        <textarea
          id={id}
          value={state.content}
          onChange={(e) => dispatch({ type: "set_content", content: e.target.value })}
        />
      );
    },
  };
});

const api = vi.hoisted(() => ({
  useIncidentMessages: vi.fn(),
  useIncidentDetails: vi.fn(),
  useCreateMessage: vi.fn(),
  useUpdateMessage: vi.fn(),
  useUploadAttachment: vi.fn(),
  useRemoveAttachment: vi.fn(),
}));
vi.mock("api", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    number: 7,
    content: "Brücke gesperrt",
    sender: "Alice",
    senderDetail: "K1",
    receiver: "Bob",
    receiverDetail: "K1",
    time: new Date("2026-01-15T10:00:00"),
    createdAt: new Date("2026-01-15T10:00:00Z"),
    updatedAt: new Date("2026-01-15T10:00:00Z"),
    deletedAt: new Date(0),
    divisions: [],
    medium: Medium.Radio,
    triageId: TriageStatus.Pending,
    priorityId: PriorityStatus.Normal,
    attachments: [],
    acknowledgements: [],
    author: "",
    ...overrides,
  };
}

const createMessage = vi.fn();
const updateMessage = vi.fn();
const uploadAttachment = vi.fn();
const removeAttachment = vi.fn();
let createState: { loading: boolean; error: ApiError | undefined };

function renderEditor({
  incident = null as Partial<Incident> | null,
  messages = [] as Message[],
} = {}) {
  api.useIncidentMessages.mockReturnValue(readyResult({ messages, incidentDivisions: [] }));
  const router = createMemoryRouter(
    [
      {
        path: "/incident/:incidentId/journal/edit",
        element: (
          <IncidentContext.Provider
            value={{
              state: { incident: incident as Incident | null, loadedForId: "i1" },
              dispatch: () => null,
            }}
          >
            <Editor />
          </IncidentContext.Provider>
        ),
      },
      { path: "/incident/:incidentId/journal/messages", element: <p>message list page</p> },
    ],
    { initialEntries: ["/incident/i1/journal/edit"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const field = (label: string) => screen.getByLabelText(label);
const saveButton = () => screen.getByRole("button", { name: t("save") });

function fillRadioMessage() {
  fireEvent.change(field(t("message.sender")), { target: { value: "Alice" } });
  fireEvent.change(field(t("message.receiver")), { target: { value: "Bob" } });
  fireEvent.change(field(t("message.content")), { target: { value: "Brücke gesperrt" } });
}

function mockCommandHooks() {
  api.useCreateMessage.mockImplementation(() => [createMessage, createState]);
  api.useUpdateMessage.mockImplementation(() => [
    updateMessage,
    { loading: false, error: undefined },
  ]);
  api.useUploadAttachment.mockImplementation(() => [
    uploadAttachment,
    { loading: false, error: undefined },
  ]);
  api.useRemoveAttachment.mockImplementation(() => [
    removeAttachment,
    { loading: false, error: undefined },
  ]);
}

describe("Editor", () => {
  beforeEach(() => {
    createState = { loading: false, error: undefined };
    createMessage.mockReset().mockResolvedValue("new-1");
    updateMessage.mockReset().mockResolvedValue(undefined);
    uploadAttachment.mockReset().mockResolvedValue(undefined);
    removeAttachment.mockReset().mockResolvedValue(undefined);
    mockCommandHooks();
    api.useIncidentDetails.mockReturnValue(readyResult({ incident: { name: "Hochwasser" } }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts empty with saving disabled", () => {
    renderEditor();

    expect(screen.getByRole("heading", { level: 1, name: t("editor") })).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText(t("preview"))).not.toBeInTheDocument();
  });

  it("explains that a closed incident cannot be edited and offers no form", () => {
    renderEditor({ incident: { closedAt: new Date() } });

    expect(screen.getByText(t("incidentClosedNoEdits"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("save") })).not.toBeInTheDocument();
  });

  it("keeps saving disabled until sender, receiver and content are filled", () => {
    renderEditor();

    fireEvent.change(field(t("message.sender")), { target: { value: "Alice" } });
    fireEvent.change(field(t("message.receiver")), { target: { value: "Bob" } });
    expect(saveButton()).toBeDisabled();

    fireEvent.change(field(t("message.content")), { target: { value: "Lage ruhig" } });
    expect(saveButton()).toBeEnabled();
  });

  it("rejects a time more than five minutes in the future", () => {
    renderEditor();
    fillRadioMessage();

    fireEvent.change(field(t("message.time")), { target: { value: "2099-01-01T10:00" } });

    expect(screen.getByRole("alert")).toHaveTextContent(t("messageTimeTooFarInFuture"));
    expect(saveButton()).toBeDisabled();
  });

  it("shows a preview of what is typed, with the content following after the debounce", () => {
    vi.useFakeTimers();
    renderEditor();

    fireEvent.change(field(t("message.sender")), { target: { value: "Alice" } });
    fireEvent.change(field(t("message.content")), { target: { value: "Brücke gesperrt" } });

    const preview = screen.getByText(t("preview")).parentElement as HTMLElement;
    expect(within(preview).getByTestId("sender-")).toBeInTheDocument();
    expect(within(preview).getByTestId("content-")).not.toHaveTextContent("Brücke gesperrt");

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(within(preview).getByTestId("content-")).toHaveTextContent("Brücke gesperrt");
  });

  it("creates a radio message with the channel as detail on both sides, then clears the form", async () => {
    renderEditor();
    fireEvent.change(field(t("radioChannel")), { target: { value: "K7" } });
    fillRadioMessage();
    fireEvent.change(field(t("message.time")), { target: { value: "2026-01-15T10:30" } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(createMessage).toHaveBeenCalledTimes(1));
    expect(createMessage).toHaveBeenCalledWith({
      incidentId: "i1",
      time: new Date("2026-01-15T10:30"),
      content: "Brücke gesperrt",
      medium: Medium.Radio,
      sender: "Alice",
      senderDetail: "K7",
      receiver: "Bob",
      receiverDetail: "K7",
    });
    await waitFor(() => expect(field(t("message.sender"))).toHaveValue(""));
    expect(field(t("message.content"))).toHaveValue("");
    expect(updateMessage).not.toHaveBeenCalled();
  });

  it("creates an email message with the typed addresses", async () => {
    renderEditor();
    fireEvent.change(field(t("mediumName")), { target: { value: Medium.Email } });

    fireEvent.change(field(t("email.sender")), { target: { value: "Alice" } });
    fireEvent.change(field(t("email.receiver")), { target: { value: "Bob" } });
    fireEvent.change(field(t("message.content")), { target: { value: "Bericht" } });
    // an email needs the addresses of both sides
    expect(saveButton()).toBeDisabled();
    const [senderAddress, receiverAddress] = screen.getAllByLabelText(t("emailAddress"));
    fireEvent.change(senderAddress, { target: { value: "a@example.org" } });
    fireEvent.change(receiverAddress, { target: { value: "b@example.org" } });
    expect(saveButton()).toBeEnabled();

    fireEvent.submit(saveButton().closest("form") as HTMLFormElement);

    await waitFor(() => expect(createMessage).toHaveBeenCalledTimes(1));
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        medium: Medium.Email,
        sender: "Alice",
        senderDetail: "a@example.org",
        receiver: "Bob",
        receiverDetail: "b@example.org",
      }),
    );
  });

  it("ignores a second submit while the first save is still running", async () => {
    let finish: (id: string) => void = () => {};
    createMessage.mockReturnValue(new Promise<string>((resolve) => (finish = resolve)));
    renderEditor();
    fillRadioMessage();
    const form = saveButton().closest("form") as HTMLFormElement;

    fireEvent.submit(form);
    fireEvent.submit(form);
    await act(async () => finish("new-1"));

    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it("uploads the attachments chosen before the message existed to the new message", async () => {
    renderEditor();
    fillRadioMessage();
    const file = new File(["x"], "foto.png", { type: "image/png" });

    fireEvent.change(field(t("message.attachments.add")), { target: { files: [file] } });
    expect(await screen.findByText("foto.png")).toBeInTheDocument();
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(uploadAttachment).toHaveBeenCalledWith({
        incidentId: "i1",
        messageId: "new-1",
        file,
      }),
    );
    await waitFor(() => expect(screen.queryByText("foto.png")).not.toBeInTheDocument());
  });

  it("can drop a pending attachment again", async () => {
    renderEditor();
    const file = new File(["x"], "foto.png", { type: "image/png" });
    fireEvent.change(field(t("message.attachments.add")), { target: { files: [file] } });
    await screen.findByText("foto.png");

    fireEvent.click(screen.getByRole("button", { name: t("message.attachments.remove") }));

    expect(screen.queryByText("foto.png")).not.toBeInTheDocument();
  });

  it("retries a message whose upload failed as an edit instead of creating it twice", async () => {
    uploadAttachment.mockRejectedValue(new ApiError("INTERNAL_ERROR"));
    renderEditor();
    fillRadioMessage();
    fireEvent.change(field(t("message.attachments.add")), {
      target: { files: [new File(["x"], "foto.png", { type: "image/png" })] },
    });
    await screen.findByText("foto.png");
    fireEvent.click(saveButton());
    await waitFor(() => expect(uploadAttachment).toHaveBeenCalled());
    // the form was not cleared
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(field(t("message.sender"))).toHaveValue("Alice");

    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMessage).toHaveBeenCalledTimes(1));
    expect(updateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ incidentId: "i1", messageId: "new-1", sender: "Alice" }),
    );
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps what was typed and shows the error when saving fails", async () => {
    createMessage.mockRejectedValue(new ApiError("INTERNAL_ERROR"));
    createState = { loading: false, error: new ApiError("CONFLICT", "Konflikt beim Speichern") };
    renderEditor();
    fillRadioMessage();

    fireEvent.click(saveButton());

    await waitFor(() => expect(createMessage).toHaveBeenCalled());
    expect(screen.getByText("Konflikt beim Speichern")).toBeInTheDocument();
    expect(field(t("message.sender"))).toHaveValue("Alice");
    // and a retry is possible
    await waitFor(() => expect(saveButton()).toBeEnabled());
    fireEvent.click(saveButton());
    await waitFor(() => expect(createMessage).toHaveBeenCalledTimes(2));
  });

  it("disables saving while a save is in flight", () => {
    createState = { loading: true, error: undefined };
    renderEditor();
    fillRadioMessage();

    expect(saveButton()).toBeDisabled();
  });

  it("loads a message from the journal into the form and updates it", async () => {
    renderEditor({ messages: [message()] });

    fireEvent.click(screen.getByRole("button", { name: t("edit") }));
    expect(field(t("message.sender"))).toHaveValue("Alice");
    expect(field(t("message.receiver"))).toHaveValue("Bob");
    expect(field(t("radioChannel"))).toHaveValue("K1");
    fireEvent.change(field(t("message.content")), { target: { value: "Brücke offen" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMessage).toHaveBeenCalledTimes(1));
    expect(updateMessage).toHaveBeenCalledWith({
      incidentId: "i1",
      messageId: "m1",
      time: new Date("2026-01-15T10:00:00"),
      content: "Brücke offen",
      medium: Medium.Radio,
      sender: "Alice",
      senderDetail: "K1",
      receiver: "Bob",
      receiverDetail: "K1",
    });
    expect(createMessage).not.toHaveBeenCalled();
    await waitFor(() => expect(field(t("message.sender"))).toHaveValue(""));
  });

  it("uploads attachments of an edited message straight away and can remove existing ones", async () => {
    const existing: Attachment = {
      id: "a1",
      filename: "plan.pdf",
      contentType: "application/pdf",
      size: 10,
      createdAt: new Date(),
      uploadedBy: "u",
      url: "/a1",
    };
    const added: Attachment = { ...existing, id: "a2", filename: "neu.pdf" };
    uploadAttachment.mockResolvedValue(added);
    renderEditor({ messages: [message({ attachments: [existing] })] });
    fireEvent.click(screen.getByRole("button", { name: t("edit") }));
    const editor = screen.getByRole("heading", { level: 1, name: t("editor") })
      .parentElement as HTMLElement;

    const file = new File(["x"], "neu.pdf", { type: "application/pdf" });
    fireEvent.change(field(t("message.attachments.add")), { target: { files: [file] } });

    await waitFor(() =>
      expect(uploadAttachment).toHaveBeenCalledWith({ incidentId: "i1", messageId: "m1", file }),
    );
    const removeButtons = () =>
      within(editor).getAllByRole("button", { name: t("message.attachments.remove") });
    await waitFor(() => expect(removeButtons()).toHaveLength(2));

    fireEvent.click(removeButtons()[0]);
    expect(removeAttachment).toHaveBeenCalledWith({
      incidentId: "i1",
      messageId: "m1",
      attachmentId: "a1",
    });
    expect(removeButtons()).toHaveLength(1);

    fireEvent.click(removeButtons()[0]);
    expect(removeAttachment).toHaveBeenLastCalledWith({
      incidentId: "i1",
      messageId: "m1",
      attachmentId: "a2",
    });
    expect(
      within(editor).queryByRole("button", { name: t("message.attachments.remove") }),
    ).not.toBeInTheDocument();
  });

  it("adds no chip for an upload to an edited message that failed", async () => {
    uploadAttachment.mockRejectedValue(new ApiError("ATTACHMENT_TOO_LARGE"));
    renderEditor({ messages: [message()] });
    fireEvent.click(screen.getByRole("button", { name: t("edit") }));

    fireEvent.change(field(t("message.attachments.add")), {
      target: { files: [new File(["x"], "gross.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("gross.pdf")).not.toBeInTheDocument();
  });

  it.each([
    ["ATTACHMENT_TOO_LARGE", "message.attachments.tooLarge"],
    ["ATTACHMENT_DISABLED", "message.attachments.disabled"],
    ["INTERNAL_ERROR", "message.attachments.uploadFailed"],
  ] as const)("explains a failed upload (%s)", (code, key) => {
    api.useUploadAttachment.mockImplementation(() => [
      uploadAttachment,
      { loading: false, error: new ApiError(code) },
    ]);
    renderEditor();

    expect(screen.getByText(t(key))).toBeInTheDocument();
  });

  it("asks before leaving with unsaved changes, and leaves once discarded", async () => {
    const router = renderEditor();
    fillRadioMessage();

    fireEvent.click(screen.getByRole("button", { name: t("close") }));
    expect(await screen.findByText(t("unsavedChanges"))).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/incident/i1/journal/edit");

    fireEvent.click(screen.getByRole("button", { name: t("discard") }));
    expect(await screen.findByText("message list page")).toBeInTheDocument();
  });

  it("stays on the page when leaving is cancelled", async () => {
    const router = renderEditor();
    fillRadioMessage();

    fireEvent.click(screen.getByRole("button", { name: t("close") }));
    await screen.findByText(t("unsavedChanges"));
    fireEvent.click(screen.getByRole("button", { name: t("cancel") }));

    await waitFor(() => expect(screen.queryByText(t("unsavedChanges"))).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/incident/i1/journal/edit");
    expect(field(t("message.sender"))).toHaveValue("Alice");
  });

  it("leaves without asking when nothing was typed", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: t("close") }));

    expect(await screen.findByText("message list page")).toBeInTheDocument();
  });
});

describe("MessageEditorForm", () => {
  beforeEach(() => {
    createState = { loading: false, error: undefined };
    updateMessage.mockReset().mockResolvedValue(undefined);
    mockCommandHooks();
  });

  function renderForm(overrides: Partial<Message> = {}) {
    const ref = createRef<MessageEditorFormHandle>();
    const onSaved = vi.fn();
    const onLiveMessage = vi.fn();
    render(
      <MessageEditorForm
        ref={ref}
        message={message(overrides)}
        incidentId="i1"
        onSaved={onSaved}
        onLiveMessage={onLiveMessage}
        title="Meldung ändern"
      />,
    );
    return { ref, onSaved, onLiveMessage };
  }

  it("shows the message, with a title and no save button of its own", () => {
    renderForm();

    expect(screen.getByRole("heading", { name: "Meldung ändern" })).toBeInTheDocument();
    expect(field(t("message.sender"))).toHaveValue("Alice");
    expect(screen.queryByRole("button", { name: t("save") })).not.toBeInTheDocument();
  });

  it("reports every edit as a live message", () => {
    const { onLiveMessage } = renderForm();

    fireEvent.change(field(t("message.content")), { target: { value: "Neu" } });

    expect(onLiveMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "m1", content: "Neu", sender: "Alice", senderDetail: "K1" }),
    );
  });

  it("does not call the server when saving an unchanged message", async () => {
    const { ref, onSaved } = renderForm();

    await act(async () => ref.current?.save());

    expect(updateMessage).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("saves the changes through the handle and reports it", async () => {
    const { ref, onSaved } = renderForm();
    fireEvent.change(field(t("message.content")), { target: { value: "Neu" } });

    await act(async () => ref.current?.save());

    expect(updateMessage).toHaveBeenCalledWith({
      incidentId: "i1",
      messageId: "m1",
      time: new Date("2026-01-15T10:00:00"),
      content: "Neu",
      medium: Medium.Radio,
      sender: "Alice",
      senderDetail: "K1",
      receiver: "Bob",
      receiverDetail: "K1",
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("does not save an invalid message", async () => {
    const { ref, onSaved } = renderForm();
    fireEvent.change(field(t("message.content")), { target: { value: " " } });

    await act(async () => ref.current?.save());

    expect(updateMessage).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not report a save that failed", async () => {
    updateMessage.mockRejectedValue(new ApiError("INTERNAL_ERROR"));
    const { ref, onSaved } = renderForm();
    fireEvent.change(field(t("message.content")), { target: { value: "Neu" } });

    await act(async () => ref.current?.save());

    expect(updateMessage).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
