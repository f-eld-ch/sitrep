import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorContext, type EditorContextValue, initEditorState } from "../editorState";
import { TimeInput } from "./Elements";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

function setup(time?: Date) {
  const dispatch = vi.fn();
  const value: EditorContextValue = {
    state: { ...initEditorState(), time },
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
      <TimeInput id="time" />
    </EditorContext.Provider>,
  );
  return { dispatch, input: () => screen.getByDisplayValue(/./) as HTMLInputElement };
}

describe("TimeInput clock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 10, 0, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the current minute while no time was chosen, and follows the clock", () => {
    const { input } = setup();
    expect(input()).toHaveValue("2026-01-15T10:00");
    expect(input()).toHaveAttribute("max", "2026-01-15T10:05");

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(input()).toHaveValue("2026-01-15T10:01");
    expect(input()).toHaveAttribute("max", "2026-01-15T10:06");
  });

  it("keeps a chosen time when the clock moves on", () => {
    const { input } = setup(new Date(2026, 0, 15, 9, 15));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(input()).toHaveValue("2026-01-15T09:15");
  });

  it("flags a time that the moving clock has not reached yet, and accepts it later", () => {
    setup(new Date(2026, 0, 15, 10, 8));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4 * 60_000);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports the chosen time, or none when the field is cleared", () => {
    const { dispatch, input } = setup();

    fireEvent.change(input(), { target: { value: "2026-01-15T09:45" } });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "set_time",
      time: new Date(2026, 0, 15, 9, 45),
    });

    fireEvent.change(input(), { target: { value: "" } });
    expect(dispatch).toHaveBeenLastCalledWith({ type: "set_time", time: undefined });
  });
});
