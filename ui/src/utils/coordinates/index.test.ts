import proj4 from "proj4";
import { LV03, LV95, WEBMERCATOR, WGS84 } from "utils/coordinates/systems";
import { beforeAll } from "vitest";
import { coordinateFromString } from ".";
import { registerProj4 } from "./register";
import type CoordinateSystem from "./systems/CoordinateSystem";
import LV03CoordinateSystem from "./systems/LV03CoordinateSystem";
import LV95CoordinateSystem from "./systems/LV95CoordinateSystem";

const projections: CoordinateSystem[] = [WEBMERCATOR, LV03, LV95, WGS84];
beforeAll(() => {
  registerProj4(proj4);
});

it("should have a valid LV03 projection", () => {
  registerProj4(proj4, projections);
  const lv03 = new LV03CoordinateSystem();
  expect(lv03.epsg).toBe("EPSG:21781");
  expect(proj4.defs(lv03.epsg)).toBeDefined();
  expect(() => lv03.getBoundsAs(WEBMERCATOR)).not.toThrow();
  expect(() => lv03.getBoundsAs(WGS84)).not.toThrow();
  LV03.getBoundsAs(WGS84);
  const coords = proj4(lv03.epsg, WGS84.epsg, [684_999.36, 190_750.26]);
  expect(coords[0]).toBeCloseTo(8.553402, 3);
  expect(coords[1]).toBeCloseTo(46.86245, 3);
});

it("should have a valid LV95 projection", () => {
  registerProj4(proj4, projections);
  const lv95 = new LV95CoordinateSystem();
  expect(lv95.epsg).toBe("EPSG:2056");
  proj4.defs(lv95.epsg, lv95.proj4transformationMatrix); // to ensure registration
  LV95.getBoundsAs(WGS84);

  const coords = proj4(lv95.epsg, WGS84.epsg, [2_685_000.0, 1_190_750.0]);
  expect(coords[0]).toBeCloseTo(8.553402, 3);
  expect(coords[1]).toBeCloseTo(46.86245, 3);
});

it("should register proj4 projections without errors", () => {
  expect(() => registerProj4(proj4, projections)).not.toThrow();
  expect(proj4.defs("EPSG:21781")).toBeDefined();
  expect(proj4.defs("EPSG:2056")).toBeDefined();
  expect(proj4.defs("EPSG:3857")).toBeDefined(); // WebMercator still defined after registering
  expect(proj4.defs("EPSG:4326")).toBeDefined(); // WGS84 still defined after registering
});

it("should properly return LV03 coordinates from string", () => {
  expect(() => registerProj4(proj4, projections)).not.toThrow();
  const lv03String = "687891.96, 191013.32";
  const result = coordinateFromString(lv03String);
  expect(result).toBeDefined();
  expect(result?.coordinateSystem).toBe(LV03);
  expect(result?.coordinate[0]).toBeCloseTo(687891.96, 3);
  expect(result?.coordinate[1]).toBeCloseTo(191013.32, 3);
});

it("should properly return LV95 coordinates from string", () => {
  expect(() => registerProj4(proj4, projections)).not.toThrow();
  const lv95String = "2'687'892.56, 1'191'012.97";
  const result = coordinateFromString(lv95String);
  expect(result).toBeDefined();
  expect(result?.coordinateSystem).toBe(LV95);
  expect(result?.coordinate[0]).toBeCloseTo(2687892.56, 3);
  expect(result?.coordinate[1]).toBeCloseTo(1191012.97, 3);
});
