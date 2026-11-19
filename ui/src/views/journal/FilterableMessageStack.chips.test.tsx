import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { Medium, PriorityStatus, TriageStatus, type Message } from "types";
import { UserContext } from "utils";
import { FilterableMessageStack } from "./FilterableMessageStack";

// The real locale file, so a missing translation fails the test.
function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}
const t = lookup;

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: lookup }) }));
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
    author: "someone-else",
    ...overrides,
  };
}

const MESSAGES = [
  message("plain"),
  message("pending", { triageId: TriageStatus.Pending }),
  message("reset", { triageId: TriageStatus.Reset }),
  message("key", { priorityId: PriorityStatus.High }),
  message("mine", { author: "me-sub" }),
];

function renderStack(props: Partial<React.ComponentProps<typeof FilterableMessageStack>> = {}) {
  return render(
    <UserContext.Provider
      value={{
        state: { isLoggedin: true, username: "me", email: "me@example.org", sub: "me-sub" },
        dispatch: () => null,
      }}
    >
      <FilterableMessageStack
        messages={MESSAGES}
        effectiveId={undefined}
        onSelect={() => {}}
        {...props}
      />
    </UserContext.Provider>,
  );
}

const shown = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => li.textContent)
    .sort();
const chip = (key: string) => screen.getByRole("button", { name: t(`messageStack.${key}`) });

describe("FilterableMessageStack chips", () => {
  it("shows every message without a filter", () => {
    renderStack();

    expect(shown()).toEqual(["key", "mine", "pending", "plain", "reset"]);
  });

  it.each([
    ["filterUntriaged", ["pending", "reset"]],
    ["filterKeyMessage", ["key"]],
    ["filterMine", ["mine"]],
  ])("%s narrows the list, and a second click widens it again", (key, expected) => {
    renderStack();

    fireEvent.click(chip(key));
    expect(shown()).toEqual(expected);

    fireEvent.click(chip(key));
    expect(shown()).toHaveLength(MESSAGES.length);
  });

  it("combines the chips", () => {
    renderStack({
      messages: [
        message("a", { triageId: TriageStatus.Pending, priorityId: PriorityStatus.High }),
        message("b", { triageId: TriageStatus.Pending }),
        message("c", { priorityId: PriorityStatus.High }),
      ],
    });

    fireEvent.click(chip("filterUntriaged"));
    fireEvent.click(chip("filterKeyMessage"));

    expect(shown()).toEqual(["a"]);
  });

  it("offers only the enabled chips", () => {
    renderStack({ enabledFilters: { untriaged: false, mine: false } });

    expect(
      screen.queryByRole("button", { name: t("messageStack.filterUntriaged") }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t("messageStack.filterMine") }),
    ).not.toBeInTheDocument();
    expect(chip("filterKeyMessage")).toBeInTheDocument();
  });

  it("shows the chips of the caller beside the built-in ones, until a focus replaces them", () => {
    const { rerender } = renderStack({ extraChips: <button type="button">extra</button> });
    expect(screen.getByRole("button", { name: "extra" })).toBeInTheDocument();

    rerender(
      <UserContext.Provider
        value={{
          state: { isLoggedin: true, username: "me", email: "", sub: "me-sub" },
          dispatch: () => null,
        }}
      >
        <FilterableMessageStack
          messages={MESSAGES}
          effectiveId={undefined}
          onSelect={() => {}}
          extraChips={<button type="button">extra</button>}
          focusMessageIds={["plain"]}
        />
      </UserContext.Provider>,
    );
    expect(screen.queryByRole("button", { name: "extra" })).not.toBeInTheDocument();
  });
});
