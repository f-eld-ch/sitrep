import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "types/layer";
import de from "../../../i18n/locales/de/translations.json";
import { LayerContext, type DrawingLayerState, type LayerState } from "../LayerContext";
import { MapTimeContext, type MapTime } from "../MapTimeContext";
import ActiveLayersControl from "./ActiveLayersControl";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

const mocks = vi.hoisted(() => ({
  addLayer: vi.fn(),
  fitBounds: vi.fn(),
  map: { current: undefined as unknown },
  params: { incidentId: "inc-1" as string | undefined },
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: lookup }) }));
vi.mock("react-router", () => ({ useParams: () => mocks.params }));
vi.mock("react-map-gl/maplibre", () => ({ useMap: () => ({ current: mocks.map.current }) }));
vi.mock("api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("api")>()),
  useAddLayer: () => [mocks.addLayer],
}));

const feature = (id: string, coordinates: number[]) => ({
  id,
  geometry: { type: "Point" as const, coordinates },
  properties: {},
});

function layerState(
  id: string,
  name: string,
  opts: Partial<Layer> & { isVisible?: boolean } = {},
): DrawingLayerState {
  const { isVisible = true, ...layer } = opts;
  return {
    layer: {
      id,
      name,
      kind: "STANDARD",
      sourceIncidentId: "inc-1",
      sourceIncidentName: "Bergsturz",
      features: [],
      ...layer,
    } as unknown as Layer,
    isVisible,
  };
}

const dispatch = vi.fn();

function renderControl(
  layers: DrawingLayerState[],
  { activeLayer, time = {} }: { activeLayer?: string; time?: MapTime } = {},
) {
  const state = { layers, activeLayer } as unknown as LayerState;
  return render(
    <MapTimeContext.Provider value={time}>
      <LayerContext.Provider value={{ state, dispatch }}>
        <ActiveLayersControl />
      </LayerContext.Provider>
    </MapTimeContext.Provider>,
  );
}

/** The buttons inside the row of the layer with this label. */
const rowButtons = (label: string) =>
  (screen.getByText(label).parentElement as HTMLElement).querySelectorAll("button");

describe("ActiveLayersControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.map.current = { fitBounds: mocks.fitBounds };
    mocks.params.incidentId = "inc-1";
  });

  it("makes a clicked layer the active one and frames its features", () => {
    renderControl([
      layerState("l1", "Lage", {
        features: [feature("a", [8, 47]), feature("b", [9, 48])] as never,
      }),
    ]);

    fireEvent.click(screen.getByText("Lage"));

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_ACTIVE_LAYER",
      payload: { layerId: "l1" },
    });
    expect(mocks.fitBounds).toHaveBeenCalledWith(
      [
        [8, 47],
        [9, 48],
      ],
      { animate: true, maxZoom: 16, padding: { top: 40, bottom: 40, left: 40, right: 40 } },
    );
  });

  it("does not frame an empty layer", () => {
    renderControl([layerState("l1", "Lage")]);

    fireEvent.click(screen.getByText("Lage"));

    expect(mocks.fitBounds).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("activates a layer even when the map is not ready", () => {
    mocks.map.current = undefined;
    renderControl([layerState("l1", "Lage", { features: [feature("a", [8, 47])] as never })]);

    fireEvent.click(screen.getByText("Lage"));

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("shows the message map when it is picked outside of drawing for a message, and frames it", () => {
    renderControl([
      layerState("mm", "x", { kind: "MESSAGE_MAP", features: [feature("a", [8, 47])] as never }),
    ]);

    fireEvent.click(screen.getByText("Nachrichtenkarte"));

    // active, so shown as it is: the draw controls are off there, as only a message draws on it
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_ACTIVE_LAYER",
      payload: { layerId: "mm" },
    });
    expect(mocks.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("toggles the visibility of a layer without selecting it", () => {
    renderControl([layerState("l1", "Lage", { isVisible: true })]);

    fireEvent.click(rowButtons("Lage")[0]);

    expect(dispatch).toHaveBeenCalledWith({
      type: "TOGGLE_LAYER_VISIBILITY",
      payload: { layerId: "l1", isVisible: false },
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("shows a hidden layer again", () => {
    renderControl([layerState("l1", "Lage", { isVisible: false })]);

    fireEvent.click(rowButtons("Lage")[0]);

    expect(dispatch).toHaveBeenCalledWith({
      type: "TOGGLE_LAYER_VISIBILITY",
      payload: { layerId: "l1", isVisible: true },
    });
  });

  it("activates a layer with its edit button", () => {
    renderControl([layerState("l1", "Lage")]);

    fireEvent.click(rowButtons("Lage")[1]);

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_ACTIVE_LAYER",
      payload: { layerId: "l1" },
    });
  });

  it("offers no controls on the active layer", () => {
    renderControl([layerState("l1", "Lage")], { activeLayer: "l1" });

    expect(rowButtons("Lage")).toHaveLength(0);
  });

  it("only lets the visibility of an inherited layer be toggled", () => {
    renderControl([
      layerState("own", "Eigene"),
      layerState("other", "Geerbt", { sourceIncidentId: "inc-0", sourceIncidentName: "Vorläufer" }),
    ]);

    expect(screen.getByText("Vorläufer")).toBeInTheDocument();
    expect(rowButtons("Geerbt")).toHaveLength(1);
    expect(rowButtons("Eigene")).toHaveLength(2);
  });

  it("offers no edit on the message map layer when not drawing for a message", () => {
    renderControl([layerState("mm", "x", { kind: "MESSAGE_MAP" })]);

    expect(rowButtons("Nachrichtenkarte")).toHaveLength(1);
  });

  it("offers the message map layer for editing when drawing for a message", () => {
    renderControl([layerState("mm", "x", { kind: "MESSAGE_MAP" })], {
      time: { drawingMessage: { id: "m1", time: new Date(0) } },
    });

    expect(rowButtons("Nachrichtenkarte")).toHaveLength(2);
  });

  it("offers adding a layer to the current incident when it has none of its own", () => {
    renderControl([
      layerState("other", "Geerbt", { sourceIncidentId: "inc-0", sourceIncidentName: "Vorläufer" }),
    ]);

    expect(screen.getByText("Aktuelles Ereignis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Layer hinzufügen/ })).toBeInTheDocument();
  });

  it("hides the add layer controls on a message map only map", () => {
    renderControl([layerState("mm", "x", { kind: "MESSAGE_MAP" })], {
      time: { messageMapOnly: true },
    });

    expect(screen.queryByRole("button", { name: /Layer hinzufügen/ })).not.toBeInTheDocument();
  });

  describe("adding a layer", () => {
    const open = () => fireEvent.click(screen.getByRole("button", { name: /Layer hinzufügen/ }));

    it("creates the layer for the incident, picks it, and closes the form", async () => {
      mocks.addLayer.mockResolvedValue({ layerId: "new-layer" });
      renderControl([layerState("l1", "Lage")]);
      open();

      fireEvent.change(screen.getByPlaceholderText("Layer-Name"), { target: { value: "Neu" } });
      fireEvent.click(screen.getByRole("button", { name: /Layer hinzufügen/ }));

      expect(mocks.addLayer).toHaveBeenCalledWith({ incidentId: "inc-1", name: "Neu" });
      expect(screen.queryByPlaceholderText("Layer-Name")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(dispatch).toHaveBeenCalledWith({
          type: "SET_ACTIVE_LAYER",
          payload: { layerId: "new-layer" },
        }),
      );
    });

    it("keeps the button disabled for a blank name", () => {
      renderControl([layerState("l1", "Lage")]);
      open();

      fireEvent.change(screen.getByPlaceholderText("Layer-Name"), { target: { value: "   " } });

      expect(screen.getByRole("button", { name: /Layer hinzufügen/ })).toBeDisabled();
      expect(mocks.addLayer).not.toHaveBeenCalled();
    });

    it("does nothing without an incident in the route", () => {
      mocks.params.incidentId = undefined;
      renderControl([layerState("l1", "Lage", { sourceIncidentId: "x" })]);
      open();

      fireEvent.change(screen.getByPlaceholderText("Layer-Name"), { target: { value: "Neu" } });
      fireEvent.click(screen.getByRole("button", { name: /Layer hinzufügen/ }));

      expect(mocks.addLayer).not.toHaveBeenCalled();
    });
  });
});
