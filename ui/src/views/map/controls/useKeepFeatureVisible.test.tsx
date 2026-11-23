import { render } from "@testing-library/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeepFeatureVisible } from "./useKeepFeatureVisible";

type F = Feature<Geometry, GeoJsonProperties>;

const mocks = vi.hoisted(() => ({ map: undefined as unknown }));
vi.mock("react-map-gl/maplibre", () => ({ useMap: () => ({ current: mocks.map }) }));

function Probe({ feature }: { feature: F | undefined }) {
  useKeepFeatureVisible(feature);

  return null;
}

const point = (coordinates: [number, number]): F => ({
  type: "Feature",
  id: "p",
  geometry: { type: "Point", coordinates },
  properties: {},
});

const line = (): F => ({
  type: "Feature",
  id: "l",
  geometry: {
    type: "LineString",
    coordinates: [
      [8, 47],
      [9, 48],
    ],
  },
  properties: {},
});

/** A 1000 × 800 map whose panel covers everything right of x = 700. */
function fakeMap(project: (p: [number, number]) => { x: number; y: number }) {
  const container = document.createElement("div");
  const panel = document.createElement("div");
  panel.setAttribute("data-feature-panel", "");
  container.append(panel);
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 800 }) as DOMRect;
  panel.getBoundingClientRect = () => ({ left: 700, width: 300 }) as DOMRect;

  return {
    getContainer: () => container,
    project,
    panBy: vi.fn(),
    fitBounds: vi.fn(),
    getBearing: () => 0,
    getPitch: () => 0,
  };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useKeepFeatureVisible", () => {
  it("does nothing without a map or a feature", () => {
    mocks.map = undefined;
    expect(() => render(<Probe feature={point([8, 47])} />)).not.toThrow();

    const map = fakeMap(() => ({ x: 100, y: 100 }));
    mocks.map = map;
    render(<Probe feature={undefined} />);
    expect(map.panBy).not.toHaveBeenCalled();
  });

  it("leaves a point alone that is in the clear", () => {
    const map = fakeMap(() => ({ x: 300, y: 300 }));
    mocks.map = map;
    render(<Probe feature={point([8, 47])} />);

    expect(map.panBy).not.toHaveBeenCalled();
  });

  it("pans a point out from under the panel", () => {
    const map = fakeMap(() => ({ x: 800, y: 300 }));
    mocks.map = map;
    render(<Probe feature={point([8, 47])} />);

    // the panel starts at 700, with a 24 px margin: the point must end at 676
    expect(map.panBy).toHaveBeenCalledWith([124, 0], { duration: 300 });
  });

  it("pans a point that is off the top or the bottom into view", () => {
    const map = fakeMap(() => ({ x: 300, y: 0 }));
    mocks.map = map;
    render(<Probe feature={point([8, 47])} />);
    expect(map.panBy).toHaveBeenCalledWith([0, -24], { duration: 300 });
  });

  it("fits a line into the space left of the panel when none of it is visible", () => {
    const map = fakeMap(() => ({ x: 900, y: 300 }));
    mocks.map = map;
    render(<Probe feature={line()} />);

    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [8, 47],
        [9, 48],
      ],
      expect.objectContaining({ padding: { top: 60, bottom: 60, left: 60, right: 360 } }),
    );
  });

  it("leaves a line alone when part of it is visible", () => {
    const map = fakeMap(() => ({ x: 300, y: 300 }));
    mocks.map = map;
    render(<Probe feature={line()} />);

    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});
