import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import MessageTable from "./Table";

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

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    number: 1,
    content: `Inhalt ${id}`,
    sender: "Alice",
    senderDetail: "",
    receiver: "Bob",
    receiverDetail: "",
    time: new Date(2026, 0, 15, 10, 30, 5),
    createdAt: new Date(2026, 0, 15, 10, 30, 5),
    updatedAt: new Date(2026, 0, 15, 10, 30, 5),
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

const none = { assignmentFilter: "all", priorityFilter: "all", triageFilter: "all" };

describe("MessageTable", () => {
  it("prints one row per message with time, sender, receiver and content", () => {
    render(<MessageTable messages={[message("m1")]} {...none} />);

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      t("message.time"),
      t("message.sender"),
      t("message.receiver"),
      t("message.content"),
    ]);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[0]).toHaveTextContent("15.01.2026 10:30:05");
    expect(cells[1]).toHaveTextContent("Alice");
    expect(cells[2]).toHaveTextContent("Bob");
    expect(cells[3]).toHaveTextContent("Inhalt m1");
  });

  it("shows the sender and receiver details in brackets", () => {
    render(
      <MessageTable
        messages={[message("m1", { senderDetail: "044 123", receiverDetail: "bob@example.org" })]}
        {...none}
      />,
    );

    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("Alice(044 123)");
    expect(cells[2]).toHaveTextContent("Bob(bob@example.org)");
  });

  it("renders the content as markdown", () => {
    render(<MessageTable messages={[message("m1", { content: "**wichtig**" })]} {...none} />);

    expect(screen.getByText("wichtig").tagName).toBe("STRONG");
  });

  it("has only the header row without messages", () => {
    render(<MessageTable messages={undefined} {...none} />);

    expect(screen.getAllByRole("row")).toHaveLength(1);
  });

  it("titles the table with the incident name and the time of printing", () => {
    render(<MessageTable messages={[]} incidentName="Hochwasser" {...none} />);

    expect(
      screen.getByRole("heading", { name: `${t("journal")} — Hochwasser` }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${t("state")}: \\d{2}\\.\\d{2}\\.\\d{4} \\d{2}:\\d{2}`)),
    ).toBeInTheDocument();
  });

  it("states no filter when none is active", () => {
    render(<MessageTable messages={[]} {...none} />);

    expect(screen.queryByText(`${t("filter")}:`)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(t("filtered")))).not.toBeInTheDocument();
  });

  it.each([
    [{ assignmentFilter: "SC" }, [`${t("divisions")}: SC`]],
    [{ priorityFilter: PriorityStatus.High }, [`${t("message.priority")}: ${t("priority.HIGH")}`]],
    [{ triageFilter: TriageStatus.Triaged }, [`${t("message.triage")}: ${t("triage.DONE")}`]],
    [
      { assignmentFilter: "SC", priorityFilter: PriorityStatus.High, triageFilter: "DONE" },
      [
        `${t("divisions")}: SC`,
        `${t("message.priority")}: ${t("priority.HIGH")}`,
        `${t("message.triage")}: ${t("triage.DONE")}`,
      ],
    ],
  ])("lists the active filters %j", (filters, lines) => {
    render(<MessageTable messages={[]} incidentName="Hochwasser" {...none} {...filters} />);

    expect(screen.getByText(`${t("filter")}:`)).toBeInTheDocument();
    for (const line of lines) expect(screen.getByText(line)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: `${t("journal")} — Hochwasser (${t("filtered")})` }),
    ).toBeInTheDocument();
  });

  it("forwards its ref to the printable element", () => {
    const ref = createRef<HTMLDivElement>();
    render(<MessageTable ref={ref} messages={[]} {...none} />);

    expect(ref.current).toContainElement(screen.getByRole("table"));
  });
});
