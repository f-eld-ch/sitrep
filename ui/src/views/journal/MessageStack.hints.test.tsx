import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import { MessageStack } from "./MessageStack";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

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

type Entry = { target: Element; isIntersecting: boolean };

// jsdom has no layout: an observer the test drives by hand stands in for the scroll position.
let observed: Element[];
let intersect: (target: Element, isIntersecting: boolean) => void;

beforeEach(() => {
  observed = [];
  let callback: (entries: Entry[]) => void = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: Entry[]) => void) {
        callback = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  intersect = (target, isIntersecting) => act(() => callback([{ target, isIntersecting }]));
});

const two = [message("a"), message("b")];

describe("MessageStack scroll hints", () => {
  it("offers to scroll up once the top is out of view, and scrolls there", () => {
    render(<MessageStack messages={two} effectiveId={undefined} onSelect={vi.fn()} />);
    const [top] = observed;
    const scrollTop = vi.fn();
    top.scrollIntoView = scrollTop;
    const buttons = () => screen.getAllByRole("button").length;
    const before = buttons();

    intersect(top, false);
    expect(buttons()).toBe(before + 1);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(scrollTop).toHaveBeenCalledWith({ behavior: "smooth" });

    intersect(top, true);
    expect(buttons()).toBe(before);
  });

  it("shows the scroll-down button only while the bottom is out of view, and scrolls there", () => {
    const { container } = render(
      <MessageStack messages={two} effectiveId={undefined} onSelect={vi.fn()} />,
    );
    const [, bottom] = observed;
    const scrollBottom = vi.fn();
    bottom.scrollIntoView = scrollBottom;
    const downWrapper = () => container.firstElementChild!.lastElementChild as HTMLElement;
    expect(downWrapper()).toHaveClass("invisible");

    intersect(bottom, false);
    expect(downWrapper()).toHaveClass("visible");
    fireEvent.click(within(downWrapper()).getByRole("button"));
    expect(scrollBottom).toHaveBeenCalledWith({ behavior: "smooth" });

    intersect(bottom, true);
    expect(downWrapper()).toHaveClass("invisible");
  });

  it("scrolls the selected message into the centre", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;

    render(<MessageStack messages={two} effectiveId="a" onSelect={vi.fn()} />);

    expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });
});

describe("MessageStack rows", () => {
  it.each([
    [{ triageId: TriageStatus.Pending }, "border-r-warning"],
    [{ triageId: TriageStatus.Reset }, "border-r-warning"],
    [{ triageId: TriageStatus.Triaged, priorityId: PriorityStatus.High }, "border-r-danger"],
    [{ triageId: TriageStatus.MoreInfo }, "border-r-success"],
    [{ triageId: TriageStatus.Triaged }, "border-r-fg"],
  ])("accents a message with %j in its colour", (overrides, accent) => {
    render(
      <MessageStack
        messages={[message("a", overrides)]}
        effectiveId={undefined}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /A → B/ })).toHaveClass(accent);
  });

  it("shows the first three divisions and counts the rest, until expanded", () => {
    const divisions = ["SC", "Pol", "Feu", "San", "Tech"].map((name) => ({
      division: { id: name, name, description: name, kind: "STANDARD" as const },
    }));
    const { rerender } = render(
      <MessageStack messages={[message("a", { divisions })]} effectiveId="a" onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Feu")).toBeInTheDocument();
    expect(screen.queryByText("San")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();

    rerender(
      <MessageStack
        messages={[message("a", { divisions })]}
        effectiveId="a"
        onSelect={vi.fn()}
        expandSelected
      />,
    );
    expect(screen.getByText("Tech")).toBeInTheDocument();
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
  });

  it("shows placeholders for a message without sender or content", () => {
    render(
      <MessageStack
        messages={[message("a", { sender: "", receiver: "", content: "" })]}
        effectiveId={undefined}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });
});
