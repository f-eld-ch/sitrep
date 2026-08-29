import { fireEvent, render } from "@testing-library/react";
import { Medium } from "types";
import { describe, expect, it, vi } from "vitest";
import { EditorContext, type EditorContextValue, initEditorState } from "../editorState";
import { MediumForm } from "./MediumForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string | string[]) => (Array.isArray(k) ? k[0] : k),
    i18n: { language: "en" },
  }),
}));

vi.mock("../Markdown", () => ({
  ReactEditor: ({ id }: { id?: string }) => <textarea data-testid="md-editor" id={id} />,
  ReactPreview: ({ content }: { content: string }) => <div>{content}</div>,
}));

function renderForm(ui: React.ReactElement, overrides?: Partial<EditorContextValue>) {
  const value: EditorContextValue = {
    state: initEditorState(),
    dispatch: vi.fn(),
    onSave: vi.fn(),
    saving: false,
    autocompleteDetails: {
      senderReceiverNames: [],
      senderReceiverDetails: [],
      channelList: [],
    },
    ...overrides,
  };
  return render(<EditorContext.Provider value={value}>{ui}</EditorContext.Provider>);
}

// The i18next mock returns the first key in an array, so the label text for each
// party row is `${medium.toLowerCase()}.${party}` (e.g. "radio.sender").
describe("MediumForm label association", () => {
  it.each([
    [Medium.Radio, "radio.sender", "radio.receiver"],
    [Medium.Phone, "phone.sender", "phone.receiver"],
    [Medium.Email, "email.sender", "email.receiver"],
    [Medium.Other, "other.sender", "other.receiver"],
  ])(
    "%s — labels are associated to inputs via htmlFor",
    (medium: Medium, senderKey: string, receiverKey: string) => {
      const { getByLabelText } = renderForm(<MediumForm medium={medium} />);
      expect(getByLabelText(senderKey).tagName).toBe("INPUT");
      expect(getByLabelText(receiverKey).tagName).toBe("INPUT");
      expect(getByLabelText("message.time").tagName).toBe("INPUT");
      expect(getByLabelText("message.content").tagName).toBe("TEXTAREA");
    },
  );
});

describe("MediumForm dispatch", () => {
  it("typing in sender field dispatches set_sender", () => {
    const dispatch = vi.fn();
    const { getByLabelText } = renderForm(<MediumForm medium={Medium.Radio} />, { dispatch });
    const input = getByLabelText("radio.sender") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Alice" } });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "set_sender" }));
  });

  it("Save button calls onSave via form submit", () => {
    const onSave = vi.fn();
    const { getByRole } = renderForm(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <MediumForm medium={Medium.Radio} />
      </form>,
      { state: { ...initEditorState(), sender: "a", receiver: "b", content: "c" } },
    );
    fireEvent.click(getByRole("button", { name: "save" }));
    expect(onSave).toHaveBeenCalled();
  });
});
