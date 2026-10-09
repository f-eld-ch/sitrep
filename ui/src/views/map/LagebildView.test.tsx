import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LagebildView from "./LagebildView";

const mocks = vi.hoisted(() => ({
  featureMessageIds: { current: undefined as string[] | undefined },
  mapProps: { last: undefined as Record<string, unknown> | undefined },
  stackProps: { last: undefined as Record<string, unknown> | undefined },
}));

const at = (hour: number) => new Date(Date.UTC(2026, 0, 15, hour));
const messages = [
  { id: "early", time: at(10), divisions: [] },
  { id: "middle", time: at(12), divisions: [] },
  { id: "late", time: at(14), divisions: [] },
];

vi.mock("react-router", () => ({ useParams: () => ({ incidentId: "inc-1" }) }));
vi.mock("api/message", () => ({
  useIncidentMessages: () => ({ status: "ready", data: { messages } }),
}));
vi.mock("./useFeatureMessageIds", () => ({
  useFeatureMessageIds: () => mocks.featureMessageIds.current,
}));
vi.mock("views/journal/FilterableMessageStack", () => ({
  FilterableMessageStack: ({
    messages: shown,
    effectiveId,
    expandSelected,
    onSelect,
  }: {
    messages: { id: string }[];
    effectiveId?: string;
    expandSelected?: boolean;
    onSelect: (id: string) => void;
  }) => {
    mocks.stackProps.last = { effectiveId, expandSelected };

    return (
      <ul>
        {shown.map((m) => (
          <li key={m.id}>
            <button onClick={() => onSelect(m.id)}>{m.id}</button>
          </li>
        ))}
      </ul>
    );
  },
}));
vi.mock("./index", () => ({
  Map: (props: Record<string, unknown>) => {
    mocks.mapProps.last = props;

    return <div data-testid="map" />;
  },
}));

beforeEach(() => {
  mocks.featureMessageIds.current = ["early", "middle", "late"];
  mocks.mapProps.last = undefined;
  mocks.stackProps.last = undefined;
});

const moveSlider = (to: Date | undefined) => {
  const onTimeChange = mocks.mapProps.last?.onTimeChange as (d: Date | undefined) => void;

  act(() => onTimeChange(to));
};

describe("LagebildView", () => {
  it("shows no side stack until a feature with messages is selected", () => {
    mocks.featureMessageIds.current = undefined;
    render(<LagebildView />);

    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByTestId("map")).toBeInTheDocument();
  });

  it("shows all of the feature's messages while live", () => {
    render(<LagebildView />);

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "early",
      "middle",
      "late",
    ]);
  });

  it("only shows the messages that existed at the slider's point in time", () => {
    render(<LagebildView />);

    moveSlider(at(12));
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "early",
      "middle",
    ]);

    moveSlider(at(9));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);

    moveSlider(undefined);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows the picked message in full in the stack", () => {
    render(<LagebildView />);
    expect(mocks.stackProps.last).toMatchObject({ effectiveId: undefined, expandSelected: true });

    fireEvent.click(screen.getByRole("button", { name: "middle" }));
    expect(mocks.stackProps.last).toMatchObject({ effectiveId: "middle" });

    fireEvent.click(screen.getByRole("button", { name: "late" }));
    expect(mocks.stackProps.last).toMatchObject({ effectiveId: "late" });
  });

  it("selects the only message of a feature at once", () => {
    mocks.featureMessageIds.current = ["middle"];
    render(<LagebildView />);

    expect(mocks.stackProps.last).toMatchObject({ effectiveId: "middle", expandSelected: true });
  });

  it("forgets the pick when the slider moves before it", () => {
    render(<LagebildView />);
    fireEvent.click(screen.getByRole("button", { name: "late" }));
    expect(mocks.stackProps.last).toMatchObject({ effectiveId: "late" });

    moveSlider(at(11)); // only the early message existed: it is the only one there is
    expect(mocks.stackProps.last).toMatchObject({ effectiveId: "early" });

    moveSlider(at(9)); // nothing existed yet
    expect(mocks.stackProps.last).toMatchObject({ effectiveId: undefined });
  });
});
