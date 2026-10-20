import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Layer } from "types/layer";
import { LayerContext, type LayerState } from "../LayerContext";
import { SelectedFeatureHighlight } from "./SelectedFeatureHighlight";

vi.mock("react-map-gl/maplibre", () => ({
  Source: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="source" data-features={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Layer: ({ id }: { id: string }) => <i data-testid={id} />,
}));

const feature = (id: string) => ({
  id,
  geometry: { type: "Point" as const, coordinates: [8, 47] },
  properties: { label: id },
});
const layer = (id: string, ids: string[]) =>
  ({ id, kind: "STANDARD", features: ids.map(feature) }) as unknown as Layer;

function setup(featureId: string | undefined, layers: LayerState["layers"]) {
  const state = {
    layers,
    pendingFeatures: [],
    removedFeatures: [],
    activeLayer: undefined,
    selectedFeature: undefined,
    draw: undefined,
    wms: { activeLayers: [], availableLayers: {}, currentServer: "", servers: [] },
  } as LayerState;

  return render(
    <LayerContext.Provider value={{ state, dispatch: vi.fn() }}>
      <SelectedFeatureHighlight featureId={featureId} />
    </LayerContext.Provider>,
  );
}

const highlighted = () =>
  JSON.parse(screen.getByTestId("source").dataset.features ?? "{}").features.map(
    (f: { id: string }) => f.id,
  );

describe("SelectedFeatureHighlight", () => {
  it("rings the selected feature wherever it is", () => {
    setup("c", [
      { layer: layer("l1", ["a", "b"]), isVisible: true },
      { layer: layer("l2", ["c"]), isVisible: true },
    ]);

    expect(highlighted()).toEqual(["c"]);
    expect(screen.getByTestId("selected-feature-point")).toBeInTheDocument();
  });

  it("shows nothing without a selection", () => {
    const { container } = setup(undefined, [{ layer: layer("l1", ["a"]), isVisible: true }]);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing for a feature that is not on a visible layer", () => {
    const { container } = setup("a", [{ layer: layer("l1", ["a"]), isVisible: false }]);

    expect(container).toBeEmptyDOMElement();
  });
});
