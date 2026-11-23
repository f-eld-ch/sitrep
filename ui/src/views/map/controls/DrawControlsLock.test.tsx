import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LayerContext, type LayerState } from "../LayerContext";
import { DRAW_LOCKED_CLASS, DrawControlsLock } from "./DrawControlsLock";

const mocks = vi.hoisted(() => ({ container: undefined as HTMLElement | undefined }));

vi.mock("react-map-gl/maplibre", () => ({
  useMap: () => ({
    current: mocks.container ? { getContainer: () => mocks.container } : undefined,
  }),
}));

const pending = { id: "p1", layerId: "l", geometry: { type: "Point", coordinates: [8, 47] } };

function renderLock(pendingFeatures: unknown[], selectedFeature: string | undefined = "p1") {
  const state = { pendingFeatures, selectedFeature } as unknown as LayerState;

  return render(
    <LayerContext.Provider value={{ state, dispatch: vi.fn() }}>
      <DrawControlsLock />
    </LayerContext.Provider>,
  );
}

describe("DrawControlsLock", () => {
  beforeEach(() => {
    mocks.container = document.createElement("div");
  });

  it("locks the draw buttons while an object is drawn and not saved", () => {
    renderLock([pending]);

    expect(mocks.container!.classList.contains(DRAW_LOCKED_CLASS)).toBe(true);
  });

  it("leaves them alone with nothing pending, as on the message map", () => {
    renderLock([]);

    expect(mocks.container!.classList.contains(DRAW_LOCKED_CLASS)).toBe(false);
  });

  it("leaves them alone while an unsaved object is left behind, not selected", () => {
    renderLock([pending], "other");

    expect(mocks.container!.classList.contains(DRAW_LOCKED_CLASS)).toBe(false);
  });

  it("unlocks when the object is saved or discarded", () => {
    const { rerender } = renderLock([pending]);
    expect(mocks.container!.classList.contains(DRAW_LOCKED_CLASS)).toBe(true);

    rerender(
      <LayerContext.Provider
        value={{
          state: { pendingFeatures: [], selectedFeature: undefined } as unknown as LayerState,
          dispatch: vi.fn(),
        }}
      >
        <DrawControlsLock />
      </LayerContext.Provider>,
    );

    expect(mocks.container!.classList.contains(DRAW_LOCKED_CLASS)).toBe(false);
  });

  it("unlocks when the map goes away", () => {
    const { unmount } = renderLock([pending]);
    unmount();

    expect(mocks.container!.classList.contains(DRAW_LOCKED_CLASS)).toBe(false);
  });

  it("copes with a map that is not there yet", () => {
    mocks.container = undefined;

    expect(() => renderLock([pending])).not.toThrow();
  });
});
