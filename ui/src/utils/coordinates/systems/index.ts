import type CoordinateSystem from "./CoordinateSystem";
import { STANDARD_ZOOM_LEVEL_1_25000_MAP, SWISS_ZOOM_LEVEL_1_25000_MAP } from "./CoordinateSystem";
import LV03CoordinateSystem from "./LV03CoordinateSystem";
import LV95CoordinateSystem from "./LV95CoordinateSystem";
import { LV95_RESOLUTIONS, SWISSTOPO_TILEGRID_RESOLUTIONS } from "./SwissCoordinateSystem";
import WebMercatorCoordinateSystem from "./WebMercatorCoordinateSystem";
import WGS84CoordinateSystem from "./WGS84CoordinateSystem";

export const round = (value: number, decimals = 0): number => {
  if (!isNumber(value)) {
    return Number.NaN;
  }
  if (decimals === 0) {
    return Math.round(value);
  }
  const pow = 10 ** decimals;
  return Math.round(value * pow) / pow;
};

export const closest = (value: number, fromList: number[]): number => {
  if (Array.isArray(fromList) && fromList.length > 2) {
    const difference = fromList.map((listValue) => Math.abs(value - listValue));
    const smallestDifference = difference.reduce((diff1, diff2) => (diff1 > diff2 ? diff2 : diff1));
    return fromList[difference.indexOf(smallestDifference)];
  }
  return value;
};

// biome-ignore lint/suspicious/noExplicitAny: this is the purpose of the function
const isNumber = (value: any): boolean => {
  return (
    value !== null &&
    value !== undefined &&
    !Number.isNaN(Number(value)) &&
    (typeof value !== "string" || value.length !== 0)
  );
};

export const LV95: LV95CoordinateSystem = new LV95CoordinateSystem();
export const LV03: LV03CoordinateSystem = new LV03CoordinateSystem();
export const WGS84: WGS84CoordinateSystem = new WGS84CoordinateSystem();
export const WEBMERCATOR: WebMercatorCoordinateSystem = new WebMercatorCoordinateSystem();

export const allCoordinateSystems: CoordinateSystem[] = [LV95, LV03, WGS84, WEBMERCATOR];
const crs = {
  LV95,
  LV03,
  WGS84,
  WEBMERCATOR,
  allCoordinateSystems,
};

const constants = {
  STANDARD_ZOOM_LEVEL_1_25000_MAP,
  SWISS_ZOOM_LEVEL_1_25000_MAP,
  LV95_RESOLUTIONS,
  SWISSTOPO_TILEGRID_RESOLUTIONS,
};

export { crs, type constants, type CoordinateSystem };
export default crs;
