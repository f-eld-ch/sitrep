import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { errorResult, loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import DefaultAccess from "./DefaultAccess";

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
  useDefaultAccess: vi.fn(),
  useAccessUsers: vi.fn(),
  useAccessGroups: vi.fn(),
  useSetDefaultAccessMode: vi.fn(),
  useGrantDefaultRole: vi.fn(),
  useRevokeDefaultRole: vi.fn(),
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/default-access"]}>
      <Routes>
        <Route path="/admin/default-access" element={<DefaultAccess />} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const modeRadios = () =>
  screen
    .getAllByRole("radio")
    .filter((r) => r.getAttribute("name") === "default-access-mode") as HTMLInputElement[];

describe("DefaultAccess", () => {
  const setMode = vi.fn();
  const grantRole = vi.fn();
  const revokeRole = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    language = "de";
    setMode.mockResolvedValue(undefined);
    grantRole.mockResolvedValue(undefined);
    revokeRole.mockResolvedValue(undefined);
    api.useSetDefaultAccessMode.mockReturnValue([setMode, idle]);
    api.useGrantDefaultRole.mockReturnValue([grantRole, idle]);
    api.useRevokeDefaultRole.mockReturnValue([revokeRole, idle]);
    api.useAccessUsers.mockReturnValue(readyResult({ users }));
    api.useAccessGroups.mockReturnValue(readyResult({ groups }));
    api.useDefaultAccess.mockReturnValue(
      readyResult({
        mode: "OPEN_OPERATIONAL",
        grants: [
          { principalKind: "USER", principalId: "u1", role: "EDITOR" },
          { principalKind: "GROUP", principalId: "g1", role: "VIEWER" },
        ],
      }),
    );
  });

  it("shows nothing but a spinner while loading", () => {
    api.useDefaultAccess.mockReturnValue(loadingResult());
    renderPage();

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows the error message when loading fails", () => {
    api.useDefaultAccess.mockReturnValue(errorResult(new ApiError("INTERNAL_ERROR", "boom")));
    renderPage();

    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("leaves the page when forbidden", async () => {
    api.useDefaultAccess.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "nope")));
    renderPage();

    expect(await screen.findByText("home page")).toBeInTheDocument();
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
  });

  it.each([
    ["de", de],
    ["fr", fr],
    ["it", it_],
  ])("shows the title and mode options in %s", (lang, texts) => {
    language = lang;
    renderPage();

    expect(screen.getByRole("heading", { name: texts.defaultAccess.title })).toBeInTheDocument();
    expect(screen.getByText(texts.incidentAccess.openAccess)).toBeInTheDocument();
    expect(screen.getByText(texts.incidentAccess.restricted)).toBeInTheDocument();
  });

  describe("access mode", () => {
    it("reflects the current mode", () => {
      renderPage();

      const [open, restricted] = modeRadios();
      expect(open).toBeChecked();
      expect(restricted).not.toBeChecked();
    });

    it("switches to restricted", () => {
      renderPage();

      fireEvent.click(modeRadios()[1]);

      expect(setMode).toHaveBeenCalledWith({ mode: "RESTRICTED" });
    });

    it("switches back to open operational", () => {
      api.useDefaultAccess.mockReturnValue(readyResult({ mode: "RESTRICTED", grants: [] }));
      renderPage();

      expect(modeRadios()[1]).toBeChecked();
      fireEvent.click(modeRadios()[0]);

      expect(setMode).toHaveBeenCalledWith({ mode: "OPEN_OPERATIONAL" });
    });

    it("does not call the api when the current mode is chosen again", () => {
      renderPage();

      fireEvent.click(modeRadios()[0]);

      expect(setMode).not.toHaveBeenCalled();
    });

    it("disables the choice while a change is running", () => {
      api.useSetDefaultAccessMode.mockReturnValue([setMode, { loading: true, error: undefined }]);
      renderPage();

      expect(modeRadios().every((r) => r.disabled)).toBe(true);
    });

    it.each([
      ["mode", "useSetDefaultAccessMode"],
      ["grant", "useGrantDefaultRole"],
      ["revoke", "useRevokeDefaultRole"],
    ])("shows the %s command error", (_n, hook) => {
      api[hook as keyof typeof api].mockReturnValue([
        vi.fn(),
        { loading: false, error: new ApiError("INTERNAL_ERROR", "command failed") },
      ]);
      renderPage();

      expect(screen.getByText("command failed")).toBeInTheDocument();
    });
  });

  describe("current grants", () => {
    it("lists groups before users with resolved names and tags", () => {
      renderPage();

      const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
      expect(within(rows[1]).getByText("Stab")).toBeInTheDocument();
      expect(within(rows[1]).getByText(de.incidentAccess.groupTag)).toBeInTheDocument();
      expect(within(rows[2]).getByText("Alice")).toBeInTheDocument();
      expect(within(rows[2]).getByText("alice@example.org")).toBeInTheDocument();
    });

    it("shows the subject and a user tag for a principal that is not known", () => {
      api.useAccessUsers.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "x")));
      api.useAccessGroups.mockReturnValue(loadingResult());
      renderPage();

      const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
      expect(within(rows[1]).getByText("g1")).toBeInTheDocument();
      expect(within(rows[2]).getByText("u1")).toBeInTheDocument();
      expect(within(rows[2]).getByText(de.incidentAccess.user)).toBeInTheDocument();
    });

    it("shows the empty state", () => {
      api.useDefaultAccess.mockReturnValue(readyResult({ mode: "OPEN_OPERATIONAL", grants: [] }));
      renderPage();

      expect(screen.getByText(de.defaultAccess.noGrants)).toBeInTheDocument();
    });

    it("marks the current role of each grant", () => {
      renderPage();

      const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
      expect(within(rows[1]).getByRole("radio", { name: "Betrachter" })).toBeChecked();
      expect(within(rows[2]).getByRole("radio", { name: "Bearbeiter" })).toBeChecked();
    });

    it("changes the role of a grant", async () => {
      renderPage();

      const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
      fireEvent.click(within(rows[2]).getByRole("radio", { name: "Manager" }));

      expect(grantRole).toHaveBeenCalledWith({
        principalKind: "USER",
        principalId: "u1",
        role: "MANAGER",
      });
      await waitFor(() =>
        expect(within(rows[2]).getByRole("radio", { name: "Manager" })).toBeEnabled(),
      );
    });

    it("does not call the api when the current role is chosen again", () => {
      renderPage();

      const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
      fireEvent.click(within(rows[2]).getByRole("radio", { name: "Bearbeiter" }));

      expect(grantRole).not.toHaveBeenCalled();
    });

    it("revokes a grant", async () => {
      renderPage();

      const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
      fireEvent.click(within(rows[1]).getByTitle(de.incidentAccess.revoke));

      expect(revokeRole).toHaveBeenCalledWith({
        principalKind: "GROUP",
        principalId: "g1",
        role: "VIEWER",
      });
      await waitFor(() =>
        expect(within(rows[1]).getByTitle(de.incidentAccess.revoke)).toBeEnabled(),
      );
    });

    it.each([
      ["revoking", revokeRole, de.defaultAccess.revokeFailed],
      ["changing a role", grantRole, de.defaultAccess.roleChangeFailed],
    ])("shows a failure message when %s fails without a reason", async (_n, fn, message) => {
      fn.mockRejectedValue("denied");
      renderPage();

      const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
      if (fn === revokeRole) {
        fireEvent.click(within(rows[1]).getByTitle(de.incidentAccess.revoke));
      } else {
        fireEvent.click(within(rows[2]).getByRole("radio", { name: "Manager" }));
      }

      expect(await screen.findByText(message)).toBeInTheDocument();
    });

    it("shows the error of a failed revoke and lets it be dismissed", async () => {
      revokeRole.mockRejectedValue(new Error("server said no"));
      renderPage();

      const rows = within(screen.getAllByRole("table")[0]).getAllByRole("row");
      fireEvent.click(within(rows[1]).getByTitle(de.incidentAccess.revoke));
      expect(await screen.findByText("server said no")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: de.close }));
      expect(screen.queryByText("server said no")).not.toBeInTheDocument();
    });
  });

  describe("adding a grant", () => {
    const table = () => screen.getAllByRole("table")[1];

    it("offers the active groups that have no grant yet", () => {
      renderPage();

      expect(within(table()).getByText("Einsatz")).toBeInTheDocument();
      expect(within(table()).queryByText("Stab")).not.toBeInTheDocument();
      expect(within(table()).queryByText("Alt")).not.toBeInTheDocument();
    });

    it("grants the viewer role to a group by default", async () => {
      renderPage();

      fireEvent.click(within(table()).getByRole("button", { name: de.incidentAccess.grant }));

      expect(grantRole).toHaveBeenCalledWith({
        principalKind: "GROUP",
        principalId: "g2",
        role: "VIEWER",
      });
      await waitFor(() =>
        expect(
          within(table()).getByRole("button", { name: de.incidentAccess.grant }),
        ).toBeEnabled(),
      );
    });

    it("grants the chosen role to a user", async () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: de.incidentAccess.user }));
      expect(within(table()).queryByText("Alice")).not.toBeInTheDocument();
      const row = within(table()).getByText("Bob").closest("tr") as HTMLElement;
      fireEvent.change(within(row).getByRole("combobox"), { target: { value: "OWNER" } });
      fireEvent.click(within(row).getByRole("button", { name: de.incidentAccess.grant }));

      expect(grantRole).toHaveBeenCalledWith({
        principalKind: "USER",
        principalId: "u2",
        role: "OWNER",
      });
      await waitFor(() => expect(within(row).getByRole("combobox")).toBeEnabled());
    });

    it("filters candidates by the search text and says when nothing matches", () => {
      renderPage();

      fireEvent.change(screen.getByPlaceholderText(de.incidentAccess.searchByName), {
        target: { value: "einsatz" },
      });
      expect(within(table()).getByText("Einsatz")).toBeInTheDocument();

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
      expect(within(table()).getByText("carol@example.org")).toBeInTheDocument();
      expect(within(table()).queryByText("Bob")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: de.incidentAccess.group }));
      expect(screen.getByPlaceholderText(de.incidentAccess.searchByName)).toHaveValue("");
    });

    it("says when every group already has a grant", () => {
      api.useDefaultAccess.mockReturnValue(
        readyResult({
          mode: "OPEN_OPERATIONAL",
          grants: [
            { principalKind: "GROUP", principalId: "g1", role: "VIEWER" },
            { principalKind: "GROUP", principalId: "g2", role: "VIEWER" },
          ],
        }),
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
      expect(screen.getByRole("button", { name: de.incidentAccess.group })).toBeInTheDocument();
    });

    it("shows a failure message when granting fails without a reason", async () => {
      grantRole.mockRejectedValue("denied");
      renderPage();

      fireEvent.click(within(table()).getByRole("button", { name: de.incidentAccess.grant }));

      expect(await screen.findByText(de.defaultAccess.grantFailed)).toBeInTheDocument();
    });
  });
});
