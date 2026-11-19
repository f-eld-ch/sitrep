import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { errorResult, loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import IncidentAccessSection from "./Access";

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
  useIncidentAccessMode: vi.fn(),
  useIncidentAccess: vi.fn(),
  useAccessUsers: vi.fn(),
  useAccessGroups: vi.fn(),
  useChangeIncidentAccessMode: vi.fn(),
  useGrantIncidentRole: vi.fn(),
  useRevokeIncidentRole: vi.fn(),
}));
vi.mock("api", () => api);

const idle = { loading: false, error: undefined };
const users = [
  { sub: "u1", name: "Alice", email: "alice@example.org" },
  { sub: "u2", name: "Bob", email: "bob@example.org" },
  { sub: "u3", name: "", email: "carol@example.org" },
];
const groups = [
  { id: "g1", name: "Stab", description: "", archivedAt: null },
  { id: "g2", name: "Einsatz", description: "", archivedAt: null },
  { id: "g3", name: "Alt", description: "", archivedAt: new Date() },
];
const grant = (
  principalKind: "USER" | "GROUP" | "ALL",
  principalId: string,
  role: "OWNER" | "MANAGER" | "EDITOR" | "VIEWER",
  principalName = "",
) => ({ incidentId: "i1", principalKind, principalId, principalName, role });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/incident/i1"]}>
      <Routes>
        <Route path="/incident/:id" element={<IncidentAccessSection incidentId="i1" />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const grantsTable = () => screen.getAllByRole("table")[0];
const rowOf = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;

describe("IncidentAccessSection", () => {
  const changeMode = vi.fn();
  const grantRole = vi.fn();
  const revokeRole = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    language = "de";
    changeMode.mockResolvedValue(undefined);
    grantRole.mockResolvedValue(undefined);
    revokeRole.mockResolvedValue(undefined);
    api.useChangeIncidentAccessMode.mockReturnValue([changeMode, idle]);
    api.useGrantIncidentRole.mockReturnValue([grantRole, idle]);
    api.useRevokeIncidentRole.mockReturnValue([revokeRole, idle]);
    api.useAccessUsers.mockReturnValue(readyResult({ users }));
    api.useAccessGroups.mockReturnValue(readyResult({ groups }));
    api.useIncidentAccessMode.mockReturnValue(readyResult({ mode: "OPEN_OPERATIONAL" }));
    api.useIncidentAccess.mockReturnValue(
      readyResult({ grants: [grant("USER", "u1", "EDITOR"), grant("GROUP", "g1", "VIEWER")] }),
    );
  });

  it("queries the access of the given incident", () => {
    renderPage();

    expect(api.useIncidentAccess).toHaveBeenCalledWith("i1");
    expect(api.useIncidentAccessMode).toHaveBeenCalledWith("i1");
  });

  it("shows no mode box and no grants while loading", () => {
    api.useIncidentAccessMode.mockReturnValue(loadingResult());
    api.useIncidentAccess.mockReturnValue(loadingResult());
    renderPage();

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: de.incidentAccess.title })).toBeInTheDocument();
  });

  it("shows the error message when the grants fail to load", () => {
    api.useIncidentAccess.mockReturnValue(errorResult(new ApiError("INTERNAL_ERROR", "boom")));
    renderPage();

    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("leaves the page without an error message when forbidden", async () => {
    api.useIncidentAccess.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "nope")));
    renderPage();

    expect(await screen.findByText("home page")).toBeInTheDocument();
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
  });

  it.each([
    ["de", de],
    ["fr", fr],
    ["it", it_],
  ])("shows the headings and mode names in %s", (lang, texts) => {
    language = lang;
    renderPage();

    expect(screen.getByText(texts.incidentAccess.accessMode)).toBeInTheDocument();
    expect(screen.getByText(texts.incidentAccess.openAccess)).toBeInTheDocument();
    expect(screen.getByText(texts.incidentAccess.restricted)).toBeInTheDocument();
    expect(screen.getByText(texts.incidentAccess.addGrant)).toBeInTheDocument();
  });

  describe("access mode", () => {
    const open = () => screen.getByRole("radio", { name: /Offener Zugriff/ });
    const restricted = () => screen.getByRole("radio", { name: /Eingeschränkt/ });

    it("reflects the current mode", () => {
      renderPage();

      expect(open()).toBeChecked();
      expect(restricted()).not.toBeChecked();
    });

    it("asks for confirmation before restricting", () => {
      renderPage();

      fireEvent.click(restricted());

      expect(changeMode).not.toHaveBeenCalled();
      expect(screen.getByText(de.incidentAccess.confirmRestrictWarning)).toBeInTheDocument();
    });

    it("restricts the incident once confirmed", () => {
      renderPage();

      fireEvent.click(restricted());
      fireEvent.click(screen.getByRole("button", { name: "Einschränkung bestätigen" }));

      expect(changeMode).toHaveBeenCalledWith({ incidentId: "i1", mode: "RESTRICTED" });
      expect(screen.queryByText(de.incidentAccess.confirmRestrictWarning)).not.toBeInTheDocument();
    });

    it("keeps the incident open when the confirmation is cancelled", () => {
      renderPage();

      fireEvent.click(restricted());
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

      expect(changeMode).not.toHaveBeenCalled();
      expect(screen.queryByText(de.incidentAccess.confirmRestrictWarning)).not.toBeInTheDocument();
    });

    it("opens a restricted incident without confirmation", () => {
      api.useIncidentAccessMode.mockReturnValue(readyResult({ mode: "RESTRICTED" }));
      renderPage();

      expect(restricted()).toBeChecked();
      fireEvent.click(open());

      expect(changeMode).toHaveBeenCalledWith({ incidentId: "i1", mode: "OPEN_OPERATIONAL" });
    });

    it("disables the choice while changing and shows an error", () => {
      api.useChangeIncidentAccessMode.mockReturnValue([
        changeMode,
        { loading: true, error: new ApiError("CONFLICT", "mode conflict") },
      ]);
      renderPage();

      expect(open()).toBeDisabled();
      expect(restricted()).toBeDisabled();
      expect(screen.getByText("mode conflict")).toBeInTheDocument();
    });
  });

  describe("grants", () => {
    it("lists groups before users with resolved names", () => {
      renderPage();

      const rows = within(grantsTable()).getAllByRole("row");
      expect(within(rows[1]).getByText("Stab")).toBeInTheDocument();
      expect(within(rows[1]).getByText(de.incidentAccess.groupTag)).toBeInTheDocument();
      expect(within(rows[2]).getByText("Alice")).toBeInTheDocument();
      expect(within(rows[2]).getByText("alice@example.org")).toBeInTheDocument();
    });

    it("falls back to the stored name for principals it cannot resolve", () => {
      api.useAccessUsers.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "x")));
      api.useAccessGroups.mockReturnValue(loadingResult());
      api.useIncidentAccess.mockReturnValue(
        readyResult({
          grants: [
            grant("USER", "u1", "EDITOR", "Alice Stored"),
            grant("GROUP", "g1", "VIEWER", "Stab Stored"),
          ],
        }),
      );
      renderPage();

      expect(screen.getByText("Stab Stored")).toBeInTheDocument();
      const row = rowOf("Alice Stored");
      expect(within(row).getByText(de.incidentAccess.user)).toBeInTheDocument();
      expect(screen.getByText("Alice Stored")).toHaveAttribute(
        "title",
        de.incidentAccess.userDetailsRestricted,
      );
    });

    it("hides the grants table on an open incident without grants", () => {
      api.useIncidentAccess.mockReturnValue(readyResult({ grants: [] }));
      renderPage();

      expect(screen.queryByText(de.incidentAccess.principal)).not.toBeInTheDocument();
    });

    it("marks the role of each grant", () => {
      renderPage();

      expect(within(rowOf("Stab")).getByRole("radio", { name: "Betrachter" })).toBeChecked();
      expect(within(rowOf("Alice")).getByRole("radio", { name: "Bearbeiter" })).toBeChecked();
    });

    it("changes the role of a grant", async () => {
      renderPage();

      const row = rowOf("Alice");
      fireEvent.click(within(row).getByRole("radio", { name: "Besitzer" }));

      expect(grantRole).toHaveBeenCalledWith({
        incidentId: "i1",
        principalKind: "USER",
        principalId: "u1",
        role: "OWNER",
      });
      await waitFor(() =>
        expect(within(row).getByRole("radio", { name: "Besitzer" })).toBeEnabled(),
      );
    });

    it("revokes a grant", async () => {
      renderPage();

      const row = rowOf("Stab");
      fireEvent.click(within(row).getByTitle(de.incidentAccess.revoke));

      expect(revokeRole).toHaveBeenCalledWith({
        incidentId: "i1",
        principalKind: "GROUP",
        principalId: "g1",
        role: "VIEWER",
      });
      await waitFor(() => expect(within(row).getByTitle(de.incidentAccess.revoke)).toBeEnabled());
    });

    it("disables the row while its revoke is running", async () => {
      let resolve: () => void = () => {};
      revokeRole.mockReturnValue(new Promise<void>((r) => (resolve = r)));
      renderPage();

      const row = rowOf("Stab");
      fireEvent.click(within(row).getByTitle(de.incidentAccess.revoke));
      await waitFor(() => expect(within(row).getByTitle(de.incidentAccess.revoke)).toBeDisabled());
      fireEvent.click(within(row).getByTitle(de.incidentAccess.revoke));
      expect(revokeRole).toHaveBeenCalledTimes(1);

      resolve();
      await waitFor(() => expect(within(row).getByTitle(de.incidentAccess.revoke)).toBeEnabled());
    });

    it.each([
      ["revoking", revokeRole, de.incidentAccess.revokeFailed],
      ["changing a role", grantRole, de.incidentAccess.roleChangeFailed],
    ])("shows a failure message when %s fails without a reason", async (_n, fn, message) => {
      fn.mockRejectedValue("denied");
      renderPage();

      if (fn === revokeRole) {
        fireEvent.click(within(rowOf("Stab")).getByTitle(de.incidentAccess.revoke));
      } else {
        fireEvent.click(within(rowOf("Alice")).getByRole("radio", { name: "Manager" }));
      }

      expect(await screen.findByText(message)).toBeInTheDocument();
    });

    it("shows the reason of a failed revoke and lets it be dismissed", async () => {
      revokeRole.mockRejectedValue(new Error("server said no"));
      renderPage();

      fireEvent.click(within(rowOf("Stab")).getByTitle(de.incidentAccess.revoke));
      expect(await screen.findByText("server said no")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: de.close }));
      expect(screen.queryByText("server said no")).not.toBeInTheDocument();
    });
  });

  describe("all users on a restricted incident", () => {
    beforeEach(() => {
      api.useIncidentAccessMode.mockReturnValue(readyResult({ mode: "RESTRICTED" }));
    });

    const allRow = () => rowOf(de.incidentAccess.allUsers);

    it("is not shown on an open incident", () => {
      api.useIncidentAccessMode.mockReturnValue(readyResult({ mode: "OPEN_OPERATIONAL" }));
      renderPage();

      expect(screen.queryByText(de.incidentAccess.allUsers)).not.toBeInTheDocument();
    });

    it("shows no access by default, even without any grant", () => {
      api.useIncidentAccess.mockReturnValue(readyResult({ grants: [] }));
      renderPage();

      expect(within(allRow()).getByRole("radio", { name: "Kein Zugriff" })).toBeChecked();
    });

    it("keeps the all-users grant out of the principal rows and shows its role", () => {
      api.useIncidentAccess.mockReturnValue(
        readyResult({ grants: [grant("ALL", "*", "VIEWER"), grant("USER", "u1", "EDITOR")] }),
      );
      renderPage();

      expect(within(allRow()).getByRole("radio", { name: "Betrachter" })).toBeChecked();
      expect(within(grantsTable()).getAllByRole("row")).toHaveLength(3);
    });

    it("grants a role to everybody", async () => {
      renderPage();

      fireEvent.click(within(allRow()).getByRole("radio", { name: "Bearbeiter" }));

      expect(grantRole).toHaveBeenCalledWith({
        incidentId: "i1",
        principalKind: "ALL",
        principalId: "*",
        role: "EDITOR",
      });
      await waitFor(() =>
        expect(within(allRow()).getByRole("radio", { name: "Bearbeiter" })).toBeEnabled(),
      );
    });

    it("revokes the existing grant when no access is chosen", async () => {
      api.useIncidentAccess.mockReturnValue(readyResult({ grants: [grant("ALL", "*", "VIEWER")] }));
      renderPage();

      fireEvent.click(within(allRow()).getByRole("radio", { name: "Kein Zugriff" }));

      expect(revokeRole).toHaveBeenCalledWith({
        incidentId: "i1",
        principalKind: "ALL",
        principalId: "*",
        role: "VIEWER",
      });
      await waitFor(() =>
        expect(within(allRow()).getByRole("radio", { name: "Kein Zugriff" })).toBeEnabled(),
      );
    });

    it("does not call the api to revoke a grant that does not exist", () => {
      api.useIncidentAccess.mockReturnValue(readyResult({ grants: [] }));
      renderPage();

      fireEvent.click(within(allRow()).getByRole("radio", { name: "Kein Zugriff" }));

      expect(revokeRole).not.toHaveBeenCalled();
    });

    it("shows a failure message when granting everybody fails without a reason", async () => {
      grantRole.mockRejectedValue("denied");
      renderPage();

      fireEvent.click(within(allRow()).getByRole("radio", { name: "Betrachter" }));

      expect(await screen.findByText(de.incidentAccess.grantFailed)).toBeInTheDocument();
    });
  });

  describe("adding a grant", () => {
    const addTable = () => screen.getAllByRole("table")[1];

    it("offers the active groups that have no grant yet", () => {
      renderPage();

      expect(within(addTable()).getByText("Einsatz")).toBeInTheDocument();
      expect(within(addTable()).queryByText("Stab")).not.toBeInTheDocument();
      expect(within(addTable()).queryByText("Alt")).not.toBeInTheDocument();
    });

    it("grants the viewer role to a group by default", async () => {
      renderPage();

      const row = rowOf("Einsatz");
      fireEvent.click(within(row).getByRole("button", { name: de.incidentAccess.grant }));

      expect(grantRole).toHaveBeenCalledWith({
        incidentId: "i1",
        principalKind: "GROUP",
        principalId: "g2",
        role: "VIEWER",
      });
      await waitFor(() =>
        expect(within(row).getByRole("button", { name: de.incidentAccess.grant })).toBeEnabled(),
      );
    });

    it("grants the chosen role to a user", async () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: de.incidentAccess.user }));
      const row = rowOf("Bob");
      fireEvent.change(within(row).getByRole("combobox"), { target: { value: "MANAGER" } });
      fireEvent.click(within(row).getByRole("button", { name: de.incidentAccess.grant }));

      expect(grantRole).toHaveBeenCalledWith({
        incidentId: "i1",
        principalKind: "USER",
        principalId: "u2",
        role: "MANAGER",
      });
      await waitFor(() => expect(within(row).getByRole("combobox")).toBeEnabled());
    });

    it("shows a failure message when granting fails without a reason", async () => {
      grantRole.mockRejectedValue("denied");
      renderPage();

      fireEvent.click(
        within(rowOf("Einsatz")).getByRole("button", { name: de.incidentAccess.grant }),
      );

      expect(await screen.findByText(de.incidentAccess.grantFailed)).toBeInTheDocument();
    });

    it("filters candidates and says when nothing matches", () => {
      renderPage();

      fireEvent.change(screen.getByPlaceholderText(de.incidentAccess.searchByName), {
        target: { value: "zzz" },
      });

      expect(screen.getByText(de.incidentAccess.noMatches)).toBeInTheDocument();
    });

    it("filters users by email and clears the search when switching kind", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: de.incidentAccess.user }));
      fireEvent.change(screen.getByPlaceholderText(de.incidentAccess.searchByNameOrEmail), {
        target: { value: "carol@" },
      });
      expect(within(addTable()).getByText("carol@example.org")).toBeInTheDocument();
      expect(within(addTable()).queryByText("Bob")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: de.incidentAccess.group }));
      expect(screen.getByPlaceholderText(de.incidentAccess.searchByName)).toHaveValue("");
    });

    it("says when every group already has a grant", () => {
      api.useIncidentAccess.mockReturnValue(
        readyResult({ grants: [grant("GROUP", "g1", "VIEWER"), grant("GROUP", "g2", "VIEWER")] }),
      );
      renderPage();

      expect(screen.getByText(de.incidentAccess.noActiveGroups)).toBeInTheDocument();
    });

    it("says when every user already has a grant", () => {
      api.useAccessUsers.mockReturnValue(readyResult({ users: [users[0]] }));
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: de.incidentAccess.user }));

      expect(screen.getByText(de.incidentAccess.allUsersHaveGrants)).toBeInTheDocument();
    });

    it("hides the user tab when the users cannot be listed", () => {
      api.useAccessUsers.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "x")));
      renderPage();

      expect(
        screen.queryByRole("button", { name: de.incidentAccess.user }),
      ).not.toBeInTheDocument();
    });
  });
});
