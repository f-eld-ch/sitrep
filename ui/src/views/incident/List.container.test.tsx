import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readyResult, loadingResult, errorResult } from "api/testing/results";
import { IncidentContextProvider } from "utils";
import type { Incident } from "../../types";
import List from "./List";

const mockNavigate = vi.fn();
vi.mock("react-router", () => ({ useNavigate: () => mockNavigate }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("dayjs", () => ({
  __esModule: true,
  default: () => ({ format: () => "formatted-date" }),
}));

const noop = vi.fn().mockResolvedValue(undefined);
const noopState = { loading: false, error: undefined };

vi.mock("components", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

vi.mock("api", () => ({
  useIncidents: vi.fn(),
  useCloseIncident: vi.fn(() => [noop, noopState]),
  useReopenIncident: vi.fn(() => [noop, noopState]),
  useDeleteIncident: vi.fn(() => [noop, noopState]),
}));

const baseIncident: Incident = {
  id: "inc-1",
  name: "Test Incident",
  location: { id: "loc-1", name: "Sector 7", coordinates: "47,8" },
  createdAt: new Date("2024-03-15"),
  updatedAt: null,
  deletedAt: null,
  closedAt: null,
  divisions: [],
  journals: [],
  layers: [],
};

function renderList() {
  return render(
    <IncidentContextProvider>
      <List />
    </IncidentContextProvider>,
  );
}

describe("List (container)", () => {
  it("shows a spinner while loading", async () => {
    const { useIncidents } = await import("api");
    vi.mocked(useIncidents).mockReturnValue(loadingResult());
    renderList();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows an error notification on query failure", async () => {
    const { useIncidents } = await import("api");
    const err = Object.assign(new Error("Network error"), { code: "UNKNOWN" as const });
    vi.mocked(useIncidents).mockReturnValue(errorResult(err));
    renderList();
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("renders incident cards when data is ready", async () => {
    const { useIncidents } = await import("api");
    vi.mocked(useIncidents).mockReturnValue(readyResult({ incidents: [baseIncident] }));
    renderList();
    expect(screen.getByText("Test Incident")).toBeInTheDocument();
  });

  it("renders no cards for an empty dataset", async () => {
    const { useIncidents } = await import("api");
    vi.mocked(useIncidents).mockReturnValue(readyResult({ incidents: [] }));
    renderList();
    expect(screen.queryByTestId("enter-button")).not.toBeInTheDocument();
  });

  it("hides closed incidents when filter is active (default)", async () => {
    const { useIncidents } = await import("api");
    const closed: Incident = {
      ...baseIncident,
      id: "inc-2",
      name: "Closed One",
      closedAt: new Date(),
    };
    vi.mocked(useIncidents).mockReturnValue(readyResult({ incidents: [baseIncident, closed] }));
    renderList();
    expect(screen.getByText("Test Incident")).toBeInTheDocument();
    expect(screen.queryByText("Closed One")).not.toBeInTheDocument();
  });
});
