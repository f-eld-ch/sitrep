import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorContext, initEditorState, type EditorContextValue } from "./editorState";
import { ReactEditor } from "./MarkdownEditor";

// The third-party editor is not under test: a textarea with the same contract stands in.
vi.mock("@uiw/react-md-editor", () => ({
  default: (props: {
    value?: string;
    onChange?: (value?: string) => void;
    textareaProps?: { id?: string };
    preview?: string;
  }) => (
    <textarea
      id={props.textareaProps?.id}
      data-preview={props.preview}
      value={props.value}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  ),
}));

function renderEditor(id?: string, content = "") {
  const dispatch = vi.fn();
  const value: EditorContextValue = {
    state: { ...initEditorState(), content },
    dispatch,
    onSave: vi.fn(),
    saving: false,
    autocompleteDetails: { senderReceiverNames: [], senderReceiverDetails: [], channelList: [] },
    pendingFiles: [],
    addPendingFile: vi.fn(),
    removePendingFile: vi.fn(),
  };
  render(
    <EditorContext.Provider value={value}>
      <ReactEditor id={id} />
    </EditorContext.Provider>,
  );
  return dispatch;
}

describe("ReactEditor", () => {
  it("shows the content of the editor state, as plain markdown source", () => {
    renderEditor(undefined, "**fett**");

    const editor = screen.getByRole("textbox");
    expect(editor).toHaveValue("**fett**");
    expect(editor).toHaveAttribute("data-preview", "edit");
  });

  it("passes the id on, so a label can point at the text area", () => {
    renderEditor("content-field");

    expect(screen.getByRole("textbox")).toHaveAttribute("id", "content-field");
  });

  it("puts what is typed into the editor state", () => {
    const dispatch = renderEditor();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Lage ruhig" } });

    expect(dispatch).toHaveBeenCalledWith({ type: "set_content", content: "Lage ruhig" });
  });

  it("treats a cleared editor as empty content", () => {
    const dispatch = renderEditor(undefined, "x");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });

    expect(dispatch).toHaveBeenCalledWith({ type: "set_content", content: "" });
  });

  it("fails loudly outside an editor", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<ReactEditor />)).toThrow(/EditorContext/);

    error.mockRestore();
  });
});
