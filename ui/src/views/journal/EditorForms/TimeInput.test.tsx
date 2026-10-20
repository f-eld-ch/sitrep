import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import { EditorContext, type EditorContextValue, initEditorState } from "../editorState";
import { TimeInput } from "./Elements";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const message = (triageId: TriageStatus): Message => ({
  id: "m1",
  number: 1,
  content: "c",
  sender: "A",
  senderDetail: "",
  receiver: "B",
  receiverDetail: "",
  time: new Date("2026-01-15T10:00:00Z"),
  createdAt: new Date("2026-01-15T10:00:00Z"),
  updatedAt: new Date("2026-01-15T10:00:00Z"),
  deletedAt: new Date(0),
  divisions: [],
  medium: Medium.Radio,
  triageId,
  priorityId: PriorityStatus.Normal,
  attachments: [],
  acknowledgements: [],
  author: "",
});

function setup(messageToEdit?: Message) {
  const value: EditorContextValue = {
    state: { ...initEditorState(), messageToEdit },
    dispatch: vi.fn(),
    onSave: vi.fn(),
    saving: false,
    autocompleteDetails: { senderReceiverNames: [], senderReceiverDetails: [], channelList: [] },
    pendingFiles: [],
    addPendingFile: vi.fn(),
    removePendingFile: vi.fn(),
  };

  return render(
    <EditorContext.Provider value={value}>
      <TimeInput id="time" />
    </EditorContext.Provider>,
  );
}

describe("TimeInput", () => {
  it("can be changed for a new message", () => {
    setup();

    expect(document.getElementById("time")).toBeEnabled();
    expect(screen.queryByText("messageTimeLocked")).toBeNull();
  });

  it.each([TriageStatus.Pending, TriageStatus.MoreInfo, TriageStatus.Reset])(
    "can be changed for a message that is %s",
    (status) => {
      setup(message(status));

      expect(document.getElementById("time")).toBeEnabled();
    },
  );

  it("is locked once the message is triaged, and says why", () => {
    setup(message(TriageStatus.Triaged));

    expect(document.getElementById("time")).toBeDisabled();
    expect(screen.getByText("messageTimeLocked")).toBeInTheDocument();
  });
});
