import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LagebildView from "./LagebildView";

const mocks = vi.hoisted(() => ({
  featureMessageIds: { current: undefined as string[] | undefined },
  mapProps: { last: undefined as Record<string, unknown> | undefined },
  stackProps: { last: undefined as Record<string, unknown> | undefined },
  messageQuery: { lastIncidentId: undefined as string | undefined },
}));

const at = (hour: number) => new Date(Date.UTC(2026, 0, 15, hour));
const messages = [
  { id: "early", time: at(10), divisions: [] },
  { id: "middle", time: at(12), divisions: [] },
  { id: "late", time: at(14), divisions: [] },
];

vi.mock("react-router", () => ({ useParams: () => ({ incidentId: "inc-1" }) }));
vi.mock("api/message", () => ({
  useIncidentMessages: (incidentId: string) => {
    mocks.messageQuery.lastIncidentId = incidentId;

    return { status: "ready", data: { messages } };
  },
}));
vi.mock("./useFeatureMessageIds", () => ({
  useFeatureMessageIds: () => mocks.featureMessageIds.current,
}));
vi.mock("views/journal/FilterableMessageStack", () => ({
  FilterableMessageStack: ({
    messages: shown,
    effectiveId,
    expandSelected,
    bare,
    onSelect,
  }: {
    messages: { id: string }[];
    effectiveId?: string;
    expandSelected?: boolean;
    bare?: boolean;
    onSelect: (id: string) => void;
  }) => {
    mocks.stackProps.last = { effectiveId, expandSelected, bare };

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
  mocks.messageQuery.lastIncidentId = undefined;
});

const moveSlider = (to: Date | undefined) => {
  const onTimeChange = mocks.mapProps.last?.onTimeChange as (d: Date | undefined) => void;

  act(() => onTimeChange(to));
};

const selectFeature = (featureId: string | undefined, sourceIncidentId?: string) => {
  const onFeatureSelect = mocks.mapProps.last?.onFeatureSelect as (
    id: string | undefined,
    sourceIncidentId?: string,
  ) => void;

  act(() => onFeatureSelect(featureId, sourceIncidentId));
};

describe("LagebildView", () => {
  describe("in an incident with sub-incidents", () => {
    it("looks the messages of a feature up in the incident that drew it", () => {
      render(<LagebildView />);

      selectFeature("feature-1", "inc-child");

      expect(mocks.messageQuery.lastIncidentId).toBe("inc-child");
    });

    it("uses the viewed incident for its own features, and again after deselecting", () => {
      render(<LagebildView />);

      selectFeature("feature-1", "inc-child");
      selectFeature("feature-2", "inc-1");
      expect(mocks.messageQuery.lastIncidentId).toBe("inc-1");

      selectFeature("feature-1", "inc-child");
      selectFeature(undefined);
      expect(mocks.messageQuery.lastIncidentId).toBe("inc-1");
    });

    it("falls back to the viewed incident when the feature's incident is unknown", () => {
      render(<LagebildView />);

      selectFeature("feature-1");

      expect(mocks.messageQuery.lastIncidentId).toBe("inc-1");
    });
  });

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
    expect(mocks.stackProps.last).toMatchObject({
      effectiveId: undefined,
      expandSelected: true,
      bare: true,
    });

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
