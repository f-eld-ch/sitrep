import { render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { Medium, PriorityStatus, TriageStatus, type Division, type Message } from "types";
import MessageSheet from "./MessageSheet";

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

const sc: Division = { id: "d-sc", name: "SC", description: "Stabschef", kind: "STANDARD" };
const police: Division = { id: "d-pol", name: "Pol", description: "Polizei", kind: "STANDARD" };
const messageMap: Division = { id: "d-map", name: "Karte", description: "x", kind: "MESSAGE_MAP" };

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    number: 42,
    content: "**Brücke** gesperrt",
    sender: "Alice",
    senderDetail: "K7",
    receiver: "Bob",
    receiverDetail: "K7",
    time: new Date("2026-01-15T10:00:00Z"),
    createdAt: new Date("2026-01-15T10:00:00Z"),
    updatedAt: new Date("2026-01-15T10:00:00Z"),
    deletedAt: new Date(0),
    divisions: [],
    medium: Medium.Radio,
    triageId: TriageStatus.Triaged,
    priorityId: PriorityStatus.High,
    attachments: [],
    acknowledgements: [],
    author: "",
    ...overrides,
  };
}

/** The value cell that follows a row header in the sheet. */
function valueOf(header: string): HTMLElement {
  const th = screen.getAllByRole("columnheader", { name: header })[0];
  return th.nextElementSibling as HTMLElement;
}

describe("MessageSheet", () => {
  it("renders nothing without a message", () => {
    const { container } = render(<MessageSheet message={undefined} divisions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("forwards its ref to the printable sheet", () => {
    const ref = createRef<HTMLDivElement>();
    render(<MessageSheet ref={ref} message={message()} divisions={[]} />);

    expect(ref.current).toContainElement(screen.getByRole("heading", { name: t("messageSheet") }));
  });

  it("shows the number, parties, triage, priority and content", () => {
    render(<MessageSheet message={message()} divisions={[]} />);

    expect(screen.getByRole("heading", { name: t("messageSheet") })).toBeInTheDocument();
    expect(valueOf(t("message.id"))).toHaveTextContent("42");
    expect(valueOf(t("message.sender"))).toHaveTextContent("Alice");
    expect(valueOf(t("message.receiver"))).toHaveTextContent("Bob");
    expect(valueOf(t("message.triage"))).toHaveTextContent(t("triage.DONE"));
    expect(valueOf(t("message.priority"))).toHaveTextContent(t("priority.HIGH"));
    expect(screen.getByText("Brücke").tagName).toBe("STRONG");
  });

  it("shows the channel of a radio message instead of party details", () => {
    render(<MessageSheet message={message()} divisions={[]} />);

    expect(valueOf(t("message.type"))).toHaveTextContent(t("medium.RADIO"));
    expect(valueOf(t("radioChannel"))).toHaveTextContent("K7");
    expect(valueOf(t("message.sender"))).not.toHaveTextContent("K7");
  });

  it.each([
    [Medium.Phone, "phone"],
    [Medium.Email, "email"],
    [Medium.Other, "other"],
  ])("shows the party details of a %s message and no channel", (medium) => {
    render(
      <MessageSheet
        message={message({ medium, senderDetail: "044 111", receiverDetail: "044 222" })}
        divisions={[]}
      />,
    );

    expect(valueOf(t("message.sender"))).toHaveTextContent("Alice (044 111)");
    expect(valueOf(t("message.receiver"))).toHaveTextContent("Bob (044 222)");
    expect(valueOf(t("message.type"))).toHaveTextContent(t(`medium.${medium}`));
    expect(screen.queryByRole("columnheader", { name: t("radioChannel") })).not.toBeInTheDocument();
  });

  it("leaves out empty party details", () => {
    render(
      <MessageSheet
        message={message({ medium: Medium.Phone, senderDetail: "", receiverDetail: "" })}
        divisions={[]}
      />,
    );

    expect(valueOf(t("message.sender"))).toHaveTextContent(/^Alice$/);
    expect(valueOf(t("message.receiver"))).toHaveTextContent(/^Bob$/);
  });

  it("lists the attachments by number and name", () => {
    render(
      <MessageSheet
        message={message({
          attachments: [
            {
              id: "a1",
              filename: "plan.pdf",
              contentType: "application/pdf",
              size: 1,
              createdAt: new Date(),
              uploadedBy: "u",
              url: "/a1",
            },
            {
              id: "a2",
              filename: "foto.png",
              contentType: "image/png",
              size: 1,
              createdAt: new Date(),
              uploadedBy: "u",
              url: "/a2",
            },
          ],
        })}
        divisions={[]}
      />,
    );

    const cell = screen.getByRole("columnheader", { name: t("message.attachments.title") })
      .nextElementSibling as HTMLElement;
    expect(cell).toHaveTextContent("1. plan.pdf");
    expect(cell).toHaveTextContent("2. foto.png");
  });

  it("has no attachment row without attachments", () => {
    render(<MessageSheet message={message()} divisions={[]} />);

    expect(
      screen.queryByRole("columnheader", { name: t("message.attachments.title") }),
    ).not.toBeInTheDocument();
  });

  it("shows the message flow: a division checked when the message was assigned to it", () => {
    render(
      <MessageSheet
        message={message({ divisions: [{ division: police }] })}
        divisions={[sc, police, messageMap]}
      />,
    );

    const flow = screen.getByRole("columnheader", { name: t("messageFlow") }).closest("table")!;
    const [labels, boxes] = within(flow).getAllByRole("row");
    expect(
      within(labels)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["SC", "Pol", t("divisionsNames.Karte.name")]);
    const checked = within(boxes)
      .getAllByRole("cell")
      .map((c) => c.querySelector("svg")?.getAttribute("data-icon"));
    expect(checked).toEqual(["square", "square-check", "square"]);
  });
});
