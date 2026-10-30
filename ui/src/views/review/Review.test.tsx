import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncidentReview } from "types";
import Review from "./Review";

const mocks = vi.hoisted(() => ({
  result: { current: undefined as unknown },
  print: vi.fn(),
  printOptions: { current: undefined as Record<string, unknown> | undefined },
}));

vi.mock("react-to-print", () => ({
  useReactToPrint: (options: Record<string, unknown>) => {
    mocks.printOptions.current = options;

    return mocks.print;
  },
}));

vi.mock("api", () => ({ useIncidentReview: () => mocks.result.current }));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useParams: () => ({ incidentId: "inc-1" }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

const duration = { count: 8, median: 252, p90: 660, max: 1380 };
const triageBuckets = [
  { from: 0, to: 30, count: 5 },
  { from: 30, to: 60, count: 20 },
  { from: 60, to: 120, count: 40 },
  { from: 120, to: 300, count: 15 },
  { from: 300, to: null, count: 7 },
];
const drawBuckets = [
  { from: 0, to: 60, count: 30 },
  { from: 60, to: null, count: 28 },
];

const benchmark = {
  value: 252,
  peers: 18,
  sufficient: true,
  lowest: 60,
  q1: 180,
  median: 330,
  q3: 600,
  highest: 1800,
  betterThan: 0.7,
};

const review: IncidentReview = {
  comparison: {
    triageMedian: benchmark,
    triageRatio: {
      ...benchmark,
      value: 0.87,
      lowest: 0.5,
      q1: 0.7,
      median: 0.8,
      q3: 0.9,
      highest: 1,
      betterThan: 0.8,
    },
    drawMedian: { ...benchmark, peers: 3, sufficient: false, betterThan: null },
    drawRatio: { ...benchmark, value: null, peers: 0, sufficient: false, betterThan: null },
  },
  openedAt: new Date("2026-01-15T10:00:00Z"),
  closedAt: new Date("2026-01-15T12:30:00Z"),
  messageCount: 100,
  triage: { total: 100, completed: 87, ratio: 0.87, duration, distribution: triageBuckets },
  draw: {
    total: 58,
    completed: 58,
    ratio: 1,
    duration: { ...duration, median: 160 },
    distribution: drawBuckets,
  },
  triageHigh: { count: 12, duration: { ...duration, median: 60 } },
  triageNormal: { count: 75, duration },
  divisions: [
    {
      id: "d1",
      name: "FW",
      description: "Feuerwehr Altdorf",
      kind: "STANDARD",
      assigned: 41,
      acknowledged: 39,
      duration,
    },
    {
      id: "d2",
      name: "San",
      description: "Sanität Region Uri",
      kind: "STANDARD",
      assigned: 28,
      acknowledged: 28,
      duration: null,
    },
    {
      id: "d3",
      name: "Karte",
      description: "Nachrichtenkarte",
      kind: "MESSAGE_MAP",
      assigned: 58,
      acknowledged: 58,
      duration,
    },
  ],
  unassigned: 9,
  rework: { total: 100, moreInfo: 4, reset: 2, correctedAfterTriage: 6, reworked: 10 },
  reportingLag: { count: 100, median: 180, p90: 600, max: 1800 },
  load: {
    bucketSeconds: 900,
    peakEntered: 14,
    peakEnteredAt: new Date("2026-01-15T11:00:00Z"),
    peakBacklog: 6,
    peakBacklogAt: new Date("2026-01-15T11:15:00Z"),
    buckets: [
      { start: new Date("2026-01-15T10:00:00Z"), entered: 3, backlog: 1 },
      { start: new Date("2026-01-15T10:15:00Z"), entered: 14, backlog: 6 },
      { start: new Date("2026-01-15T10:30:00Z"), entered: 5, backlog: 0 },
    ],
  },
};

const ready = (value: IncidentReview | null) => ({
  status: "ready",
  data: { incidentName: "Hochwasser", review: value },
  isRefreshing: false,
});

const renderReview = () =>
  render(
    <MemoryRouter>
      <Review />
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.result.current = ready(review);
  mocks.print.mockClear();
  mocks.printOptions.current = undefined;
});

describe("Review", () => {
  it("names the incident and sums it up", () => {
    renderReview();

    expect(screen.getByText("review.title · Hochwasser")).toBeInTheDocument();
    expect(screen.getByText("review.closed")).toBeInTheDocument();
    expect(screen.getByText("2 h 30 min")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.queryByText("review.interim")).toBeNull();
  });

  it("shows how fast messages were triaged and drawn, and how many got that far", () => {
    renderReview();

    const triage = within(screen.getByTestId("review-triage"));
    expect(triage.getByText("87 %")).toBeInTheDocument();
    expect(triage.getByText(/review.neverTriaged.*"count":13/)).toBeInTheDocument();
    expect(triage.getByText("4 min 12 s")).toBeInTheDocument();

    const draw = within(screen.getByTestId("review-draw"));
    expect(draw.getByText("100 %")).toBeInTheDocument();
    expect(draw.queryByText(/review.neverDrawn/)).toBeNull();
    expect(draw.getByText("2 min 40 s")).toBeInTheDocument();
  });

  it("folds the comparison away, saying how the time compares in its heading", () => {
    renderReview();

    const details = screen
      .getByTestId("review-triage")
      .querySelector<HTMLDetailsElement>("details");

    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);

    const summary = details?.querySelector("summary") as HTMLElement;
    expect(within(summary).getByText("review.comparisonTitle")).toBeInTheDocument();
    // Folded away, it still says the one thing most want to know.
    expect(within(summary).getByText(/review.fasterThan.*"percent":70/)).toBeInTheDocument();

    fireEvent.click(summary);
    expect(details?.open).toBe(true);
  });

  it("has no teaser in the heading when there is nothing to rank against", () => {
    renderReview();

    const summary = screen
      .getByTestId("review-draw")
      .querySelector("details > summary") as HTMLElement;

    expect(within(summary).getByText("review.comparisonTitle")).toBeInTheDocument();
    expect(within(summary).queryByText(/review.fasterThan/)).toBeNull();
  });

  it("sets each step against the other incidents, inside its box", () => {
    renderReview();

    const triage = within(screen.getByTestId("review-triage"));
    expect(triage.getByText("review.comparisonTitle")).toBeInTheDocument();
    expect(triage.getAllByTestId("benchmark")).toHaveLength(2);
    expect(triage.getByText(/review.typical.*"5 min 30 s"/)).toBeInTheDocument();
    // Once in the folded heading, once under the strip.
    expect(triage.getAllByText(/review.fasterThan.*"percent":70/)).toHaveLength(2);
    expect(triage.getByText(/review.higherThan.*"percent":80/)).toBeInTheDocument();
    expect(triage.getByText("review.legendThis")).toBeInTheDocument();
  });

  it("says why there is no comparison, instead of leaving a gap", () => {
    renderReview();

    const draw = within(screen.getByTestId("review-draw"));
    expect(draw.getByText(/review.fewPeers.*"peers":3/)).toBeInTheDocument();
    expect(draw.getByText("review.noPeers")).toBeInTheDocument();
    expect(draw.queryByText(/review.fasterThan/)).toBeNull();
  });

  it("splits the triage time by priority, with a pie of how many of each", () => {
    renderReview();

    const priority = within(screen.getByTestId("review-priority"));
    // Once in the legend of the pie, once above the times of that priority.
    expect(priority.getAllByText("review.priorityHigh")).toHaveLength(2);
    expect(priority.getAllByText("review.priorityNormal")).toHaveLength(2);
    expect(priority.getByText("1 min")).toBeInTheDocument();
    // The times are time to triage, said above each of them.
    expect(priority.getAllByText("review.timeToTriage")).toHaveLength(2);
    // 12 high and 75 normal of the 87 triaged: the legend carries the share, whole percent.
    expect(
      priority.getByText(/review.priorityShare.*"count":12.*"percent":13/),
    ).toBeInTheDocument();
    expect(
      priority.getByText(/review.priorityShare.*"count":75.*"percent":86/),
    ).toBeInTheDocument();
    expect(priority.getByRole("figure")).toBeInTheDocument();
  });

  it("puts the priority split on a line of its own, below the two times", () => {
    renderReview();

    const draw = screen.getByTestId("review-draw");
    const priority = screen.getByTestId("review-priority");

    expect(draw.compareDocumentPosition(priority) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Not in the same row of the grid the two times sit in.
    expect(draw.parentElement).not.toBe(priority.parentElement);
  });

  it("shows no pie when nothing was triaged", () => {
    mocks.result.current = ready({
      ...review,
      triageHigh: { count: 0, duration: null },
      triageNormal: { count: 0, duration: null },
    });
    renderReview();

    const priority = within(screen.getByTestId("review-priority"));
    expect(priority.queryByRole("figure")).toBeNull();
    expect(priority.getAllByText("review.noneTriaged")).toHaveLength(2);
  });

  it("spreads the messages over the divisions, busiest first, with the ones nobody got", () => {
    renderReview();

    const section = screen.getByRole("region", { name: "review.divisions" });
    const names = within(section)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");

    // The full names, not the short ones; the Nachrichtenkarte is translated.
    expect(names[0]).toContain("divisionsNames.Karte.description");
    expect(names[1]).toContain("Feuerwehr Altdorf");
    expect(names[2]).toContain("Sanität Region Uri");
    expect(names.join(" ")).not.toMatch(/\bFW\b|\bSan\b/);
    expect(names[3]).toContain("review.unassigned");
    // The Nachrichtenkarte acknowledges by drawing, the others by acknowledging.
    expect(names[0]).toMatch(/review.drawnOf/);
    expect(names[1]).toMatch(/review.acknowledged.*"acknowledged":39/);
  });

  it("shows the load with its peaks, and the numbers as a table", () => {
    renderReview();

    expect(screen.getByText(/review.peakEntered.*"count":14/)).toBeInTheDocument();
    expect(screen.getByText(/review.peakBacklog.*"count":6/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "review.load" })).getAllByRole("figure"),
    ).toHaveLength(2);
    // Rows are in the DOM (inside the closed <details>), one per bucket.
    expect(screen.getAllByRole("row", { hidden: true })).toHaveLength(1 + 3);
  });

  it("shows how the times are spread inside the box of each step", () => {
    renderReview();

    const triage = within(screen.getByTestId("review-triage"));
    expect(triage.getByRole("figure")).toBeInTheDocument();
    // Every other range is labelled; each bar carries its count and range in a tooltip.
    expect(triage.getByText("< 30 s")).toBeInTheDocument();
    expect(triage.getByText("1–2 min")).toBeInTheDocument();
    expect(triage.getByText("> 5 min")).toBeInTheDocument();
    expect(triage.queryByText("30 s–1 min")).toBeNull();
    expect(
      screen.getByTestId("review-triage").querySelector('[title="30 s–1 min: 20"]'),
    ).not.toBeNull();

    const draw = within(screen.getByTestId("review-draw"));
    expect(draw.getByRole("figure")).toBeInTheDocument();
    expect(draw.getByText("< 1 min")).toBeInTheDocument();
  });

  it("shows what had to be done again and the reporting lag", () => {
    renderReview();

    expect(screen.getByText(/review.reworkSummary.*"reworked":10/)).toBeInTheDocument();
    expect(screen.getByText("review.lag")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();
  });

  it("says it is an interim status while the incident is open", () => {
    mocks.result.current = ready({ ...review, closedAt: null });
    renderReview();

    expect(screen.getByText("review.interim")).toBeInTheDocument();
    expect(screen.getByText("review.open")).toBeInTheDocument();
  });

  it("explains when there is no review, because the incident was imported", () => {
    mocks.result.current = ready(null);
    renderReview();

    expect(screen.getByText("review.notAvailable")).toBeInTheDocument();
    expect(screen.queryByTestId("review-triage")).toBeNull();
  });

  it("shows empty figures as such, without a share of nothing", () => {
    mocks.result.current = ready({
      ...review,
      messageCount: 0,
      triage: { total: 0, completed: 0, ratio: null, duration: null, distribution: [] },
      draw: { total: 0, completed: 0, ratio: null, duration: null, distribution: [] },
      triageHigh: { count: 0, duration: null },
      triageNormal: { count: 0, duration: null },
      divisions: review.divisions.map((d) => ({
        ...d,
        assigned: 0,
        acknowledged: 0,
        duration: null,
      })),
      unassigned: 0,
      rework: { total: 0, moreInfo: 0, reset: 0, correctedAfterTriage: 0, reworked: 0 },
      reportingLag: null,
      load: {
        ...review.load,
        buckets: [],
        peakEntered: 0,
        peakEnteredAt: null,
        peakBacklog: 0,
        peakBacklogAt: null,
      },
    });
    renderReview();

    expect(
      within(screen.getByTestId("review-triage")).getByText("review.noMessages"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("review-draw")).getByText("review.noDrawMessages"),
    ).toBeInTheDocument();
    expect(screen.getByText("review.noTriaged")).toBeInTheDocument();
    expect(screen.queryByText("review.lag")).toBeNull();
    expect(screen.queryByRole("figure")).toBeNull();
  });

  it("shows an error", () => {
    mocks.result.current = { status: "error", error: { code: "UNKNOWN" }, isRefreshing: false };
    renderReview();

    expect(screen.getByText("errors.UNKNOWN")).toBeInTheDocument();
  });
});

describe("Review as a PDF", () => {
  it("has a button that prints the report, hidden from the printout itself", () => {
    renderReview();

    const button = screen.getByRole("button", { name: "review.pdf" });
    expect(button).toHaveClass("print:hidden");
    expect(button).toHaveAttribute("title", "review.pdfHint");

    fireEvent.click(button);
    expect(mocks.print).toHaveBeenCalledTimes(1);
  });

  it("names the file after the incident and prints an upright A4", () => {
    renderReview();

    expect(mocks.printOptions.current?.documentTitle).toBe("review.title - Hochwasser");
    expect(mocks.printOptions.current?.pageStyle).toContain("A4 portrait");
  });

  it("unfolds the comparisons for the printout and folds them again afterwards", async () => {
    const { container } = renderReview();
    const options = mocks.printOptions.current as {
      onBeforePrint: () => Promise<void>;
      onAfterPrint: () => void;
    };

    const comparisons = Array.from(
      container.querySelectorAll<HTMLDetailsElement>("details[data-print-open]"),
    );
    const table = container.querySelector<HTMLDetailsElement>("details:not([data-print-open])");
    expect(comparisons.length).toBeGreaterThan(0);
    expect(comparisons.every((d) => !d.open)).toBe(true);

    await options.onBeforePrint();
    expect(comparisons.every((d) => d.open)).toBe(true);
    expect(table?.open).toBe(false);

    options.onAfterPrint();
    expect(comparisons.every((d) => !d.open)).toBe(true);
  });

  it("leaves the table of the load out of the printout", () => {
    const { container } = renderReview();

    const table = container.querySelector("details:not([data-print-open])");
    expect(table).toHaveClass("print:hidden");
  });

  it("has no button when there is no review to print", () => {
    mocks.result.current = ready(null);
    renderReview();

    expect(screen.queryByRole("button", { name: "review.pdf" })).toBeNull();
  });
});
