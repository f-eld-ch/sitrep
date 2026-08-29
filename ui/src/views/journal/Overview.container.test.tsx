import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readyResult, loadingResult, errorResult } from "api/testing/results";
import { IncidentContextProvider } from "utils";
import type { Journal } from "types";
import Overview from "./Overview";

const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ incidentId: "inc-1" }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("dayjs", () => ({
  __esModule: true,
  default: Object.assign(() => ({ format: () => "formatted-date" }), { extend: vi.fn() }),
}));
vi.mock("dayjs/plugin/localizedFormat", () => ({ default: {} }));
vi.mock("dayjs/plugin/relativeTime", () => ({ default: {} }));

const noop = vi.fn().mockResolvedValue(undefined);
const noopState = { loading: false, error: undefined };

vi.mock("components", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

vi.mock("api", () => ({
  useJournals: vi.fn(),
  useCloseJournal: vi.fn(() => [noop, noopState]),
  useReopenJournal: vi.fn(() => [noop, noopState]),
}));

const openJournal: Journal = {
  id: "j-1",
  name: "Alpha Log",
  incident: {} as Journal["incident"],
  createdAt: new Date("2024-03-15"),
  updatedAt: new Date("2024-03-15"),
  closedAt: null as unknown as Date,
  deletedAt: null as unknown as Date,
};

const closedJournal: Journal = {
  ...openJournal,
  id: "j-2",
  name: "Closed Log",
  closedAt: new Date("2024-03-16") as Date,
};

function renderOverview() {
  return render(
    <IncidentContextProvider>
      <Overview />
    </IncidentContextProvider>,
  );
}

describe("Overview (container)", () => {
  it("shows a spinner while loading", async () => {
    const { useJournals } = await import("api");
    vi.mocked(useJournals).mockReturnValue(loadingResult());
    renderOverview();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows an error notification on query failure", async () => {
    const { useJournals } = await import("api");
    const err = Object.assign(new Error("Failed to fetch"), { code: "UNKNOWN" as const });
    vi.mocked(useJournals).mockReturnValue(errorResult(err));
    renderOverview();
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
  });

  it("renders journal cards when data is ready", async () => {
    const { useJournals } = await import("api");
    vi.mocked(useJournals).mockReturnValue(
      readyResult({ incidentName: "Forest Fire", journals: [openJournal] }),
    );
    renderOverview();
    expect(screen.getByText("Alpha Log")).toBeInTheDocument();
  });

  it("hides closed journals by default", async () => {
    const { useJournals } = await import("api");
    vi.mocked(useJournals).mockReturnValue(
      readyResult({ incidentName: "Forest Fire", journals: [openJournal, closedJournal] }),
    );
    renderOverview();
    expect(screen.getByText("Alpha Log")).toBeInTheDocument();
    expect(screen.queryByText("Closed Log")).not.toBeInTheDocument();
  });

  it("shows closed journals after toggling the filter", async () => {
    const { useJournals } = await import("api");
    vi.mocked(useJournals).mockReturnValue(
      readyResult({ incidentName: "Forest Fire", journals: [openJournal, closedJournal] }),
    );
    renderOverview();
    // The filter toggle button contains the i18n key "showClosed"
    fireEvent.click(screen.getByText("showClosed"));
    expect(screen.getByText("Closed Log")).toBeInTheDocument();
  });

  it("renders no cards for an empty journal list", async () => {
    const { useJournals } = await import("api");
    vi.mocked(useJournals).mockReturnValue(
      readyResult({ incidentName: "Forest Fire", journals: [] }),
    );
    renderOverview();
    expect(screen.queryByRole("button", { name: /write/i })).not.toBeInTheDocument();
  });
});
