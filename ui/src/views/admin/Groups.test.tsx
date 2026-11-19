import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessGroup } from "types";
import { ApiError } from "../../api/errors";
import { errorResult, loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import Groups from "./Groups";

// The real locale files, so a missing translation fails the test.
const locales: Record<string, unknown> = { de, fr, it: it_ };
let language = "de";

function lookup(key: string, options?: { count?: number }): string {
  const find = (k: string) =>
    k
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        locales[language],
      );
  let value = find(key);
  if (options?.count !== undefined && typeof value !== "string") {
    value = find(`${key}_${options.count === 1 ? "one" : "other"}`);
  }
  return typeof value === "string" ? value.replace("{{count}}", String(options?.count ?? "")) : key;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language } }),
}));

const api = vi.hoisted(() => ({
  useAccessGroups: vi.fn(),
  useCreateAccessGroup: vi.fn(),
}));
vi.mock("api", () => api);

const group = (id: string, name: string, extra: Partial<AccessGroup> = {}): AccessGroup => ({
  id,
  name,
  description: "",
  archivedAt: null,
  ...extra,
});

function renderGroups() {
  return render(
    <MemoryRouter initialEntries={["/admin/groups"]}>
      <Routes>
        <Route path="/admin/groups" element={<Groups />} />
        <Route path="/admin/groups/:id" element={<p>detail page</p>} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Groups", () => {
  const createGroup = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    language = "de";
    createGroup.mockResolvedValue({ groupId: "g-new" });
    api.useCreateAccessGroup.mockReturnValue([createGroup, { loading: false, error: undefined }]);
    api.useAccessGroups.mockReturnValue(readyResult({ groups: [] }));
  });

  it("shows no content while loading", () => {
    api.useAccessGroups.mockReturnValue(loadingResult());
    renderGroups();

    expect(screen.queryByRole("heading", { name: "Gruppen" })).not.toBeInTheDocument();
  });

  it("shows the error message when loading fails", () => {
    api.useAccessGroups.mockReturnValue(errorResult(new ApiError("INTERNAL_ERROR", "boom")));
    renderGroups();

    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("renders nothing and leaves the page when forbidden", async () => {
    api.useAccessGroups.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "nope")));
    renderGroups();

    expect(await screen.findByText("home page")).toBeInTheDocument();
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
  });

  it.each([
    ["de", de.adminGroups.noGroupsYet],
    ["fr", fr.adminGroups.noGroupsYet],
    ["it", it_.adminGroups.noGroupsYet],
  ])("shows the empty state in %s", (lang, text) => {
    language = lang;
    renderGroups();

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("lists active groups as links and hides archived ones until expanded", async () => {
    api.useAccessGroups.mockReturnValue(
      readyResult({
        groups: [
          group("g1", "Alpha", { description: "First" }),
          group("g2", "Beta"),
          group("g3", "Old", { archivedAt: new Date() }),
        ],
      }),
    );
    renderGroups();

    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/admin/groups/g1");
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Archiviert \(1\)/ }));

    expect(screen.getByRole("link", { name: "Old" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Archiviert \(1\)/ }));
    expect(screen.queryByRole("link", { name: "Old" })).not.toBeInTheDocument();
  });

  it("creates a group with trimmed values and opens it", async () => {
    renderGroups();

    fireEvent.click(screen.getByRole("button", { name: "Neue Gruppe" }));
    expect(screen.getByRole("button", { name: "Erstellen" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Stab  " } });
    fireEvent.change(screen.getByLabelText("Beschreibung"), { target: { value: " Fuehrung " } });
    fireEvent.click(screen.getByRole("button", { name: "Erstellen" }));

    expect(createGroup).toHaveBeenCalledWith({ name: "Stab", description: "Fuehrung" });
    expect(await screen.findByText("detail page")).toBeInTheDocument();
  });

  it("does not create a group with a blank name", async () => {
    renderGroups();

    fireEvent.click(screen.getByRole("button", { name: "Neue Gruppe" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    expect(createGroup).not.toHaveBeenCalled();
  });

  it("creates a group on Enter and cancels on Escape", async () => {
    renderGroups();

    fireEvent.click(screen.getByRole("button", { name: "Neue Gruppe" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Stab" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Neue Gruppe" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Stab" } });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Enter" });

    await waitFor(() =>
      expect(createGroup).toHaveBeenCalledWith({ name: "Stab", description: "" }),
    );
  });

  it("closes the form with the cancel button without creating", async () => {
    renderGroups();

    fireEvent.click(screen.getByRole("button", { name: "Neue Gruppe" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it("warns when the name approaches the length limit", async () => {
    renderGroups();

    fireEvent.click(screen.getByRole("button", { name: "Neue Gruppe" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "x".repeat(60) } });

    expect(screen.getByText("4 / 64")).toBeInTheDocument();
  });

  it("shows a creation error", () => {
    api.useCreateAccessGroup.mockReturnValue([
      createGroup,
      { loading: false, error: new ApiError("CONFLICT", "exists already") },
    ]);
    renderGroups();

    expect(screen.getByText("exists already")).toBeInTheDocument();
  });
});
