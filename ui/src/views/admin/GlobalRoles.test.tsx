import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { errorResult, loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import GlobalRoles from "./GlobalRoles";

// The real locale files, so a missing translation fails the test.
const locales: Record<string, unknown> = { de, fr, it: it_ };
let language = "de";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      locales[language],
    );
  return typeof value === "string" ? value : key;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language } }),
}));

const api = vi.hoisted(() => ({
  useGlobalRoles: vi.fn(),
  useAccessUsers: vi.fn(),
  useGrantGlobalRole: vi.fn(),
  useRevokeGlobalRole: vi.fn(),
}));
vi.mock("api", () => api);

const users = [
  { sub: "u1", name: "Alice", email: "alice@example.org" },
  { sub: "u2", name: "", email: "anon@example.org" },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/global-roles"]}>
      <Routes>
        <Route path="/admin/global-roles" element={<GlobalRoles />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GlobalRoles", () => {
  const grantRole = vi.fn();
  const revokeRole = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    language = "de";
    grantRole.mockResolvedValue(undefined);
    revokeRole.mockResolvedValue(undefined);
    api.useGrantGlobalRole.mockReturnValue([grantRole, { loading: false, error: undefined }]);
    api.useRevokeGlobalRole.mockReturnValue([revokeRole, { loading: false, error: undefined }]);
    api.useAccessUsers.mockReturnValue(readyResult({ users }));
    api.useGlobalRoles.mockReturnValue(
      readyResult({
        grants: [
          { subject: "u1", role: "SYSTEM_ADMIN", name: "Alice", email: "alice@example.org" },
          { subject: "u9", role: "GROUP_ADMIN", name: "", email: "" },
        ],
      }),
    );
  });

  it("renders no page while loading", () => {
    api.useGlobalRoles.mockReturnValue(loadingResult());
    renderPage();

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows the error message when loading fails", () => {
    api.useGlobalRoles.mockReturnValue(errorResult(new ApiError("INTERNAL_ERROR", "boom")));
    renderPage();

    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("leaves the page without showing content when forbidden", async () => {
    api.useGlobalRoles.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "nope")));
    renderPage();

    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it.each([
    ["de", de.adminGlobalRoles],
    ["fr", fr.adminGlobalRoles],
    ["it", it_.adminGlobalRoles],
  ])("shows holders and roles in %s", (lang, texts) => {
    language = lang;
    renderPage();

    expect(screen.getByRole("heading", { name: texts.title })).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText(/Alice/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(texts.systemAdmin)).toBeInTheDocument();
    // unnamed holder falls back to the placeholder and the subject
    expect(within(rows[2]).getByText(/u9/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(new RegExp(texts.unnamedUser))).toBeInTheDocument();
    expect(within(rows[2]).getByText(texts.groupAdmin)).toBeInTheDocument();
  });

  it("shows the empty state when no role is granted", () => {
    api.useGlobalRoles.mockReturnValue(readyResult({ grants: [] }));
    renderPage();

    expect(screen.getByText(de.adminGlobalRoles.noRolesGranted)).toBeInTheDocument();
  });

  it("only enables the grant button once a user is selected", () => {
    renderPage();

    expect(screen.getByRole("button", { name: "Vergeben" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Benutzer", { selector: "select" }), {
      target: { value: "u1" },
    });
    expect(screen.getByRole("button", { name: "Vergeben" })).toBeEnabled();
  });

  it("lists the available users, using a placeholder for unnamed ones", () => {
    renderPage();

    expect(screen.getByRole("option", { name: "Alice (alice@example.org)" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Unbenannter Benutzer (anon@example.org)" }),
    ).toBeInTheDocument();
  });

  it("offers no user options when the user list failed to load", () => {
    api.useAccessUsers.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "x")));
    renderPage();

    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it.each([
    ["the default role", undefined, "GROUP_ADMIN"],
    ["a system admin", "SYSTEM_ADMIN", "SYSTEM_ADMIN"],
  ])("grants %s to the selected user and clears the selection", async (_n, choice, role) => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Benutzer", { selector: "select" }), {
      target: { value: "u2" },
    });
    if (choice) {
      fireEvent.change(screen.getByLabelText("Rolle", { selector: "select" }), {
        target: { value: choice },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Vergeben" }));

    expect(grantRole).toHaveBeenCalledWith({ subject: "u2", role });
    await waitFor(() =>
      expect(screen.getByLabelText("Benutzer", { selector: "select" })).toHaveValue(""),
    );
  });

  it("shows a busy state while granting", () => {
    api.useGrantGlobalRole.mockReturnValue([grantRole, { loading: true, error: undefined }]);
    renderPage();

    expect(screen.getByRole("button", { name: /Wird vergeben/ })).toBeDisabled();
  });

  it("shows a grant or revoke error", () => {
    api.useRevokeGlobalRole.mockReturnValue([
      revokeRole,
      { loading: false, error: new ApiError("INTERNAL_ERROR", "revoke failed") },
    ]);
    renderPage();

    expect(screen.getByText("revoke failed")).toBeInTheDocument();
  });

  it("asks for confirmation before revoking, and cancel keeps the role", () => {
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "Entziehen" })[0]);
    expect(screen.getByText("Diese Rolle entziehen?")).toBeInTheDocument();
    expect(revokeRole).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText("Diese Rolle entziehen?")).not.toBeInTheDocument();
    expect(revokeRole).not.toHaveBeenCalled();
  });

  it("revokes the confirmed role of the right user", async () => {
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "Entziehen" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Bestätigen" }));

    expect(revokeRole).toHaveBeenCalledWith({ subject: "u9", role: "GROUP_ADMIN" });
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Entziehen" })).toHaveLength(2),
    );
  });
});
