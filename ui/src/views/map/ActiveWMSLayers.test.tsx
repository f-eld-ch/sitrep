import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ActiveWMSLayers from "./ActiveWMSLayers";
import { LayerContext, type LayerState, type WMSLayer } from "./LayerContext";

// Stand-ins that show what a Source and its Layer were given, without a map.
vi.mock("react-map-gl/maplibre", () => ({
  Source: ({
    id,
    type,
    tiles,
    tileSize,
    children,
  }: {
    id: string;
    type: string;
    tiles: string[];
    tileSize: number;
    children: ReactNode;
  }) => (
    <div data-testid={`source-${id}`} data-type={type} data-tile-size={tileSize}>
      <output aria-label={`tiles-${id}`}>{tiles.join("|")}</output>
      {children}
    </div>
  ),
  Layer: ({ id, type, paint }: { id: string; type: string; paint: Record<string, unknown> }) => (
    <i
      data-testid={`layer-${id}`}
      data-type={type}
      data-opacity={paint["raster-opacity"] as number}
    />
  ),
}));

const wmsLayer = (name: string, overrides: Partial<WMSLayer> = {}): WMSLayer => ({
  name,
  title: name,
  server: "https://wms.example/service",
  opacity: 0.6,
  isVisible: true,
  ...overrides,
});

const renderWith = (activeLayers: WMSLayer[] | undefined) => {
  const state = {
    wms: { activeLayers, availableLayers: {}, currentServer: "", servers: [] },
  } as unknown as LayerState;

  return render(
    <LayerContext.Provider value={{ state, dispatch: () => null }}>
      <ActiveWMSLayers />
    </LayerContext.Provider>,
  );
};

describe("ActiveWMSLayers", () => {
  it("draws a raster source with one layer for every visible WMS layer", () => {
    renderWith([wmsLayer("gefahr", { opacity: 0.3 }), wmsLayer("hang")]);

    expect(screen.getByTestId("source-gefahr")).toHaveAttribute("data-type", "raster");
    expect(screen.getByTestId("source-gefahr")).toHaveAttribute("data-tile-size", "512");
    expect(screen.getByTestId("layer-gefahr")).toHaveAttribute("data-opacity", "0.3");
    expect(screen.getByTestId("layer-hang")).toHaveAttribute("data-opacity", "0.6");
  });

  it("requests the tiles of the layer from its server", () => {
    renderWith([wmsLayer("gefahr")]);

    const url = new URL(screen.getByLabelText("tiles-gefahr").textContent ?? "");

    expect(url.origin + url.pathname).toBe("https://wms.example/service");
    expect(url.searchParams.get("LAYERS")).toBe("gefahr");
    expect(url.searchParams.get("SERVICE")).toBe("WMS");
    expect(url.searchParams.get("CRS")).toBe("EPSG:3857");
    expect(screen.getByLabelText("tiles-gefahr").textContent).toContain("BBOX={bbox-epsg-3857}");
  });

  it("leaves out layers that are switched off", () => {
    renderWith([wmsLayer("on"), wmsLayer("off", { isVisible: false })]);

    expect(screen.getByTestId("source-on")).toBeInTheDocument();
    expect(screen.queryByTestId("source-off")).not.toBeInTheDocument();
  });

  it.each([[[]], [undefined]])("draws nothing for %j", (layers) => {
    const { container } = renderWith(layers);

    expect(container).toBeEmptyDOMElement();
  });
});
