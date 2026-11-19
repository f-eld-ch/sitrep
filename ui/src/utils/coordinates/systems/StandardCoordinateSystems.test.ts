import proj4 from "proj4";
import { beforeAll, describe, expect, it } from "vitest";
import { registerProj4 } from "../register";
import { LV03, LV95, WEBMERCATOR, WGS84 } from ".";
import { PIXEL_LENGTH_IN_KM_AT_ZOOM_ZERO_WITH_256PX_TILES } from "./CoordinateSystem";

beforeAll(() => {
  registerProj4(proj4);
});

// Reference point: the old observatory of Bern, the origin of the Swiss grids. swisstopo's
// REFRAME gives LV95 2600000/1200000 = WGS84 46.951083 N, 7.438632 E and LV03 600000/200000.
const BERN_WGS84: [number, number] = [7.438632, 46.951083];

describe("WGS84CoordinateSystem", () => {
  it("is EPSG:4326, rounding to six decimals", () => {
    expect(WGS84.epsg).toBe("EPSG:4326");
    expect(WGS84.roundCoordinateValue(7.43863249)).toBe(7.438632);
    expect(WGS84.roundCoordinateValue(7.4386325)).toBe(7.438633);
  });

  it("uses the standard pyramid, with zoom 15.5 for the 1:25'000 map", () => {
    expect(WGS84.usesMercatorPyramid).toBe(true);
    expect(WGS84.get1_25000ZoomLevel()).toBe(15.5);
    expect(WGS84.getDefaultZoom()).toBe(15.5);
  });

  it("spans the whole world, centred on Switzerland", () => {
    expect(WGS84.bounds?.flatten).toEqual([-180, -90, 180, 90]);
    expect(WGS84.bounds?.center).toEqual([8.239436, 46.832259]);
    expect(WGS84.isInBounds(7.4, 46.9)).toBe(true);
    expect(WGS84.isInBounds(7.4, 91)).toBe(false);
  });

  describe("getResolutionForZoomAndCenter", () => {
    it("is the equatorial pixel size halved per zoom level at the equator", () => {
      // 2 * pi * 6371008.8 m (turf mean earth radius, not the 6378137 m WGS84 equatorial radius that
      // gives the 156543.03 of the OSM wiki) / 256 px
      expect(WGS84.getResolutionForZoomAndCenter(0, [0, 0])).toBe(156368.08);
      expect(WGS84.getResolutionForZoomAndCenter(1, [0, 0])).toBe(78184.04);
    });

    it("shrinks with the cosine of the latitude", () => {
      // 156368.08 * cos(60 deg) = 78184.04
      expect(WGS84.getResolutionForZoomAndCenter(0, [7, 60])).toBe(78184.04);
    });

    it("is 156368.08 * cos(46.95 deg) / 2^15 = 3.26 m/px at zoom 15 in Bern", () => {
      expect(WGS84.getResolutionForZoomAndCenter(15, BERN_WGS84)).toBeCloseTo(3.26, 2);
    });
  });

  describe("getZoomForResolutionAndCenter", () => {
    it.each([
      [0, 0],
      [5, 10],
      [15.5, 47],
    ])("is the inverse of the resolution at zoom %s and latitude %s", (zoom, lat) => {
      const resolution =
        (PIXEL_LENGTH_IN_KM_AT_ZOOM_ZERO_WITH_256PX_TILES * Math.cos((lat * Math.PI) / 180)) /
        2 ** zoom;
      expect(WGS84.getZoomForResolutionAndCenter(resolution, [7, lat])).toBeCloseTo(zoom, 8);
    });
  });

  describe("getExtentInOrderXY", () => {
    it("leaves an extent that already starts with the longitude alone", () => {
      expect(WGS84.getExtentInOrderXY([5.9, 45.8, 10.5, 47.8])).toEqual([5.9, 45.8, 10.5, 47.8]);
    });

    it("swaps an extent given as lat/lon", () => {
      expect(WGS84.getExtentInOrderXY([45.8, 5.9, 47.8, 10.5])).toEqual([5.9, 45.8, 10.5, 47.8]);
    });
  });

  it("has no standard resolution steps without bounds, but 21 with them", () => {
    const steps = WGS84.getResolutionSteps();
    expect(steps).toHaveLength(21);
    expect(steps[0]).toEqual({
      zoom: 0,
      resolution: PIXEL_LENGTH_IN_KM_AT_ZOOM_ZERO_WITH_256PX_TILES,
    });
    expect(steps[1].resolution).toBeCloseTo(steps[0].resolution / 2, 6);
  });
});

describe("WebMercatorCoordinateSystem", () => {
  it("is EPSG:3857, rounding to the centimetre", () => {
    expect(WEBMERCATOR.epsg).toBe("EPSG:3857");
    expect(WEBMERCATOR.roundCoordinateValue(917209.8749)).toBe(917209.87);
  });

  it("covers the web mercator world square, centred on Switzerland", () => {
    expect(WEBMERCATOR.bounds?.upperX).toBeCloseTo(20037508.34, 2);
    expect(WEBMERCATOR.bounds?.center).toEqual([917209.87, 5914737.43]);
    expect(WEBMERCATOR.get1_25000ZoomLevel()).toBe(15.5);
  });

  it("projects Bern to the known EPSG:3857 position", () => {
    // spherical mercator with R = 6378137: x = R * lon, y = R * ln(tan(pi/4 + lat/2))
    const mercatorY = 6378137 * Math.log(Math.tan(Math.PI / 4 + (BERN_WGS84[1] * Math.PI) / 360));
    const [x, y] = proj4(WGS84.epsg, WEBMERCATOR.epsg, BERN_WGS84);
    expect(x).toBeCloseTo(828064.6, 0);
    expect(y).toBeCloseTo(mercatorY, 2);
  });

  it("derives the resolution from the latitude of the centre", () => {
    const equator: [number, number] = [0, 0];
    expect(WEBMERCATOR.getResolutionForZoomAndCenter(0, equator)).toBe(156368.08);
    expect(WEBMERCATOR.getResolutionForZoomAndCenter(2, equator)).toBe(39092.02);
    const at60: [number, number] = proj4(WGS84.epsg, WEBMERCATOR.epsg, [7, 60]);
    expect(WEBMERCATOR.getResolutionForZoomAndCenter(0, at60)).toBe(78184.04);
  });

  it("gives the zoom back for a resolution at a given centre", () => {
    const center = proj4(WGS84.epsg, WEBMERCATOR.epsg, BERN_WGS84) as [number, number];
    const resolution = WEBMERCATOR.getResolutionForZoomAndCenter(12, center);
    // resolution is rounded to 2 decimals, so allow a small deviation
    expect(WEBMERCATOR.getZoomForResolutionAndCenter(resolution, center)).toBeCloseTo(12, 3);
  });
});

describe("projections between the systems", () => {
  it("converts the Bern reference point between LV95, LV03 and WGS84", () => {
    const wgs = proj4(LV95.epsg, WGS84.epsg, [2600000, 1200000]);
    expect(wgs[0]).toBeCloseTo(BERN_WGS84[0], 5);
    expect(wgs[1]).toBeCloseTo(BERN_WGS84[1], 5);

    const lv03 = proj4(LV95.epsg, LV03.epsg, [2600000, 1200000]);
    expect(lv03[0]).toBeCloseTo(600000, 0);
    expect(lv03[1]).toBeCloseTo(200000, 0);
  });

  it.each([
    [LV95, [2687892.56, 1191012.97]],
    [LV03, [687891.96, 191013.32]],
    [WEBMERCATOR, [917209.87, 5914737.43]],
  ] as const)("round-trips %s coordinates through WGS84", (system, coordinate) => {
    const wgs = proj4(system.epsg, WGS84.epsg, [...coordinate]);
    const back = proj4(WGS84.epsg, system.epsg, wgs);
    expect(back[0]).toBeCloseTo(coordinate[0], 2);
    expect(back[1]).toBeCloseTo(coordinate[1], 2);
  });

  it("expresses LV95 bounds in WGS84 around Switzerland", () => {
    const bounds = LV95.getBoundsAs(WGS84);
    expect(bounds?.flatten.map((v) => Math.round(v * 100) / 100)).toEqual([
      5.14, 45.4, 11.48, 48.23,
    ]);
  });
});
