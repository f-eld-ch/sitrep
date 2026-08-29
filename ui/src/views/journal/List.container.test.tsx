import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { loadingResult, errorResult, readyResult } from "api/testing/results";
import type { Message } from "types";
import { Medium, PriorityStatus, TriageStatus } from "types";
import List from "./List";

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ journalId: "j-1" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "de" } }),
}));
vi.mock("react-to-print", () => ({ useReactToPrint: () => vi.fn() }));
vi.mock("dayjs", () => ({
  __esModule: true,
  default: Object.assign(
    () => ({ format: () => "formatted-date", locale: () => ({ format: () => "formatted-date" }) }),
    { extend: vi.fn(), locale: vi.fn() },
  ),
}));
vi.mock("@openfeature/react-sdk", () => ({
  useBooleanFlagValue: () => false,
}));

vi.mock("components", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

vi.mock("api", () => ({ useJournalMessages: vi.fn() }));

const baseMessage: Message = {
  id: "msg-1",
  number: 1,
  content: "Test content",
  sender: "Alpha",
  senderDetail: "",
  receiver: "HQ",
  receiverDetail: "",
  medium: Medium.Radio,
  time: new Date("2024-03-15T09:00:00Z"),
  createdAt: new Date("2024-03-15T09:00:00Z"),
  updatedAt: new Date("2024-03-15T09:00:00Z"),
  deletedAt: new Date(0),
  divisions: [],
  triageId: TriageStatus.Pending,
  priorityId: PriorityStatus.Normal,
};

describe("journal/List (container)", () => {
  it("shows a spinner while loading", async () => {
    const { useJournalMessages } = await import("api");
    vi.mocked(useJournalMessages).mockReturnValue(loadingResult());
    render(<List showControls={false} />);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows an error notification on query failure", async () => {
    const { useJournalMessages } = await import("api");
    const err = Object.assign(new Error("Journal not found"), { code: "NOT_FOUND" as const });
    vi.mocked(useJournalMessages).mockReturnValue(errorResult(err));
    render(<List showControls={false} />);
    expect(screen.getByText("Journal not found")).toBeInTheDocument();
  });

  it("renders the message list when data is ready", async () => {
    const { useJournalMessages } = await import("api");
    vi.mocked(useJournalMessages).mockReturnValue(
      readyResult({ messages: [baseMessage], incidentDivisions: [] }),
    );
    render(<List showControls={false} />);
    expect(screen.getAllByText("Test content").length).toBeGreaterThan(0);
  });

  it("renders an empty table when there are no messages", async () => {
    const { useJournalMessages } = await import("api");
    vi.mocked(useJournalMessages).mockReturnValue(
      readyResult({ messages: [], incidentDivisions: [] }),
    );
    render(<List showControls={false} />);
    expect(screen.queryByText("Test content")).not.toBeInTheDocument();
  });
});
