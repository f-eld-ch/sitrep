import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Incident } from "types/incident";
import { ApiError } from "../../api/errors";
import { errorResult, loadingResult, readyResult } from "../../api/testing/results";
import de from "../../i18n/locales/de/translations.json";
import Editor from "./Editor";

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

const api = vi.hoisted(() => ({ useIncidentDetails: vi.fn() }));
vi.mock("api", () => api);

// The form and the access section are tested on their own.
vi.mock("./New", () => ({
  IncidentForm: ({ incident }: { incident: Incident }) => <p>form for {incident.name}</p>,
}));
vi.mock("./Access", () => ({
  default: ({ incidentId }: { incidentId: string }) => <p>access of {incidentId}</p>,
}));

const incident = (canManageAccess: boolean) =>
  ({ id: "i1", name: "Hochwasser", canManageAccess }) as Incident;

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/incident/i1/edit"]}>
      <Routes>
        <Route path="/incident/:incidentId/edit" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Editor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads the incident from the url", () => {
    api.useIncidentDetails.mockReturnValue(loadingResult());
    renderEditor();

    expect(api.useIncidentDetails).toHaveBeenCalledWith("i1");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows the translated error", () => {
    api.useIncidentDetails.mockReturnValue(errorResult(new ApiError("NOT_FOUND")));
    renderEditor();

    expect(screen.getByText(de.errors.NOT_FOUND)).toBeInTheDocument();
  });

  it("shows the form and the access section to those who can manage access", () => {
    api.useIncidentDetails.mockReturnValue(readyResult({ incident: incident(true) }));
    renderEditor();

    expect(screen.getByRole("heading", { name: de.editIncident })).toBeInTheDocument();
    expect(screen.getByText("form for Hochwasser")).toBeInTheDocument();
    expect(screen.getByText("access of i1")).toBeInTheDocument();
  });

  it("hides the access section from everyone else", () => {
    api.useIncidentDetails.mockReturnValue(readyResult({ incident: incident(false) }));
    renderEditor();

    expect(screen.getByText("form for Hochwasser")).toBeInTheDocument();
    expect(screen.queryByText("access of i1")).not.toBeInTheDocument();
  });
});
