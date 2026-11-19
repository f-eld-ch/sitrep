import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { errorResult, loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import GroupDetail from "./GroupDetail";

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
  useAccessUsers: vi.fn(),
  useGroupMembers: vi.fn(),
  useAddGroupMember: vi.fn(),
  useRemoveGroupMember: vi.fn(),
  useRenameAccessGroup: vi.fn(),
  useUpdateAccessGroupDescription: vi.fn(),
  useArchiveAccessGroup: vi.fn(),
}));
vi.mock("api", () => api);

const idle = { loading: false, error: undefined };
const alice = { sub: "u1", name: "Alice", email: "alice@example.org" };
const bob = { sub: "u2", name: "Bob", email: "bob@example.org" };
const carol = { sub: "u3", name: "", email: "carol@example.org" };

const activeGroup = { id: "g1", name: "Stab", description: "Fuehrung", archivedAt: null };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/groups/g1"]}>
      <Routes>
        <Route path="/admin/groups/:groupId" element={<GroupDetail />} />
        <Route path="/admin/access/groups" element={<p>groups list</p>} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GroupDetail", () => {
  const addMember = vi.fn();
  const removeMember = vi.fn();
  const renameGroup = vi.fn();
  const updateDescription = vi.fn();
  const archiveGroup = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    language = "de";
    for (const fn of [addMember, removeMember, renameGroup, updateDescription, archiveGroup]) {
      fn.mockResolvedValue(undefined);
    }
    api.useAddGroupMember.mockReturnValue([addMember, idle]);
    api.useRemoveGroupMember.mockReturnValue([removeMember, idle]);
    api.useRenameAccessGroup.mockReturnValue([renameGroup, idle]);
    api.useUpdateAccessGroupDescription.mockReturnValue([updateDescription, idle]);
    api.useArchiveAccessGroup.mockReturnValue([archiveGroup, idle]);
    api.useAccessGroups.mockReturnValue(readyResult({ groups: [activeGroup] }));
    api.useAccessUsers.mockReturnValue(readyResult({ users: [alice, bob, carol] }));
    api.useGroupMembers.mockReturnValue(readyResult({ subjects: ["u1"] }));
  });

  it("looks up the members of the group in the url", () => {
    renderPage();

    expect(api.useGroupMembers).toHaveBeenCalledWith("g1");
  });

  it("shows no content while the groups are loading", () => {
    api.useAccessGroups.mockReturnValue(loadingResult());
    renderPage();

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows the error message when the groups fail to load", () => {
    api.useAccessGroups.mockReturnValue(errorResult(new ApiError("INTERNAL_ERROR", "boom")));
    renderPage();

    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("leaves the page when forbidden", async () => {
    api.useAccessGroups.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "nope")));
    renderPage();

    expect(await screen.findByText("home page")).toBeInTheDocument();
  });

  it.each([
    ["de", de.adminGroupDetail.groupNotFound],
    ["fr", fr.adminGroupDetail.groupNotFound],
    ["it", it_.adminGroupDetail.groupNotFound],
  ])("tells in %s that an unknown group does not exist", (lang, text) => {
    language = lang;
    api.useAccessGroups.mockReturnValue(readyResult({ groups: [] }));
    renderPage();

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("shows the group, its member count and its members", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Stab" })).toBeInTheDocument();
    expect(screen.getByText("Fuehrung")).toBeInTheDocument();
    expect(screen.getByText("1 Mitglied")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.org")).toBeInTheDocument();
  });

  it("pluralises the member count", () => {
    api.useGroupMembers.mockReturnValue(readyResult({ subjects: ["u1", "u2"] }));
    renderPage();

    expect(screen.getByText("2 Mitglieder")).toBeInTheDocument();
  });

  it("falls back to the subject for a member the user list does not know", () => {
    api.useGroupMembers.mockReturnValue(readyResult({ subjects: ["ghost"] }));
    renderPage();

    expect(screen.getByText("ghost")).toBeInTheDocument();
  });

  it("shows the empty members state", () => {
    api.useGroupMembers.mockReturnValue(readyResult({ subjects: [] }));
    renderPage();

    expect(screen.getByText(de.adminGroupDetail.noMembersYet)).toBeInTheDocument();
  });

  it("shows a spinner and then no table while members load, and an error when they fail", () => {
    api.useGroupMembers.mockReturnValue(loadingResult());
    const { unmount } = renderPage();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Mitglieder hinzufügen" }),
    ).not.toBeInTheDocument();
    unmount();

    api.useGroupMembers.mockReturnValue(
      errorResult(new ApiError("INTERNAL_ERROR", "members down")),
    );
    renderPage();
    expect(screen.getByText("members down")).toBeInTheDocument();
  });

  describe("members", () => {
    it("adds a user who is not yet a member", async () => {
      renderPage();

      const row = screen.getByText("Bob").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: "Hinzufügen" }));

      expect(addMember).toHaveBeenCalledWith({ groupId: "g1", subject: "u2" });
      await waitFor(() => expect(within(row).getByRole("button")).toBeEnabled());
    });

    it("does not offer existing members for adding", () => {
      renderPage();

      expect(screen.getAllByText("Alice")).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Hinzufügen" })).toHaveLength(2);
    });

    it("keeps the add button disabled while the request is running", async () => {
      let resolve: () => void = () => {};
      addMember.mockReturnValue(new Promise<void>((r) => (resolve = r)));
      renderPage();

      const row = screen.getByText("Bob").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: "Hinzufügen" }));
      await waitFor(() => expect(within(row).getByRole("button")).toBeDisabled());
      fireEvent.click(within(row).getByRole("button"));
      expect(addMember).toHaveBeenCalledTimes(1);

      resolve();
      await waitFor(() => expect(within(row).getByRole("button")).toBeEnabled());
    });

    it("filters addable users by name, email or subject", () => {
      renderPage();

      fireEvent.change(screen.getByPlaceholderText("Nach Name, E-Mail oder Kennung suchen"), {
        target: { value: "CAROL@" },
      });

      expect(screen.getByText("carol@example.org")).toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    });

    it("says when no user matches the filter", () => {
      renderPage();

      fireEvent.change(screen.getByPlaceholderText("Nach Name, E-Mail oder Kennung suchen"), {
        target: { value: "zzz" },
      });

      expect(screen.getByText(de.adminGroupDetail.noUsersMatch)).toBeInTheDocument();
    });

    it("says when everybody is already a member", () => {
      api.useGroupMembers.mockReturnValue(readyResult({ subjects: ["u1", "u2", "u3"] }));
      renderPage();

      expect(screen.getByText(de.adminGroupDetail.allUsersMembers)).toBeInTheDocument();
    });

    it("shows the user list error in the add section", () => {
      api.useAccessUsers.mockReturnValue(errorResult(new ApiError("INTERNAL_ERROR", "users down")));
      renderPage();

      expect(screen.getByText("users down")).toBeInTheDocument();
    });

    it("removes a member", async () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Aus Gruppe entfernen" }));

      expect(removeMember).toHaveBeenCalledWith({ groupId: "g1", subject: "u1" });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Aus Gruppe entfernen" })).toBeEnabled(),
      );
    });

    it("survives a failing add and shows the command error", async () => {
      addMember.mockRejectedValue(new Error("add failed"));
      api.useAddGroupMember.mockReturnValue([
        addMember,
        { loading: false, error: new ApiError("INTERNAL_ERROR", "add failed") },
      ]);
      renderPage();

      const row = screen.getByText("Bob").closest("tr") as HTMLElement;
      fireEvent.click(within(row).getByRole("button", { name: "Hinzufügen" }));

      expect(screen.getByText("add failed")).toBeInTheDocument();
      await waitFor(() => expect(within(row).getByRole("button")).toBeEnabled());
    });
  });

  describe("renaming", () => {
    const start = () => fireEvent.click(screen.getByTitle("Gruppe umbenennen"));
    const input = () => screen.getByPlaceholderText("Gruppenname");

    it("saves a trimmed new name", async () => {
      renderPage();
      start();
      expect(input()).toHaveValue("Stab");

      fireEvent.change(input(), { target: { value: "  Fuehrungsstab " } });
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

      expect(renameGroup).toHaveBeenCalledWith({ groupId: "g1", name: "Fuehrungsstab" });
      await waitFor(() => expect(screen.queryByPlaceholderText("Gruppenname")).toBeNull());
    });

    it.each([
      ["a blank name", "   "],
      ["the unchanged name", "Stab"],
    ])("does not call the api for %s", (_n, value) => {
      renderPage();
      start();

      fireEvent.change(input(), { target: { value } });
      fireEvent.keyDown(input(), { key: "Enter" });

      expect(renameGroup).not.toHaveBeenCalled();
      expect(screen.queryByPlaceholderText("Gruppenname")).not.toBeInTheDocument();
    });

    it("cancels with Escape and the cancel button", () => {
      renderPage();
      start();
      fireEvent.keyDown(input(), { key: "Escape" });
      expect(screen.getByRole("heading", { name: "Stab" })).toBeInTheDocument();

      start();
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
      expect(screen.getByRole("heading", { name: "Stab" })).toBeInTheDocument();
      expect(renameGroup).not.toHaveBeenCalled();
    });

    it("warns near the length limit", () => {
      renderPage();
      start();

      fireEvent.change(input(), { target: { value: "x".repeat(64) } });

      expect(screen.getByText("0 / 64")).toBeInTheDocument();
    });
  });

  describe("description", () => {
    const start = () => fireEvent.click(screen.getByTitle("Beschreibung bearbeiten"));
    const input = () => screen.getByPlaceholderText("Kurze Beschreibung des Zwecks dieser Gruppe");

    it("saves a changed description", async () => {
      renderPage();
      start();
      expect(input()).toHaveValue("Fuehrung");

      fireEvent.change(input(), { target: { value: "Neu" } });
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

      expect(updateDescription).toHaveBeenCalledWith({ groupId: "g1", description: "Neu" });
      await waitFor(() =>
        expect(
          screen.queryByPlaceholderText("Kurze Beschreibung des Zwecks dieser Gruppe"),
        ).not.toBeInTheDocument(),
      );
    });

    it("does not call the api when nothing changed, and cancels on Escape", () => {
      renderPage();
      start();
      fireEvent.keyDown(input(), { key: "Enter" });
      expect(updateDescription).not.toHaveBeenCalled();
      expect(screen.getByText("Fuehrung")).toBeInTheDocument();

      start();
      fireEvent.change(input(), { target: { value: "x" } });
      fireEvent.keyDown(input(), { key: "Escape" });
      expect(updateDescription).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTitle("Beschreibung bearbeiten"));
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
      expect(screen.getByText("Fuehrung")).toBeInTheDocument();
    });

    it("invites to add a description when there is none", () => {
      api.useAccessGroups.mockReturnValue(
        readyResult({ groups: [{ ...activeGroup, description: "" }] }),
      );
      renderPage();

      expect(screen.getByText(de.adminGroupDetail.noDescriptionClick)).toBeInTheDocument();
    });
  });

  describe("archiving", () => {
    it("asks for confirmation, archives, and returns to the group list", async () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Gruppe archivieren" }));
      expect(archiveGroup).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Archivierung bestätigen" }));

      expect(archiveGroup).toHaveBeenCalledWith({ groupId: "g1" });
      expect(await screen.findByText("groups list")).toBeInTheDocument();
    });

    it("can back out of the confirmation", () => {
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Gruppe archivieren" }));
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

      expect(screen.getByRole("button", { name: "Gruppe archivieren" })).toBeInTheDocument();
      expect(archiveGroup).not.toHaveBeenCalled();
    });

    it("shows the command error", () => {
      api.useArchiveAccessGroup.mockReturnValue([
        archiveGroup,
        { loading: false, error: new ApiError("INTERNAL_ERROR", "archive failed") },
      ]);
      renderPage();

      expect(screen.getByText("archive failed")).toBeInTheDocument();
    });

    it("makes an archived group read-only", () => {
      api.useAccessGroups.mockReturnValue(
        readyResult({ groups: [{ ...activeGroup, archivedAt: new Date() }] }),
      );
      renderPage();

      expect(screen.getByText(de.adminGroupDetail.groupArchived)).toBeInTheDocument();
      expect(screen.queryByTitle("Gruppe umbenennen")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Beschreibung bearbeiten")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Gruppe archivieren" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Aus Gruppe entfernen" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Mitglieder hinzufügen" }),
      ).not.toBeInTheDocument();
    });
  });
});
