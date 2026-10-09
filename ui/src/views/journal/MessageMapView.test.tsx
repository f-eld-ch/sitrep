import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MessageMapView from "./MessageMapView";

const division = { id: "d1", name: "Karte", description: "Nachrichtenkarte", kind: "MESSAGE_MAP" };
type Acknowledgement = { divisionId: string; acknowledgedAt: Date; acknowledgedBy: string };
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
  acknowledgements: [] as Acknowledgement[],
  attachments: [],
});

const drawn = (m: ReturnType<typeof msg>) => ({
  ...m,
  acknowledgements: [
    { divisionId: "d1", acknowledgedAt: new Date(2026, 0, 1, 13), acknowledgedBy: "x" },
  ],
});

const openMessages = [msg("m1", 1, 0), msg("m2", 2, 5)];
const loaded = (messages: ReturnType<typeof msg>[]) => ({
  status: "ready" as const,
  data: { messages, incidentDivisions: [division] },
});

const mocks = vi.hoisted(() => ({
  messages: { current: undefined as unknown },
  mapMounts: { count: 0 },
  mapProps: { last: undefined as Record<string, unknown> | undefined },
  stackProps: { last: undefined as Record<string, unknown> | undefined },
}));
const acknowledge = vi.fn().mockResolvedValue(undefined);
const ackState = { loading: false, error: undefined };

vi.mock("api/message", () => ({
  useIncidentMessages: () => mocks.messages.current,
  useAcknowledgeMessage: () => [acknowledge, ackState],
}));
vi.mock("views/map", () => ({
  Map: (props: { onDrawingChange?: () => void }) => {
    useEffect(() => {
      mocks.mapMounts.count++;
    }, []);
    mocks.mapProps.last = props as Record<string, unknown>;

    return <button onClick={props.onDrawingChange}>draw</button>;
  },
}));
vi.mock("./Message", () => ({ default: () => null }));
vi.mock("./FilterableMessageStack", () => ({
  FilterChip: ({
    label,
    active,
    onToggle,
  }: {
    label: string;
    active: boolean;
    onToggle: () => void;
  }) => (
    <button aria-pressed={active} onClick={onToggle}>
      {label}
    </button>
  ),
  FilterableMessageStack: (props: {
    effectiveId?: string;
    onSelect: (id: string | undefined) => void;
    extraChips?: ReactNode;
  }) => {
    mocks.stackProps.last = props as Record<string, unknown>;

    return (
      <div>
        <span data-testid="current">{props.effectiveId}</span>
        <button onClick={() => props.onSelect("m1")}>pick m1</button>
        <button onClick={() => props.onSelect("m2")}>pick m2</button>
        <button onClick={() => props.onSelect(undefined)}>pick nothing</button>
        {props.extraChips}
      </div>
    );
  },
}));

beforeEach(() => {
  mocks.messages.current = loaded(openMessages);
  mocks.mapMounts.count = 0;
  mocks.mapProps.last = undefined;
  mocks.stackProps.last = undefined;
});

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

describe("MessageMapView map", () => {
  it("draws for the oldest undrawn message, on the message's time", () => {
    setup();

    expect(mocks.mapProps.last).toMatchObject({
      readOnly: false,
      drawingMessage: { id: "m1", locked: false },
    });
    expect(mocks.mapProps.last?.asOf).toEqual(openMessages[0].time);
  });

  it("locks the drawing of a message that is already drawn, until it is unlocked", () => {
    mocks.messages.current = loaded([drawn(msg("m1", 1, 0)), msg("m2", 2, 5)]);
    setup();
    expect(mocks.mapProps.last).toMatchObject({ drawingMessage: { id: "m2", locked: false } });

    fireEvent.click(screen.getByText("pick m1"));
    expect(mocks.mapProps.last).toMatchObject({ drawingMessage: { id: "m1", locked: true } });

    fireEvent.click(screen.getByRole("button", { name: /messageMap.edit|ändern/i }));
    expect(mocks.mapProps.last).toMatchObject({ drawingMessage: { id: "m1", locked: false } });

    fireEvent.click(screen.getByRole("button", { name: /messageMap.editDone|fertig/i }));
    expect(mocks.mapProps.last).toMatchObject({ drawingMessage: { id: "m1", locked: true } });
  });

  it("shows the finished map, read-only and on the Nachrichtenkarte, once everything is drawn", () => {
    mocks.messages.current = loaded([drawn(msg("m1", 1, 0)), drawn(msg("m2", 2, 5))]);
    setup();

    expect(screen.getByText(/messageMap.allDrawn|alle meldungen/i)).toBeInTheDocument();
    expect(mocks.mapProps.last).toMatchObject({
      readOnly: true,
      preferredLayerKind: "MESSAGE_MAP",
    });
    expect(mocks.mapProps.last?.drawingMessage).toBeUndefined();
    expect(mocks.mapProps.last?.asOf).toBeUndefined();
  });

  it("keeps the same map when a message is selected and deselected", () => {
    mocks.messages.current = loaded([drawn(msg("m1", 1, 0)), drawn(msg("m2", 2, 5))]);
    setup();
    expect(mocks.mapMounts.count).toBe(1);

    fireEvent.click(screen.getByText("pick m2"));
    expect(mocks.mapProps.last).toMatchObject({ readOnly: false, drawingMessage: { id: "m2" } });

    fireEvent.click(screen.getByText("pick nothing"));
    expect(mocks.mapProps.last).toMatchObject({ readOnly: true });

    expect(mocks.mapMounts.count).toBe(1);
  });

  it("shows no map and a hint when no message is triaged to the Nachrichtenkarte", () => {
    mocks.messages.current = loaded([]);
    setup();

    expect(mocks.mapProps.last).toBeUndefined();
    expect(screen.getByText(/messageMap.noMessages|keine meldungen/i)).toBeInTheDocument();
  });

  it("tells when the Nachrichtenkarte is not available", () => {
    mocks.messages.current = {
      status: "ready",
      data: { messages: [], incidentDivisions: [] },
    };
    setup();

    expect(screen.getByText(/messageMap.unavailable|nicht verfügbar/i)).toBeInTheDocument();
  });
});

describe("MessageMapView stack", () => {
  it("has no filters but the undrawn one", () => {
    setup();

    expect(mocks.stackProps.last?.enabledFilters).toEqual({
      untriaged: false,
      highPriority: false,
      mine: false,
    });
  });

  it("offers the action: 'show all' while filtered, 'show undrawn (n)' otherwise", () => {
    setup();

    // Filtered to what is still to draw: the chip offers to show everything.
    const toggle = screen.getByRole("button", { name: /messageMap.showAll|zeige alle/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(mocks.stackProps.last?.baseFilter).toMatchObject({
      acknowledgement: { divisionId: "d1", state: "pending" },
    });

    fireEvent.click(toggle);

    const pending = screen.getByRole("button", {
      name: /messageMap.showPending.*\(2\)|ungezeichnete.*\(2\)/i,
    });
    expect(pending).toHaveAttribute("aria-pressed", "true");
    expect(mocks.stackProps.last?.baseFilter).toMatchObject({ acknowledgement: undefined });
  });
});
