import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import { FilterableMessageStack } from "./FilterableMessageStack";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// The real stack observes scrolling; only the rows it was given matter here.
vi.mock("./MessageStack", () => ({
  MessageStack: ({ messages }: { messages: Message[] }) => (
    <ul>
      {messages.map((m) => (
        <li key={m.id}>{m.content}</li>
      ))}
    </ul>
  ),
}));

function message(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    number: 1,
    content: id,
    sender: "A",
    senderDetail: "",
    receiver: "B",
    receiverDetail: "",
    time: new Date("2026-01-15T10:00:00Z"),
    createdAt: new Date("2026-01-15T10:00:00Z"),
    updatedAt: new Date(),
    deletedAt: new Date(0),
    divisions: [],
    medium: Medium.Radio,
    triageId: TriageStatus.Triaged,
    priorityId: PriorityStatus.Normal,
    attachments: [],
    acknowledgements: [],
    author: "",
    ...overrides,
  };
}

const MESSAGES = [
  message("key", { priorityId: PriorityStatus.High }),
  message("plain"),
  message("pending", { triageId: TriageStatus.Pending }),
];

function Harness({ initialFocus }: { initialFocus?: string[] }) {
  const [focus, setFocus] = useState<string[] | undefined>(initialFocus);

  return (
    <>
      <button type="button" onClick={() => setFocus(["plain", "pending"])}>
        select feature
      </button>
      <FilterableMessageStack
        messages={MESSAGES}
        effectiveId={undefined}
        onSelect={() => {}}
        initialFilters={{ highPriority: true }}
        baseFilter={{ triage: "triaged_only" }}
        focusMessageIds={focus}
        onClearFocus={() => setFocus(undefined)}
      />
    </>
  );
}

describe("FilterableMessageStack focus", () => {
  it("applies its own filters without a focus", () => {
    render(<Harness />);

    // key messages only, triaged only
    expect(screen.getByText("key")).toBeTruthy();
    expect(screen.queryByText("plain")).toBeNull();
    expect(screen.queryByText("pending")).toBeNull();
  });

  it("shows exactly the focused messages, whatever the filters would hide", () => {
    render(<Harness initialFocus={["plain", "pending"]} />);

    expect(screen.getByText("plain")).toBeTruthy();
    expect(screen.getByText("pending")).toBeTruthy(); // not triaged, not a key message
    expect(screen.queryByText("key")).toBeNull();
    // the regular chips make way for the focus chip
    expect(screen.queryByText("messageStack.filterKeyMessage")).toBeNull();
    expect(screen.getByText(/featureMessages.filter \(2\)/)).toBeTruthy();
  });

  it("restores the previous filters once the focus is cleared", () => {
    render(<Harness />);

    fireEvent.click(screen.getByText("select feature"));
    expect(screen.getByText("plain")).toBeTruthy();

    fireEvent.click(screen.getByText(/featureMessages.filter/));

    // back to key messages only, with the key-message chip still on
    expect(screen.getByText("key")).toBeTruthy();
    expect(screen.queryByText("plain")).toBeNull();
    expect(screen.getByText("messageStack.filterKeyMessage")).toBeTruthy();
  });

  describe("FilterableMessageStack bare", () => {
    it("has no filter chips, not even the one that clears a focus", () => {
      render(
        <FilterableMessageStack
          messages={MESSAGES}
          effectiveId={undefined}
          onSelect={() => {}}
          focusMessageIds={["plain"]}
          onClearFocus={() => {}}
          bare
        />,
      );

      expect(screen.getByText("plain")).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
    });

    it("has the chips when not bare", () => {
      render(
        <FilterableMessageStack
          messages={MESSAGES}
          effectiveId={undefined}
          onSelect={() => {}}
          focusMessageIds={["plain"]}
          onClearFocus={() => {}}
        />,
      );

      expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    });
  });
});
