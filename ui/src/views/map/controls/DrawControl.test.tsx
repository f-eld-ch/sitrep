import { render } from "@testing-library/react";
import { useEffect, useMemo } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LayerContext, type LayerState } from "../LayerContext";
import DrawControl from "./DrawControl";

type Listener = (e: unknown) => void;

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, Set<(e: unknown) => void>>(),
  drawOptions: [] as unknown[],
  controlPosition: undefined as unknown,
}));

/** Stands in for the real draw control, which needs a WebGL map to do anything. */
vi.mock("@mapbox/mapbox-gl-draw", () => ({
  default: class FakeDraw {
    constructor(options: unknown) {
      mocks.drawOptions.push(options);
    }
  },
}));

const fakeMap = {
  on: (event: string, listener: Listener) => {
    if (!mocks.listeners.has(event)) mocks.listeners.set(event, new Set());
    mocks.listeners.get(event)?.add(listener);
  },
  off: (event: string, listener: Listener) => mocks.listeners.get(event)?.delete(listener),
};

vi.mock("react-map-gl/maplibre", () => ({
  useControl: (
    factory: () => unknown,
    onAdd: (ctx: { map: unknown }) => void,
    onRemove: (ctx: { map: unknown }) => void,
    options: { position?: string },
  ) => {
    mocks.controlPosition = options.position;
    const control = useMemo(factory, []); // oxlint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
      onAdd({ map: fakeMap });
      return () => onRemove({ map: fakeMap });
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- like react-map-gl: bound once
    }, []);

    return control;
  },
}));

const emit = (event: string, payload: unknown) =>
  mocks.listeners.get(event)?.forEach((listener) => listener(payload));

const dispatch = vi.fn();
const handlers = () => ({
  onCreate: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  onCombine: vi.fn(),
  onSelectionChange: vi.fn(),
});

function tree(props: { activeLayer: string } & ReturnType<typeof handlers>) {
  return (
    <LayerContext.Provider value={{ state: {} as LayerState, dispatch }}>
      <DrawControl position="top-right" displayControlsDefault={false} {...props} />
    </LayerContext.Provider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listeners.clear();
  mocks.drawOptions = [];
});

describe("DrawControl", () => {
  it("creates one draw control from its options, in the requested corner", () => {
    render(tree({ activeLayer: "l1", ...handlers() }));

    expect(mocks.drawOptions).toHaveLength(1);
    expect(mocks.drawOptions[0]).toMatchObject({
      position: "top-right",
      displayControlsDefault: false,
      activeLayer: "l1",
    });
    expect(mocks.controlPosition).toBe("top-right");
  });

  it("publishes the control for the rest of the map, and retracts it when it goes", () => {
    const { unmount } = render(tree({ activeLayer: "l1", ...handlers() }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_DRAW",
      payload: { draw: expect.objectContaining({}) },
    });
    expect(dispatch.mock.calls[0][0].payload.draw).toBeDefined();

    unmount();

    expect(dispatch).toHaveBeenLastCalledWith({ type: "SET_DRAW", payload: { draw: undefined } });
  });

  it("reports what is drawn on the layer that is active at that moment", () => {
    const h = handlers();
    const { rerender } = render(tree({ activeLayer: "l1", ...h }));

    emit("draw.create", { features: ["a"] });
    expect(h.onCreate).toHaveBeenLastCalledWith({ features: ["a"] }, "l1");

    rerender(tree({ activeLayer: "l2", ...h }));
    emit("draw.create", { features: ["b"] });

    expect(h.onCreate).toHaveBeenLastCalledWith({ features: ["b"] }, "l2");
    expect(h.onCreate).toHaveBeenCalledTimes(2);
  });

  it("calls the current callbacks, not the ones of the first render", () => {
    const first = handlers();
    const second = handlers();
    const { rerender } = render(tree({ activeLayer: "l1", ...first }));

    rerender(tree({ activeLayer: "l1", ...second }));
    emit("draw.update", { features: ["u"] });

    expect(second.onUpdate).toHaveBeenCalledWith({ features: ["u"] });
    expect(first.onUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["draw.update", "onUpdate"],
    ["draw.delete", "onDelete"],
    ["draw.combine", "onCombine"],
    ["draw.uncombine", "onCombine"],
    ["draw.selectionchange", "onSelectionChange"],
  ] as const)("forwards %s to %s", (event, callback) => {
    const h = handlers();
    render(tree({ activeLayer: "l1", ...h }));

    emit(event, { features: ["x"] });

    expect(h[callback]).toHaveBeenCalledTimes(1);
    expect(h[callback]).toHaveBeenCalledWith({ features: ["x"] });
  });

  it("stops listening when removed from the map", () => {
    const h = handlers();
    const { unmount } = render(tree({ activeLayer: "l1", ...h }));

    unmount();
    emit("draw.create", { features: ["late"] });

    expect(h.onCreate).not.toHaveBeenCalled();
    expect([...mocks.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
});
