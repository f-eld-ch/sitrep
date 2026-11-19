import proj4 from "proj4";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { registerProj4 } from "../register";
import { closest, LV95, round, WEBMERCATOR, WGS84 } from ".";
import type { CoordinateSystemProps } from "./CoordinateSystem";
import CoordinateSystemBounds from "./CoordinateSystemBounds";
import StandardCoordinateSystem from "./StandardCoordinateSystem";

class TestSystem extends StandardCoordinateSystem {
  constructor(props: Partial<CoordinateSystemProps> = {}) {
    super({
      epsgNumber: 4326,
      label: "test",
      proj4transformationMatrix: "+proj=longlat +datum=WGS84 +no_defs +type=proj",
      usesMercatorPyramid: false,
      ...props,
    });
  }
  roundCoordinateValue(value: number) {
    return value;
  }
  getResolutionForZoomAndCenter() {
    return 1;
  }
  getZoomForResolutionAndCenter() {
    return 1;
  }
}

beforeAll(() => {
  registerProj4(proj4);
});

describe("CoordinateSystem", () => {
  it("builds the EPSG identifier from the number", () => {
    const system = new TestSystem({ epsgNumber: 2056, technicalName: "LV95" });
    expect(system.epsg).toBe("EPSG:2056");
    expect(system.epsgNumber).toBe(2056);
    expect(system.technicalName).toBe("LV95");
    expect(system.usesMercatorPyramid).toBe(false);
  });

  describe("without bounds", () => {
    const system = new TestSystem();

    it("has no bounds in any system and nothing is in bounds", () => {
      expect(system.getBoundsAs(WGS84)).toBeNull();
      expect(system.isInBounds(0, 0)).toBe(false);
    });

    it("has no resolution steps, no matrix ids and the origin at [0, 0]", () => {
      expect(system.getResolutionSteps()).toEqual([]);
      expect(system.getMatrixIds()).toEqual([]);
      expect(system.getTileOrigin()).toEqual([0, 0]);
    });
  });

  describe("getBoundsAs", () => {
    it("returns its own bounds untouched for the same system", () => {
      expect(LV95.getBoundsAs(LV95)).toBe(LV95.bounds);
    });

    it("expresses WebMercator bounds, centre included, in WGS84", () => {
      const bounds = WEBMERCATOR.getBoundsAs(WGS84);
      expect(bounds?.lowerX).toBeCloseTo(-180, 6);
      expect(bounds?.upperX).toBeCloseTo(180, 6);
      expect(bounds?.upperY).toBeCloseTo(85.0511, 4);
      // [917209.87, 5914737.43] in EPSG:3857, i.e. the centre of the LV95 extent
      expect(bounds?.customCenter?.[0]).toBeCloseTo(8.2394, 3);
      expect(bounds?.customCenter?.[1]).toBeCloseTo(46.8323, 3);
    });

    it("has no custom centre when the source has none", () => {
      expect(LV95.getBoundsAs(WGS84)?.customCenter).toBeUndefined();
    });
  });

  describe("standard resolution steps", () => {
    it("lists 21 zoom levels that halve with each step", () => {
      const system = new TestSystem({
        bounds: new CoordinateSystemBounds({ lowerX: 0, upperX: 1, lowerY: 0, upperY: 1 }),
      });
      const steps = system.getResolutionSteps();
      expect(steps).toHaveLength(21);
      expect(steps.map((s) => s.zoom)).toEqual(Array.from({ length: 21 }, (_, i) => i));
      expect(steps[3].resolution).toBeCloseTo(steps[2].resolution / 2, 8);
      expect(system.getMatrixIds()).toEqual(Array.from({ length: 21 }, (_, i) => i));
    });

    it("shrinks every step with the cosine of the given latitude", () => {
      const system = new TestSystem({
        bounds: new CoordinateSystemBounds({ lowerX: 0, upperX: 1, lowerY: 0, upperY: 1 }),
      });
      expect(system.getResolutionSteps(60)[0].resolution).toBeCloseTo(
        system.getResolutionSteps(0)[0].resolution / 2,
        6,
      );
    });

    it("anchors tiles at the top-left corner of the bounds", () => {
      const system = new TestSystem({
        bounds: new CoordinateSystemBounds({ lowerX: 1, upperX: 2, lowerY: 3, upperY: 4 }),
      });
      expect(system.getTileOrigin()).toEqual([1, 4]);
    });

    it("rounds zoom levels to three decimals", () => {
      expect(new TestSystem().roundZoomLevel(12.34567)).toBe(12.346);
    });
  });
});

describe("round", () => {
  it.each([
    [1.5, 0, 2],
    [1.4, 0, 1],
    [1.23456, 2, 1.23],
    [1.235, 2, 1.24],
    [-1.5, 0, -1],
    ["3.14159", 3, 3.142],
  ])("round(%s, %s) is %s", (value, decimals, expected) => {
    expect(round(value as number, decimals)).toBe(expected);
  });

  it.each([[""], [null], [undefined], ["abc"], [Number.NaN]])(
    "gives NaN for %j, which is not a number",
    (value) => {
      expect(round(value as unknown as number, 2)).toBeNaN();
    },
  );
});

describe("closest", () => {
  it("picks the list value with the smallest difference", () => {
    expect(closest(4.4, [0, 2, 4, 6, 8])).toBe(4);
    expect(closest(5.1, [0, 2, 4, 6, 8])).toBe(6);
    expect(closest(100, [0, 2, 4])).toBe(4);
  });

  it("picks the first of two equally close values", () => {
    expect(closest(5, [0, 4, 6, 8])).toBe(4);
  });

  it("returns the value itself when the list has at most two entries or is not a list", () => {
    expect(closest(4.4, [1, 9])).toBe(4.4);
    expect(closest(4.4, [])).toBe(4.4);
    expect(closest(4.4, undefined as unknown as number[])).toBe(4.4);
  });
});

describe("registerProj4", () => {
  it("defines every projection that has a transformation matrix", () => {
    const defs = vi.fn();
    registerProj4({ defs } as unknown as typeof proj4, [LV95, WGS84]);
    expect(defs).toHaveBeenCalledTimes(2);
    expect(defs).toHaveBeenCalledWith("EPSG:2056", LV95.proj4transformationMatrix);
    expect(defs).toHaveBeenCalledWith("EPSG:4326", WGS84.proj4transformationMatrix);
  });

  it("skips projections without a transformation matrix", () => {
    const defs = vi.fn();
    registerProj4({ defs } as unknown as typeof proj4, [
      new TestSystem({ proj4transformationMatrix: "" }),
    ]);
    expect(defs).not.toHaveBeenCalled();
  });

  it("logs and rethrows when proj4 rejects a definition", () => {
    const failure = new Error("bad definition");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const defs = vi.fn(() => {
      throw failure;
    });
    expect(() => registerProj4({ defs } as unknown as typeof proj4, [LV95])).toThrow(failure);
    expect(error).toHaveBeenCalledWith(
      "Error while setting up projection in proj4",
      "EPSG:2056",
      failure,
    );
    error.mockRestore();
  });
});
