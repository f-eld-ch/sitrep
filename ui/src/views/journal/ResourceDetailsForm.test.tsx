import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Resource } from "api";
import { ResourceDetailsForm } from "./ResourceDetailsForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const rename = vi.fn().mockResolvedValue(undefined);
const updateContact = vi.fn().mockResolvedValue(undefined);
const updateCount = vi.fn().mockResolvedValue(undefined);
const idle = { loading: false, error: undefined };

vi.mock("api", () => ({
  useRenameResource: () => [rename, idle],
  useUpdateContact: () => [updateContact, idle],
  useUpdatePersonnelCount: () => [updateCount, idle],
}));

const messageTime = new Date("2026-01-15T10:00:00.000Z");

const resource = {
  id: "res-1",
  name: "Löschzug 1",
  personnelCount: 9,
  contact: { medium: "PHONE", detail: "079 111" },
} as unknown as Resource;

const open = () => fireEvent.click(screen.getByRole("button", { name: "resource.editDetails" }));
const fields = () => screen.getAllByRole("textbox");

describe("ResourceDetailsForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is collapsed by default", () => {
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "resource.editDetails" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("saves only the changed fields, at the message time", async () => {
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();
    fireEvent.change(fields()[0], { target: { value: "  Löschzug 2 " } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(updateCount).toHaveBeenCalled());
    expect(rename).toHaveBeenCalledWith({ id: "res-1", name: "Löschzug 2", at: messageTime });
    expect(updateCount).toHaveBeenCalledWith({ id: "res-1", count: 12, at: messageTime });
    expect(updateContact).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("disables saving until something changed", () => {
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();

    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("rejects an empty name and a headcount below 1", () => {
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();
    fireEvent.change(fields()[0], { target: { value: " " } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    expect(screen.getByText("resource.validation.nameRequired")).toBeInTheDocument();
    expect(screen.getByText("resource.validation.personnelCountMin")).toBeInTheDocument();
    expect(rename).not.toHaveBeenCalled();
    expect(updateCount).not.toHaveBeenCalled();
  });

  it("hides the contact when the panel offers it inline", () => {
    render(
      <ResourceDetailsForm resource={resource} messageTime={messageTime} showContact={false} />,
    );
    open();

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });

  it("discards edits when cancelled", () => {
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();
    fireEvent.change(fields()[0], { target: { value: "Anderer Name" } });
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    open();

    expect(fields()[0]).toHaveValue("Löschzug 1");
  });
});
