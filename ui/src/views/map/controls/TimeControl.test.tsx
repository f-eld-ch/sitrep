import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentContext } from "utils";
import { MapTimeContext, type MapTime } from "../MapTimeContext";
import { TimeControl } from "./TimeControl";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { time?: string }) =>
      options?.time ? `${key}:${options.time}` : key,
  }),
}));
vi.mock("react-router", () => ({ useParams: () => ({ incidentId: "inc-1" }) }));

const MAP_DIVISION = {
  id: "div-map",
  name: "Karte",
  description: "",
  kind: "MESSAGE_MAP" as const,
};
const message = (id: string, iso: string) => ({
  id,
  time: new Date(iso),
  divisions: [{ division: MAP_DIVISION }],
});

vi.mock("api/message", () => ({
  useIncidentMessages: () => ({
    status: "ready",
    data: {
      incidentDivisions: [MAP_DIVISION],
      messages: [
        message("m1", "2026-01-15T10:00:00Z"),
        message("m2", "2026-01-15T12:00:00Z"),
        // not on the Nachrichtenkarte: no tick
        { id: "m3", time: new Date("2026-01-15T11:00:00Z"), divisions: [] },
      ],
    },
  }),
}));

const NOW = new Date("2026-01-15T14:00:00Z").getTime();

function renderControl(mapTime: MapTime, children: ReactNode = <TimeControl />) {
  const incident = { createdAt: new Date("2026-01-15T09:00:00Z") };

  return render(
    <IncidentContext.Provider
      value={{ state: { incident, loadedForId: "inc-1" } as never, dispatch: () => null }}
    >
      <MapTimeContext.Provider value={mapTime}>{children}</MapTimeContext.Provider>
    </IncidentContext.Provider>,
  );
}

describe("TimeControl", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  it("renders nothing on a map without a timeline", () => {
    const { container } = renderControl({});
    expect(container.firstChild).toBeNull();
  });

  it("is live by default, with nothing after live to step to", () => {
    renderControl({ setAsOf: vi.fn() });

    expect(
      (screen.getByRole("button", { name: "mapTimeline.live" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "mapTimeline.next" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByText(/mapTimeline.asOf/)).toBeNull();
  });

  it("steps back to the latest Nachrichtenkarte message", () => {
    const setAsOf = vi.fn();
    renderControl({ setAsOf });

    fireEvent.click(screen.getByRole("button", { name: "mapTimeline.previous" }));
    expect(setAsOf).toHaveBeenCalledWith(new Date("2026-01-15T12:00:00Z"));
  });

  it("walks backwards through the messages and then forwards to live", () => {
    const setAsOf = vi.fn();
    renderControl({ setAsOf, asOf: new Date("2026-01-15T12:00:00Z") });

    fireEvent.click(screen.getByRole("button", { name: "mapTimeline.previous" }));
    expect(setAsOf).toHaveBeenLastCalledWith(new Date("2026-01-15T10:00:00Z"));

    fireEvent.click(screen.getByRole("button", { name: "mapTimeline.next" }));
    expect(setAsOf).toHaveBeenLastCalledWith(undefined); // past the last message: back to live
  });

  it("shows the point in time it is at and offers a way back to live", () => {
    const setAsOf = vi.fn();
    renderControl({ setAsOf, asOf: new Date("2026-01-15T10:00:00Z") });

    expect(screen.getByText(/mapTimeline.asOf:15\.01\.26/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "mapTimeline.live" }));
    expect(setAsOf).toHaveBeenCalledWith(undefined);
  });
});
