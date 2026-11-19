import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors";
import { errorResult, loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import AdminLayout from "./AdminLayout";

// The real locale file, so a missing translation fails the test.
function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language: "de" } }),
}));

const api = vi.hoisted(() => ({
  useAccessGroups: vi.fn(),
  useGlobalRoles: vi.fn(),
}));
vi.mock("api", () => api);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="groups" element={<p>groups content</p>} />
          <Route path="groups/:groupId" element={<p>group content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const groups = [
  { id: "g1", name: "Alpha", description: "", archivedAt: null },
  { id: "g2", name: "Old", description: "", archivedAt: new Date() },
];

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.useAccessGroups.mockReturnValue(readyResult({ groups }));
    api.useGlobalRoles.mockReturnValue(readyResult({ grants: [] }));
  });

  it("shows the section menu with active groups and the routed content", () => {
    renderAt("/admin/groups");

    expect(screen.getByRole("heading", { name: "Administration" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gruppen" })).toHaveAttribute("href", "/admin/groups");
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/admin/groups/g1");
    expect(screen.queryByRole("link", { name: "Old" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Globale Rollen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Standard-Zugang" })).toBeInTheDocument();
    expect(screen.getByText("groups content")).toBeInTheDocument();
  });

  it("marks the open group in the menu", () => {
    renderAt("/admin/groups/g1");

    expect(screen.getByRole("link", { name: "Alpha" }).className).toContain("bg-primary");
    expect(screen.getByRole("link", { name: "Gruppen" }).className).not.toContain("bg-primary");
  });

  it("hides the global-only sections until the global roles are readable", () => {
    api.useGlobalRoles.mockReturnValue(errorResult(new ApiError("FORBIDDEN", "no")));
    renderAt("/admin/groups");

    expect(screen.queryByRole("link", { name: "Globale Rollen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Standard-Zugang" })).not.toBeInTheDocument();
  });

  it("shows no group entries while groups are loading", () => {
    api.useAccessGroups.mockReturnValue(loadingResult());
    renderAt("/admin/groups");

    expect(screen.queryByRole("link", { name: "Alpha" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gruppen" })).toBeInTheDocument();
  });
});
