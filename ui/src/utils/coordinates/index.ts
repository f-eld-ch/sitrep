import proj4 from "proj4";
import {
  extractLV03Coordinates,
  extractLV95Coordinates,
  extractMetricMercatorCoordinates,
  extractWGS84Coordinates,
} from "utils/coordinates/coordinates";
import { LV03, LV95, WEBMERCATOR, WGS84 } from "utils/coordinates/systems";
import { registerProj4 } from "./register";

/**
 * This is extracted from https://github.com/geoadmin/web-mapviewer/blob/develop/packages/mapviewer/src/utils/coordinates/coordinateExtractors.js#L322
 * Extracts (if possible) a set of coordinates from the text as an array. The text must contain only
 * coordinates and nothing else, otherwise undefined will be returned.
 *
 * E.G. `'47.1, 7.5'` is valid and will return `[47.1, 7.5]` but `'lat:47.1, lon:7.5'` will fail and
 * return `undefined`.
 *
 * **Separators**
 *
 * To separate the two numerical values, a combination of slashes, spaces (tabs included) or a coma
 * can be used.
 *
 * **Accepted formats**
 *
 * CH1903+ / LV95 :
 *
 * - With or without thousands separator (`2'600'000 1'200'000` or `2600000 1200000`)
 *
 * CH1903 / LV03 :
 *
 * - With or without thousands separator (`600'000 200'000` or `600000 200000`)
 *
 * WGS84:
 *
 * - Numerical (`46.97984 6.60757`)
 * - DegreesMinutes (`46°58.7904' 6°36.4542'`)
 * - DegreesMinutesSeconds, double single quote for seconds (`46°58'47.424'' 6°36'27.252''`)
 * - DegreesMinutesSeconds, double quote for seconds (`46°58'47.424" 6°36'27.252"`)
 * - Google style is also supported (any format above without degrees, minutes and seconds symbol)
 *
 *
 * @param {String} text The text in which we want to find coordinates
 * @returns {ExtractedCoordinate | undefined} Coordinates in the given order in text with
 *   information about which projection they are expressed in, or `undefined` if nothing was found
 */

type ExtractedCoordinate = {
  coordinateSystem: typeof LV03 | typeof LV95 | typeof WEBMERCATOR | typeof WGS84;
  coordinate: SingleCoordinate;
};

export const coordinateFromString = (text: string): ExtractedCoordinate | undefined => {
  if (typeof text !== "string") {
    return undefined;
  }

  const wgs84Result = extractWGS84Coordinates(text);
  if (wgs84Result) {
    return {
      coordinateSystem: WGS84,
      coordinate: wgs84Result,
    };
  }
  const lv95Result = extractLV95Coordinates(text);
  if (lv95Result) {
    return {
      coordinateSystem: LV95,
      coordinate: lv95Result,
    };
  }

  const lv03Result = extractLV03Coordinates(text);
  if (lv03Result) {
    return {
      coordinateSystem: LV03,
      coordinate: lv03Result,
    };
  }
  const mercatorResult = extractMetricMercatorCoordinates(text);
  if (mercatorResult) {
    return {
      coordinateSystem: WEBMERCATOR,
      coordinate: mercatorResult,
    };
  }
  return undefined;
};

// registering local instance of proj4
registerProj4(proj4);

export type SingleCoordinate = [number, number];

export default coordinateFromString;
