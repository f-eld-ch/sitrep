import { describe, expect, it } from "vitest";
import { LV03, LV95 } from ".";
import {
  LV95_RESOLUTIONS,
  SWISSTOPO_TILEGRID_RESOLUTIONS,
  SWISSTOPO_TILEGRID_ZOOM_TO_STANDARD_ZOOM_MATRIX,
} from "./SwissCoordinateSystem";

describe.each([
  ["LV95", LV95],
  ["LV03", LV03],
])("SwissCoordinateSystem (%s)", (_name, system) => {
  it("shows the 1:25'000 map at zoom 8, the default zoom being 1", () => {
    expect(system.get1_25000ZoomLevel()).toBe(8);
    expect(system.getDefaultZoom()).toBe(1);
  });

  it("anchors tiles at the top-left corner of its bounds", () => {
    expect(system.getTileOrigin()).toEqual([system.bounds.lowerX, system.bounds.upperY]);
  });

  it("rounds coordinates to the centimetre", () => {
    expect(system.roundCoordinateValue(2600000.126)).toBe(2600000.13);
    expect(system.roundCoordinateValue(2600000.124)).toBe(2600000.12);
  });

  describe("transformCustomZoomLevelToStandard", () => {
    it.each([
      [0, 7.35],
      [3, 10],
      [8, 15.5],
      [14, 21],
      [3.9, 10], // floored
    ])("zoom %s is web mercator zoom %s", (custom, standard) => {
      expect(system.transformCustomZoomLevelToStandard(custom)).toBe(standard);
    });

    it("falls back to the 1:25'000 zoom beyond the pyramid", () => {
      expect(system.transformCustomZoomLevelToStandard(15)).toBe(15.5);
      expect(system.transformCustomZoomLevelToStandard(99)).toBe(15.5);
    });
  });

  describe("transformStandardZoomLevelToCustom", () => {
    it.each([
      [7.35, 0], // nothing is below the lowest step
      [7.36, 1],
      [10, 3],
      [10.01, 4],
      [15.5, 8],
      [21, 14],
    ])("web mercator zoom %s is swiss zoom %s", (standard, custom) => {
      expect(system.transformStandardZoomLevelToCustom(standard)).toBe(custom);
    });

    it("clamps zooms beyond either end of the pyramid", () => {
      expect(system.transformStandardZoomLevelToCustom(2)).toBe(0);
      expect(system.transformStandardZoomLevelToCustom(25)).toBe(14);
    });
  });

  describe("resolution and zoom", () => {
    it.each([
      [0, 650],
      [8, 2.5],
      [13, 0.1],
      [3.4, 100], // rounded to the nearest step
      [3.6, 50],
    ])("zoom %s has a resolution of %s m/px", (zoom, resolution) => {
      expect(system.getResolutionForZoomAndCenter(zoom)).toBe(resolution);
    });

    it.each([
      [650, 0],
      [100, 3],
      [2.5, 8],
      [0.1, 13],
      [120, 3], // first resolution that is not above the requested one
      [700, 0], // coarser than anything known
      [0.01, 13], // finer than anything known
    ])("resolution %s m/px is zoom %s", (resolution, zoom) => {
      expect(system.getZoomForResolutionAndCenter(resolution)).toBe(zoom);
    });
  });

  describe("roundZoomLevel", () => {
    it("rounds to three decimals by default", () => {
      expect(system.roundZoomLevel(4.123456)).toBe(4.123);
    });

    it("snaps to the nearest swiss zoom when normalizing", () => {
      expect(system.roundZoomLevel(4.4, true)).toBe(4);
      expect(system.roundZoomLevel(4.6, true)).toBe(5);
      expect(system.roundZoomLevel(30, true)).toBe(14);
    });
  });

  describe("getResolutionSteps", () => {
    const steps = system.getResolutionSteps();

    it("has one step per tile grid resolution, from coarsest to finest", () => {
      expect(steps.map((s) => s.resolution)).toEqual(SWISSTOPO_TILEGRID_RESOLUTIONS);
      expect(steps[0].resolution).toBe(4000);
      expect(steps.at(-1)?.resolution).toBe(0.1);
    });

    it("labels steps with the product scale of their zoom level", () => {
      const step = steps.find((s) => s.resolution === 2.5);
      expect(step).toEqual({ zoom: 8, label: "1:25'000", resolution: 2.5 });
      expect(steps.find((s) => s.resolution === 0.25)).toEqual({
        zoom: 12,
        label: "1:10'000",
        resolution: 0.25,
      });
    });

    // Current behaviour: indexOf returns -1 for resolutions that are not a LV95 zoom level,
    // and zoom 0 is falsy, so neither gets a label.
    it("has no label for zoom 0 and a zoom of -1 for the intermediate resolutions", () => {
      expect(steps.find((s) => s.resolution === 650)).toEqual({
        zoom: 0,
        label: undefined,
        resolution: 650,
      });
      expect(steps.find((s) => s.resolution === 4000)).toEqual({
        zoom: -1,
        label: undefined,
        resolution: 4000,
      });
    });

    it("has a matrix id per step", () => {
      expect(system.getMatrixIds()).toEqual(steps.map((_, index) => index));
    });
  });
});

describe("swiss zoom tables", () => {
  it("lists the LV95 resolutions in descending order", () => {
    expect([...LV95_RESOLUTIONS].sort((a, b) => b - a)).toEqual(LV95_RESOLUTIONS);
  });

  it("maps every swiss zoom level to a web mercator zoom in ascending order", () => {
    expect(SWISSTOPO_TILEGRID_ZOOM_TO_STANDARD_ZOOM_MATRIX).toHaveLength(15);
    expect([...SWISSTOPO_TILEGRID_ZOOM_TO_STANDARD_ZOOM_MATRIX].sort((a, b) => a - b)).toEqual(
      SWISSTOPO_TILEGRID_ZOOM_TO_STANDARD_ZOOM_MATRIX,
    );
  });
});
