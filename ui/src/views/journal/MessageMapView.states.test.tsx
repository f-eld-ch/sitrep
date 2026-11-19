import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { ApiError } from "api";
import { errorResult, loadingResult, readyResult } from "api/testing/results";
import MessageMapView from "./MessageMapView";

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

const mocks = vi.hoisted(() => ({
  messages: { current: undefined as unknown },
  ack: {
    state: { loading: false, error: undefined as unknown },
  },
}));
const acknowledge = vi.fn();

vi.mock("api/message", () => ({
  useIncidentMessages: () => mocks.messages.current,
  useAcknowledgeMessage: () => [acknowledge, mocks.ack.state],
}));
// No WebGL: the map is a button that reports a drawn feature.
vi.mock("views/map", () => ({
  Map: ({ onDrawingChange }: { onDrawingChange?: () => void }) => (
    <button onClick={onDrawingChange}>draw</button>
  ),
}));
vi.mock("./Message", () => ({ default: () => null }));
vi.mock("./FilterableMessageStack", () => ({
  FilterChip: () => null,
  FilterableMessageStack: () => null,
}));

const division = { id: "d1", name: "Karte", description: "Nachrichtenkarte", kind: "MESSAGE_MAP" };
const message = {
  id: "m1",
  number: 1,
  sender: "s",
  receiver: "r",
  senderDetail: "",
  receiverDetail: "",
  content: "content",
  medium: "RADIO",
  time: new Date(2026, 0, 1, 12, 0),
  createdAt: new Date(2026, 0, 1, 12, 0),
  updatedAt: new Date(2026, 0, 1, 12, 0),
  triageId: "DONE",
  priorityId: "NORMAL",
  author: "a",
  divisions: [{ division }],
  acknowledgements: [],
  attachments: [],
};

function setup() {
  const router = createMemoryRouter(
    [
      { path: "/incident/:incidentId/journal/map", element: <MessageMapView /> },
      { path: "/incident/:incidentId/journal/triage", element: <p>triage page</p> },
      { path: "/other", element: <p>other page</p> },
    ],
    { initialEntries: ["/incident/i1/journal/map"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("MessageMapView states", () => {
  beforeEach(() => {
    acknowledge.mockReset().mockResolvedValue(undefined);
    mocks.ack.state = { loading: false, error: undefined };
    mocks.messages.current = readyResult({ messages: [message], incidentDivisions: [division] });
  });

  it("shows no map while loading", () => {
    mocks.messages.current = loadingResult();
    setup();

    expect(screen.queryByRole("button", { name: "draw" })).not.toBeInTheDocument();
  });

  it("explains an error with the message of its code", () => {
    mocks.messages.current = errorResult(new ApiError("FORBIDDEN"));
    setup();

    expect(screen.getByText(t("errors.FORBIDDEN"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "draw" })).not.toBeInTheDocument();
  });

  it("leads to the triage when no message was assigned to the Nachrichtenkarte yet", () => {
    mocks.messages.current = readyResult({ messages: [], incidentDivisions: [division] });
    const router = setup();

    fireEvent.click(screen.getByRole("button", { name: t("triageView") }));

    expect(router.state.location.pathname).toBe("/incident/i1/journal/triage");
  });

  it("acknowledges the selected message for the Nachrichtenkarte when finishing it", async () => {
    setup();

    fireEvent.click(screen.getByRole("button", { name: t("messageMap.finish") }));

    await waitFor(() =>
      expect(acknowledge).toHaveBeenCalledWith({ messageId: "m1", divisionId: "d1" }),
    );
  });

  it("shows why finishing failed and keeps the warning for the drawn features", async () => {
    acknowledge.mockRejectedValue(new ApiError("NOT_TRIAGED_TO_DIVISION"));
    mocks.ack.state = { loading: false, error: new ApiError("NOT_TRIAGED_TO_DIVISION") };
    const router = setup();
    fireEvent.click(screen.getByRole("button", { name: "draw" }));

    fireEvent.click(screen.getByRole("button", { name: t("messageMap.finish") }));

    await waitFor(() => expect(acknowledge).toHaveBeenCalled());
    expect(screen.getByText(t("errors.NOT_TRIAGED_TO_DIVISION"))).toBeInTheDocument();
    await act(() => router.navigate("/other"));
    expect(router.state.location.pathname).toBe("/incident/i1/journal/map");
  });

  it("cannot be finished while the previous finish is still being saved", () => {
    mocks.ack.state = { loading: true, error: undefined };
    setup();

    expect(screen.getByRole("button", { name: t("messageMap.finish") })).toBeDisabled();
  });

  it("stays on the page when leaving with unfinished drawings is cancelled", async () => {
    const router = setup();
    fireEvent.click(screen.getByRole("button", { name: "draw" }));
    await act(() => router.navigate("/other"));
    expect(screen.getByText(t("messageMap.unfinished"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t("cancel") }));

    await waitFor(() =>
      expect(screen.queryByText(t("messageMap.unfinished"))).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/incident/i1/journal/map");
  });

  it("warns the browser before the tab is closed while drawings are unfinished", () => {
    setup();
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "draw" }));

    expect(unload()).toBe(true);
  });
});
