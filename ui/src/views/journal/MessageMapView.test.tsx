import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import MessageMapView from "./MessageMapView";

const division = { id: "d1", name: "Karte", description: "Nachrichtenkarte", kind: "MESSAGE_MAP" };
const msg = (id: string, number: number, minute: number) => ({
  id,
  number,
  sender: "s",
  receiver: "r",
  senderDetail: "",
  receiverDetail: "",
  content: `content ${number}`,
  medium: "RADIO",
  time: new Date(2026, 0, 1, 12, minute),
  createdAt: new Date(2026, 0, 1, 12, minute),
  updatedAt: new Date(2026, 0, 1, 12, minute),
  triage: "TRIAGED",
  priority: "NORMAL",
  author: "a",
  divisions: [{ division }],
  acknowledgements: [],
  attachments: [],
});

const data = {
  status: "ready" as const,
  data: { messages: [msg("m1", 1, 0), msg("m2", 2, 5)], incidentDivisions: [division] },
};
const acknowledge = vi.fn().mockResolvedValue(undefined);
const ackState = { loading: false, error: undefined };

vi.mock("api/message", () => ({
  useIncidentMessages: () => data,
  useAcknowledgeMessage: () => [acknowledge, ackState],
}));
vi.mock("views/map", () => ({
  Map: ({ onDrawingChange }: { onDrawingChange?: () => void }) => (
    <button onClick={onDrawingChange}>draw</button>
  ),
}));
vi.mock("./Message", () => ({ default: () => null }));
vi.mock("./FilterableMessageStack", () => ({
  FilterChip: () => null,
  FilterableMessageStack: ({
    effectiveId,
    onSelect,
  }: {
    effectiveId?: string;
    onSelect: (id: string) => void;
  }) => (
    <div>
      <span data-testid="current">{effectiveId}</span>
      <button onClick={() => onSelect("m2")}>pick m2</button>
    </div>
  ),
}));

function setup() {
  const router = createMemoryRouter(
    [
      { path: "/i/:incidentId", element: <MessageMapView /> },
      { path: "/other", element: <p>other page</p> },
    ],
    { initialEntries: ["/i/x"] },
  );
  render(<RouterProvider router={router} />);

  return router;
}

describe("MessageMapView navigation guard", () => {
  it("switches freely while nothing was drawn", async () => {
    setup();
    fireEvent.click(screen.getByText("pick m2"));

    expect(screen.getByTestId("current")).toHaveTextContent("m2");
    expect(screen.queryByText(/noch nicht abgeschlossen|unfinished/i)).toBeNull();
  });

  it("asks before leaving a message with drawn features, and can stay", async () => {
    setup();
    fireEvent.click(screen.getByText("draw"));
    fireEvent.click(screen.getByText("pick m2"));

    expect(screen.getByTestId("current")).toHaveTextContent("m1");
    expect(screen.getByRole("button", { name: /cancel|abbrechen/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel|abbrechen/i }));
    expect(screen.getByTestId("current")).toHaveTextContent("m1");
  });

  it("leaves after confirming", async () => {
    setup();
    fireEvent.click(screen.getByText("draw"));
    fireEvent.click(screen.getByText("pick m2"));
    fireEvent.click(screen.getByRole("button", { name: /leave|verlassen/i }));

    expect(screen.getByTestId("current")).toHaveTextContent("m2");
  });

  it("blocks router navigation until confirmed", async () => {
    const router = setup();
    fireEvent.click(screen.getByText("draw"));
    await act(() => router.navigate("/other"));

    expect(router.state.location.pathname).toBe("/i/x");
    fireEvent.click(screen.getByRole("button", { name: /leave|verlassen/i }));
    expect(router.state.location.pathname).toBe("/other");
  });

  it("clears the warning once the message is finished", async () => {
    setup();
    fireEvent.click(screen.getByText("draw"));
    fireEvent.click(screen.getByText("pick m2"));
    expect(screen.getByRole("button", { name: /leave|verlassen/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /messageMap.finish|abschliessen/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /leave|verlassen/i })).toBeNull(),
    );
  });
});
