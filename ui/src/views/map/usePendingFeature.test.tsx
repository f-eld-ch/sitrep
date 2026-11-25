import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentContext } from "utils";
import de from "../../i18n/locales/de/translations.json";
import { LayerContext, type LayerState } from "./LayerContext";
import { MapTimeContext, type MapTime } from "./MapTimeContext";
import { consumeCreatedForMessage } from "./pending";
import { usePendingFeature } from "./usePendingFeature";

const mocks = vi.hoisted(() => ({
  addFeature: vi.fn(),
  addState: { loading: false, error: undefined as { code: string } | undefined },
}));

vi.mock("api", () => ({ useAddFeature: () => [mocks.addFeature, mocks.addState] }));
vi.mock("react-router", () => ({ useParams: () => ({ incidentId: "inc-1" }) }));
// The real locale file, so a missing translation fails the test.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key.split(".").reduce<unknown>((node, part) => (node as never)?.[part], de) ?? key,
  }),
}));

const geometry = { type: "Point" as const, coordinates: [8, 47] };
const dispatch = vi.fn();

const layerState = (pendingIds: string[]): LayerState => ({
  layers: [],
  pendingFeatures: pendingIds.map((id) => ({
    id,
    layerId: "layer-1",
    geometry,
    properties: { icon: "x" },
  })),
  removedFeatures: [],
  draftFeatures: [],
  activeLayer: undefined,
  selectedFeature: undefined,
  draw: undefined,
  wms: { activeLayers: [], availableLayers: {}, currentServer: "", servers: [] },
});

function render(featureId: string | undefined, time: MapTime = {}) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <IncidentContext.Provider
      value={{
        state: { incident: {} as never, loadedForId: "inc-1" },
        dispatch: () => null,
      }}
    >
      <LayerContext.Provider value={{ state: layerState(["p1"]), dispatch }}>
        <MapTimeContext.Provider value={time}>{children}</MapTimeContext.Provider>
      </LayerContext.Provider>
    </IncidentContext.Provider>
  );

  return renderHook(() => usePendingFeature(featureId), { wrapper });
}

beforeEach(() => {
  mocks.addFeature.mockReset();
  mocks.addState.loading = false;
  mocks.addState.error = undefined;
  dispatch.mockReset();
});

describe("usePendingFeature", () => {
  it.each([["unknown"], [undefined]])("is undefined for %s", (featureId) => {
    expect(render(featureId).result.current).toBeUndefined();
  });

  it("reports the saving state", () => {
    mocks.addState.loading = true;

    expect(render("p1").result.current?.saving).toBe(true);
  });

  it("reports a failed save as a translated error, for the object it was for only", async () => {
    mocks.addFeature.mockRejectedValue(new Error("nope"));
    mocks.addState.error = { code: "FORBIDDEN" };
    const view = render("p1");
    expect(view.result.current?.error).toBeUndefined();

    act(() => view.result.current?.onSave({ icon: "y" }, undefined));
    await waitFor(() => expect(view.result.current?.error).toBe(de.errors.FORBIDDEN));

    // saving again starts clean
    mocks.addFeature.mockReturnValue(new Promise(() => {}));
    act(() => view.result.current?.onSave({ icon: "y" }, undefined));
    expect(view.result.current?.error).toBeUndefined();
  });

  it("does not show the error of one object on the next one drawn", async () => {
    mocks.addFeature.mockRejectedValue(new Error("nope"));
    mocks.addState.error = { code: "FORBIDDEN" };
    const first = render("p1");
    act(() => first.result.current?.onSave({ icon: "y" }, undefined));
    await waitFor(() => expect(first.result.current?.error).toBe(de.errors.FORBIDDEN));

    // the command's state is shared; another object is another panel
    const second = render("p2");
    expect(second.result.current?.error).toBeUndefined();
  });

  it("has no error while nothing failed", () => {
    expect(render("p1").result.current?.error).toBeUndefined();
  });

  it("saves the feature under its draw id, then drops the local copy and closes the panel", async () => {
    mocks.addFeature.mockResolvedValue({ featureId: "saved-1" });
    const asOf = new Date("2026-01-15T09:00:00Z");
    const effectiveAt = new Date("2026-01-15T08:30:00Z");

    render("p1", { asOf }).result.current?.onSave({ icon: "y" }, effectiveAt);

    expect(mocks.addFeature).toHaveBeenCalledWith({
      layerId: "layer-1",
      clientKey: "p1",
      geometry,
      properties: { icon: "y" },
      incidentId: "inc-1",
      change: { effectiveAt },
      asOf,
    });
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
    expect(dispatch.mock.calls).toEqual([
      [{ type: "REMOVE_PENDING_FEATURE", payload: { id: "p1" } }],
      [{ type: "DESELECT_FEATURE", payload: null }],
    ]);
  });

  it("creates a feature drawn for a message in one request, with the message's time", async () => {
    mocks.addFeature.mockResolvedValue({ featureId: "saved-1" });
    const drawingMessage = { id: "msg-1", time: new Date("2026-01-15T09:00:00Z") };

    // a time picked by mistake does not count: the message's time is used
    render("p1", { drawingMessage }).result.current?.onSave(
      { icon: "y" },
      new Date("2026-01-15T10:00:00Z"),
    );

    expect(mocks.addFeature).toHaveBeenCalledWith(
      expect.objectContaining({ clientKey: "p1", change: { messageId: "msg-1" } }),
    );
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
    // deleting the feature leaves no ghost
    expect(consumeCreatedForMessage("saved-1", "msg-other")).toBe(false);
    expect(consumeCreatedForMessage("saved-1", "msg-1")).toBe(true);
  });

  it("saves for now when no time is given", () => {
    mocks.addFeature.mockResolvedValue({ featureId: "saved-1" });

    render("p1").result.current?.onSave({}, undefined);

    expect(mocks.addFeature).toHaveBeenCalledWith(
      expect.objectContaining({ change: undefined, asOf: undefined }),
    );
  });

  it("keeps the feature local when saving fails", async () => {
    const failed = Promise.reject(new Error("nope"));
    mocks.addFeature.mockReturnValue(failed);

    render("p1").result.current?.onSave({}, undefined);
    await failed.catch(() => undefined);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("drops the local copy and the selection when discarded", () => {
    render("p1").result.current?.onDiscard();

    expect(dispatch.mock.calls).toEqual([
      [{ type: "REMOVE_PENDING_FEATURE", payload: { id: "p1" } }],
      [{ type: "DESELECT_FEATURE", payload: null }],
    ]);
    expect(mocks.addFeature).not.toHaveBeenCalled();
  });
});
