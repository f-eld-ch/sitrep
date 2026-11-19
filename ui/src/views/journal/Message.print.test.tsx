import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import {
  Medium,
  PriorityStatus,
  TriageStatus,
  type Attachment,
  type Division,
  type Message,
} from "types";
import MessageContainer, { PrintSheetAction } from "./Message";

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

const printing = vi.hoisted(() => ({
  print: vi.fn(),
  options: undefined as { onAfterPrint?: () => void } | undefined,
}));
vi.mock("react-to-print", () => ({
  useReactToPrint: (options: { onAfterPrint?: () => void }) => {
    printing.options = options;
    return printing.print;
  },
}));

const sc: Division = { id: "d-sc", name: "SC", description: "Stabschef", kind: "STANDARD" };

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    number: 5,
    content: "Brücke gesperrt",
    sender: "Alice",
    senderDetail: "",
    receiver: "Bob",
    receiverDetail: "",
    time: new Date("2026-01-15T10:00:00Z"),
    createdAt: new Date("2026-01-15T10:00:00Z"),
    updatedAt: new Date("2026-01-15T10:00:00Z"),
    deletedAt: new Date(0),
    divisions: [{ division: sc }],
    medium: Medium.Radio,
    triageId: TriageStatus.Triaged,
    priorityId: PriorityStatus.Normal,
    attachments: [],
    acknowledgements: [],
    author: "",
    ...overrides,
  };
}

describe("PrintSheetAction", () => {
  beforeEach(() => {
    printing.print.mockReset();
  });

  it.each([
    ["a link-like button", false],
    ["a regular button", true],
  ])("prints the message sheet when asked, as %s", (_name, asButton) => {
    render(<PrintSheetAction message={message()} divisions={[sc]} asButton={asButton} />);
    expect(screen.queryByRole("heading", { name: t("messageSheet") })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("messageSheet") }));

    expect(printing.print).toHaveBeenCalledTimes(1);
    // the sheet is rendered (hidden) for printing
    expect(screen.getByRole("heading", { name: t("messageSheet") })).toBeInTheDocument();
  });

  it("removes the sheet again after printing", () => {
    render(<PrintSheetAction message={message()} divisions={[sc]} />);
    fireEvent.click(screen.getByRole("button", { name: t("messageSheet") }));

    act(() => printing.options?.onAfterPrint?.());

    expect(screen.queryByRole("heading", { name: t("messageSheet") })).not.toBeInTheDocument();
  });

  it("is offered on a triaged message instead of editing it", () => {
    render(
      <MessageContainer
        id="m1"
        incidentId="i1"
        message={message()}
        divisions={[sc]}
        showControls
        setEditorMessage={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: t("messageSheet") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t("edit") })).not.toBeInTheDocument();
  });
});

describe("image attachments", () => {
  const image: Attachment = {
    id: "a1",
    filename: "foto.png",
    contentType: "image/png",
    size: 1,
    createdAt: new Date(),
    uploadedBy: "u",
    url: "/api/attachments/a1",
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderWithImage() {
    render(
      <MessageContainer
        id="m1"
        incidentId="i1"
        message={message({ attachments: [image] })}
        divisions={[]}
        showControls={false}
      />,
    );
    return screen.getByRole("img", { name: "foto.png" });
  }

  it("retries a thumbnail that fails to load, a little later each time", () => {
    const img = renderWithImage();

    fireEvent.error(img);
    act(() => vi.advanceTimersByTime(299));
    expect(img).toHaveAttribute("src", "/api/attachments/a1");
    act(() => vi.advanceTimersByTime(1));
    expect(img).toHaveAttribute("src", "/api/attachments/a1?r=1");

    fireEvent.error(img);
    act(() => vi.advanceTimersByTime(800));
    expect(img).toHaveAttribute("src", "/api/attachments/a1?r=2");

    fireEvent.error(img);
    act(() => vi.advanceTimersByTime(2000));
    expect(img).toHaveAttribute("src", "/api/attachments/a1?r=3");
  });

  it("falls back to a download link once the retries are used up", () => {
    const img = renderWithImage();
    for (const delay of [300, 800, 2000]) {
      fireEvent.error(img);
      act(() => vi.advanceTimersByTime(delay));
    }

    fireEvent.error(img);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "foto.png" });
    expect(link).toHaveAttribute("href", "/api/attachments/a1");
    expect(link).toHaveAttribute("download", "foto.png");
  });
});
