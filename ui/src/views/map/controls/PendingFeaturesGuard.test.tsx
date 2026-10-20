import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { LayerContext, type LayerState, type PendingFeature } from "../LayerContext";
import { PendingFeaturesGuard } from "./PendingFeaturesGuard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

const pending = (id: string): PendingFeature => ({
  id,
  layerId: "layer",
  geometry: { type: "Point", coordinates: [8, 47] },
  properties: {},
});

function setup(pendingFeatures: PendingFeature[]) {
  const state = {
    layers: [],
    pendingFeatures,
    removedFeatures: [],
    activeLayer: undefined,
    selectedFeature: undefined,
    draw: undefined,
    wms: { activeLayers: [], availableLayers: {}, currentServer: "", servers: [] },
  } as LayerState;
  const router = createMemoryRouter(
    [
      {
        path: "/map",
        element: (
          <LayerContext.Provider value={{ state, dispatch: vi.fn() }}>
            <PendingFeaturesGuard />
          </LayerContext.Provider>
        ),
      },
      { path: "/other", element: <p>other page</p> },
    ],
    { initialEntries: ["/map"] },
  );
  render(<RouterProvider router={router} />);

  return router;
}

describe("PendingFeaturesGuard", () => {
  it("lets the user leave freely while everything is saved", async () => {
    const router = setup([]);

    await act(() => router.navigate("/other"));

    expect(router.state.location.pathname).toBe("/other");
  });

  it("asks before leaving with unsaved objects, and can stay", async () => {
    const router = setup([pending("a"), pending("b")]);

    await act(() => router.navigate("/other"));

    expect(router.state.location.pathname).toBe("/map");
    expect(screen.getByText("mapview.pending.unsaved:2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(router.state.location.pathname).toBe("/map");
  });

  it("leaves once confirmed", async () => {
    const router = setup([pending("a")]);

    await act(() => router.navigate("/other"));
    fireEvent.click(screen.getByRole("button", { name: "mapview.pending.leave" }));

    expect(router.state.location.pathname).toBe("/other");
  });

  it("warns before the tab is closed, only while something is unsaved", () => {
    const event = new Event("beforeunload", { cancelable: true });
    const unsaved = setup([pending("a")]);
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    void unsaved;
  });

  it("does not warn about closing the tab when everything is saved", () => {
    setup([]);
    const event = new Event("beforeunload", { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
