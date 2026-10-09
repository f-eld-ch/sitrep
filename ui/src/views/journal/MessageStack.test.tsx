import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import { MessageStack } from "./MessageStack";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// jsdom has no layout: the stack's scroll hints observe sentinels that never intersect.
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

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

const spinners = (container: HTMLElement) => container.querySelectorAll(".fa-spinner");

describe("MessageStack", () => {
  it("shows a single spinner next to 'no new messages' when the stack is empty", () => {
    const { container } = render(
      <MessageStack messages={[]} effectiveId={undefined} onSelect={vi.fn()} />,
    );

    expect(screen.getByText("noNewMessagesAbove")).toBeInTheDocument();
    expect(spinners(container)).toHaveLength(1);
  });

  it("waits for new messages above the list when there are some", () => {
    const { container } = render(
      <MessageStack messages={[message("a")]} effectiveId={undefined} onSelect={vi.fn()} />,
    );

    expect(screen.queryByText("noNewMessagesAbove")).toBeNull();
    expect(spinners(container)).toHaveLength(1);
    expect(screen.getByText("noOlderMessages")).toBeInTheDocument();
  });

  it("selects a message on click and deselects it on a second click", () => {
    const onSelect = vi.fn();
    const messages = [message("a", { content: "first" }), message("b", { content: "second" })];
    const { rerender } = render(
      <MessageStack messages={messages} effectiveId={undefined} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByText("second"));
    expect(onSelect).toHaveBeenLastCalledWith("b");

    rerender(<MessageStack messages={messages} effectiveId="b" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("second"));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });

  it("marks the messages a division has acknowledged", () => {
    const acknowledged = message("a", {
      content: "drawn",
      acknowledgements: [
        { divisionId: "map", acknowledgedAt: new Date(), acknowledgedBy: "someone" },
      ],
    });
    const { container } = render(
      <MessageStack
        messages={[acknowledged, message("b", { content: "open" })]}
        effectiveId={undefined}
        onSelect={vi.fn()}
        acknowledgementDivisionId="map"
      />,
    );

    expect(container.querySelectorAll(".fa-check")).toHaveLength(1);
  });

  it("cuts a long message short, unless it is the selected one and the stack is told to expand it", () => {
    const long = message("a", { content: "word ".repeat(60) });
    const clamped = (container: HTMLElement) => container.querySelectorAll(".line-clamp-4").length;

    const { container, rerender } = render(
      <MessageStack messages={[long]} effectiveId="a" onSelect={vi.fn()} />,
    );
    expect(clamped(container)).toBe(1);

    rerender(<MessageStack messages={[long]} effectiveId="a" onSelect={vi.fn()} expandSelected />);
    expect(clamped(container)).toBe(0);

    rerender(
      <MessageStack messages={[long]} effectiveId={undefined} onSelect={vi.fn()} expandSelected />,
    );
    expect(clamped(container)).toBe(1);
  });
});
