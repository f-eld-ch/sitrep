import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { ApiError, type Resource } from "api";
import { ResourceDetailsForm } from "./ResourceDetailsForm";

// The real locale file, so a missing translation fails the test.
function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}
const t = lookup;

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: lookup }) }));

const rename = vi.fn();
const updateContact = vi.fn();
const updateCount = vi.fn();
const states = vi.hoisted(() => ({
  contact: { loading: false, error: undefined as unknown },
}));
const idle = { loading: false, error: undefined };

vi.mock("api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRenameResource: () => [rename, idle],
  useUpdateContact: () => [updateContact, states.contact],
  useUpdatePersonnelCount: () => [updateCount, idle],
}));

const messageTime = new Date("2026-01-15T10:00:00.000Z");

const resource = {
  id: "res-1",
  name: "Löschzug 1",
  personnelCount: 9,
  contact: { medium: "PHONE", detail: "079 111" },
} as unknown as Resource;

const noContact = { ...resource, contact: undefined } as unknown as Resource;

const open = () => fireEvent.click(screen.getByRole("button", { name: t("resource.editDetails") }));
const mediumSelect = () => screen.getByRole("combobox", { name: t("resource.fields.contact") });
const detailInput = () => screen.getByRole("textbox", { name: t("resource.fields.contact") });
const save = () => screen.getByRole("button", { name: t("save") });

describe("ResourceDetailsForm contact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rename.mockResolvedValue(undefined);
    updateContact.mockResolvedValue(undefined);
    updateCount.mockResolvedValue(undefined);
    states.contact = { loading: false, error: undefined };
  });

  it("shows the current contact", () => {
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();

    expect(mediumSelect()).toHaveValue("PHONE");
    expect(detailInput()).toHaveValue("079 111");
  });

  it("saves a new contact at the message time, trimmed, and closes", async () => {
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();

    fireEvent.change(mediumSelect(), { target: { value: "RADIO" } });
    fireEvent.change(detailInput(), { target: { value: " Kanal 7 " } });
    fireEvent.click(save());

    await waitFor(() =>
      expect(updateContact).toHaveBeenCalledWith({
        id: "res-1",
        medium: "RADIO",
        detail: "Kanal 7",
        at: messageTime,
      }),
    );
    expect(rename).not.toHaveBeenCalled();
    expect(updateCount).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("sends a changed medium alone with the unchanged number", async () => {
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();

    fireEvent.change(mediumSelect(), { target: { value: "OTHER" } });
    fireEvent.click(save());

    await waitFor(() =>
      expect(updateContact).toHaveBeenCalledWith({
        id: "res-1",
        medium: "OTHER",
        detail: "079 111",
        at: messageTime,
      }),
    );
  });

  it("does not offer saving an empty contact for a resource that has none", () => {
    render(<ResourceDetailsForm resource={noContact} messageTime={messageTime} />);
    open();
    expect(mediumSelect()).toHaveValue("PHONE");

    fireEvent.change(mediumSelect(), { target: { value: "RADIO" } });

    expect(save()).toBeDisabled();
  });

  it("keeps the section open and shows the error when saving fails", async () => {
    updateContact.mockRejectedValue(new ApiError("FORBIDDEN"));
    states.contact = { loading: false, error: new ApiError("FORBIDDEN") };
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();

    fireEvent.change(detailInput(), { target: { value: "079 222" } });
    fireEvent.click(save());

    await waitFor(() => expect(updateContact).toHaveBeenCalled());
    expect(screen.getByText(t("errors.FORBIDDEN"))).toBeInTheDocument();
    expect(detailInput()).toHaveValue("079 222");
  });

  it("stops after the first failing change", async () => {
    rename.mockRejectedValue(new ApiError("FORBIDDEN"));
    render(<ResourceDetailsForm resource={resource} messageTime={messageTime} />);
    open();

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Neuer Name" } });
    fireEvent.change(detailInput(), { target: { value: "079 222" } });
    fireEvent.click(save());

    await waitFor(() => expect(rename).toHaveBeenCalled());
    expect(updateContact).not.toHaveBeenCalled();
  });
});
