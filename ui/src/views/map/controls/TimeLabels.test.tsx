import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Layer } from "types/layer";
import { LayerContext, type LayerState } from "../LayerContext";
import { MapTimeContext } from "../MapTimeContext";
import { TimeLabels } from "./TimeLabels";

vi.mock("react-map-gl/maplibre", () => ({
  Source: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="source" data-features={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Layer: ({ id }: { id: string }) => <i data-testid={id} />,
}));

const feature = (id: string, placedAt?: Date, color?: string) => ({
  id,
  geometry: { type: "Point" as const, coordinates: [8, 47] },
  properties: { color },
  placedAt,
});
const layer = (features: ReturnType<typeof feature>[]) =>
  ({ id: "l", kind: "STANDARD", features }) as unknown as Layer;

function setup(layers: LayerState["layers"], asOf?: Date) {
  const state = { layers, pendingFeatures: [], removedFeatures: [] } as unknown as LayerState;

  return render(
    <MapTimeContext.Provider value={{ asOf }}>
      <LayerContext.Provider value={{ state, dispatch: vi.fn() }}>
        <TimeLabels />
      </LayerContext.Provider>
    </MapTimeContext.Provider>,
  );
}

const labels = () =>
  JSON.parse(screen.getByTestId("source").dataset.features ?? "{}").features.map(
    (f: { properties: { timeLabel: string; color?: string } }) => [
      f.properties.timeLabel,
      f.properties.color,
    ],
  );

describe("TimeLabels", () => {
  const asOf = new Date(2026, 9, 10, 18, 0);

  it("writes the first time in the feature colour, with the date only on another day", () => {
    setup(
      [
        {
          layer: layer([
            feature("a", new Date(2026, 9, 10, 8, 15), "#ff0000"),
            feature("b", new Date(2026, 9, 9, 7, 30), "#00ff00"),
          ]),
          isVisible: true,
        },
      ],
      asOf,
    );

    expect(labels()).toEqual([
      ["08:15", "#ff0000"],
      ["09.10.2026 07:30", "#00ff00"],
    ]);
  });

  it("skips features without a time and layers that are hidden", () => {
    setup(
      [
        { layer: layer([feature("a")]), isVisible: true },
        { layer: layer([feature("b", new Date(2026, 9, 10, 8, 15))]), isVisible: false },
      ],
      asOf,
    );

    expect(labels()).toEqual([]);
  });

  it("has a layer for symbols and one for lines and areas", () => {
    setup([], asOf);

    expect(screen.getByTestId("time-label-point")).toBeInTheDocument();
    expect(screen.getByTestId("time-label-shape")).toBeInTheDocument();
  });
});
