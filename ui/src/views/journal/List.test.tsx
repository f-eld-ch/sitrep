import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { ApiError } from "api";
import { errorResult, loadingResult, readyResult } from "api/testing/results";
import { Medium, PriorityStatus, TriageStatus, type Division, type Message } from "types";
import List from "./List";

// The real locale file, so a missing translation fails the test.
function lookup(key: string | string[]): string {
  for (const k of Array.isArray(key) ? key : [key]) {
    const value = k
      .split(".")
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
    if (typeof value === "string") return value;
  }
  return Array.isArray(key) ? key[0] : key;
}
const t = lookup;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language: "de" } }),
}));

const print = vi.hoisted(() => vi.fn());
vi.mock("react-to-print", () => ({ useReactToPrint: () => print }));

const api = vi.hoisted(() => ({ useIncidentMessages: vi.fn(), useIncidentDetails: vi.fn() }));
vi.mock("api", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

const sc: Division = { id: "d-sc", name: "SC", description: "Stabschef", kind: "STANDARD" };
const police: Division = { id: "d-pol", name: "Pol", description: "Polizei", kind: "STANDARD" };

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    number: 1,
    content: `Inhalt ${id}`,
    sender: `Absender ${id}`,
    senderDetail: "",
    receiver: "Empfänger",
    receiverDetail: "",
    time: new Date("2026-01-15T10:00:00Z"),
    createdAt: new Date("2026-01-15T10:00:00Z"),
    updatedAt: new Date("2026-01-15T10:00:00Z"),
    deletedAt: new Date(0),
    divisions: [],
    medium: Medium.Radio,
    triageId: TriageStatus.Pending,
    priorityId: PriorityStatus.Normal,
    attachments: [],
    acknowledgements: [],
    author: "",
    ...overrides,
  };
}

const messages = [
  message("pending", { time: new Date("2026-01-15T10:00:00Z") }),
  message("done-high", {
    time: new Date("2026-01-15T11:00:00Z"),
    triageId: TriageStatus.Triaged,
    priorityId: PriorityStatus.High,
    divisions: [{ division: police }],
  }),
  message("done", {
    time: new Date("2026-01-15T12:00:00Z"),
    triageId: TriageStatus.Triaged,
    divisions: [{ division: sc }],
  }),
];

function renderList(props: Partial<React.ComponentProps<typeof List>> = {}) {
  return render(
    <MemoryRouter initialEntries={["/incident/i1/journal/messages"]}>
      <Routes>
        <Route
          path="/incident/:incidentId/journal/messages"
          element={<List showControls {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const shown = (id: string) => screen.queryByTestId(`content-${id}`);
const TRIAGE = 0;
const PRIORITY = 1;
const ASSIGNMENT = 2;
const filter = (index: number) => screen.getAllByRole("combobox")[index];

describe("List", () => {
  beforeEach(() => {
    print.mockReset();
    api.useIncidentMessages.mockReturnValue(
      readyResult({ messages, incidentDivisions: [sc, police] }),
    );
    api.useIncidentDetails.mockReturnValue(readyResult({ incident: { name: "Hochwasser" } }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows no list while loading", () => {
    api.useIncidentMessages.mockReturnValue(loadingResult());

    renderList();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(shown("pending")).not.toBeInTheDocument();
  });

  it("explains an error with the message of its code", () => {
    api.useIncidentMessages.mockReturnValue(errorResult(new ApiError("FORBIDDEN")));

    renderList();

    expect(screen.getByText(t("errors.FORBIDDEN"))).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("asks for the incident of the route", () => {
    renderList();

    expect(api.useIncidentMessages).toHaveBeenCalledWith("i1");
    expect(api.useIncidentDetails).toHaveBeenCalledWith("i1");
  });

  it("lists the messages newest first", () => {
    renderList();

    const order = screen.getAllByTestId(/^content-/).map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["content-done", "content-done-high", "content-pending"]);
  });

  it.each([
    ["triage", TRIAGE, TriageStatus.Pending, ["pending"]],
    ["triage", TRIAGE, TriageStatus.Triaged, ["done", "done-high"]],
    ["priority", PRIORITY, PriorityStatus.High, ["done-high"]],
    ["division", ASSIGNMENT, "SC", ["done"]],
  ])("filters by %s", (_name, index, value, expected) => {
    renderList();

    fireEvent.change(filter(index), { target: { value } });

    const visible = ["pending", "done-high", "done"].filter((id) => shown(id) !== null);
    expect(visible.sort()).toEqual([...expected].sort());
  });

  it("offers every division of the incident as a filter, by its long label", () => {
    renderList();

    const options = Array.from(filter(ASSIGNMENT).querySelectorAll("option"));
    expect(options.map((o) => o.getAttribute("label") ?? o.textContent)).toEqual([
      t("all"),
      "Stabschef",
      "Polizei",
    ]);
  });

  it("marks the printable table as filtered once a filter is set", () => {
    renderList();
    expect(
      screen.getByRole("heading", { name: `${t("journal")} — Hochwasser` }),
    ).toBeInTheDocument();

    fireEvent.change(filter(PRIORITY), { target: { value: PriorityStatus.High } });

    expect(
      screen.getByRole("heading", { name: `${t("journal")} — Hochwasser (${t("filtered")})` }),
    ).toBeInTheDocument();
  });

  it("prints on request", () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: t("print") }));

    expect(print).toHaveBeenCalledTimes(1);
  });

  it("has no print button without controls", () => {
    renderList({ showControls: false });

    expect(screen.queryByRole("button", { name: t("print") })).not.toBeInTheDocument();
  });

  it("scrolls to the top when asked to follow new messages", () => {
    const scroll = vi.fn();
    vi.stubGlobal("scroll", scroll);

    renderList({ autoScroll: true });

    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("does not scroll by default", () => {
    const scroll = vi.fn();
    vi.stubGlobal("scroll", scroll);

    renderList();

    expect(scroll).not.toHaveBeenCalled();
  });

  it("hands the message to edit to the editor", () => {
    const setEditorMessage = vi.fn();
    renderList({ setEditorMessage });

    // newest first, and a triaged message cannot be edited: the pending one is the only button
    fireEvent.click(screen.getByRole("button", { name: t("edit") }));

    expect(setEditorMessage).toHaveBeenCalledWith(messages[0]);
  });
});
