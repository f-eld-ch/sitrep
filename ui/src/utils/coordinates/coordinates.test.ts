import proj4 from "proj4";
import { describe, expect, it } from "vitest";
import {
  extractLV03Coordinates,
  extractLV95Coordinates,
  extractMetricMercatorCoordinates,
  extractWGS84Coordinates,
  numericalExtractor,
} from "./coordinates";
import { registerProj4 } from "./register";
import { coordinateFromString } from ".";
import { LV03, LV95, WEBMERCATOR, WGS84 } from "./systems";

registerProj4(proj4);

// 46.97984 N, 6.60757 E written in the formats the extractor accepts (decimal degrees,
// degrees + decimal minutes, degrees + minutes + seconds). The expected value is [lon, lat].
const NEUCHATEL: [number, number] = [6.60757, 46.97984];

describe("extractWGS84Coordinates", () => {
  it.each([
    ["decimal degrees, lat first", "46.97984 6.60757"],
    ["decimal degrees with comma", "46.97984, 6.60757"],
    ["decimal degrees with slash", "46.97984/6.60757"],
    ["decimal degrees with tab", "46.97984\t6.60757"],
    ["decimal degrees with degree sign", "46.97984° 6.60757°"],
    ["lon first is swapped to lon/lat", "6.60757 46.97984"],
    ["surrounding whitespace is trimmed", "  46.97984 6.60757  "],
    ["trailing cardinals", "46.97984N 6.60757E"],
    ["trailing cardinals with degree signs", "46.97984°N 6.60757°E"],
    ["trailing cardinals, lon first", "6.60757E 46.97984N"],
    ["lower case cardinals", "46.97984n 6.60757e"],
    ["prefixed cardinals", "N46.97984 E6.60757"],
    ["prefixed cardinals, lon first", "E6.60757 N46.97984"],
    ["degrees and minutes", "46°58.7904' 6°36.4542'"],
    ["degrees and minutes with cardinals", "46°58.7904'N 6°36.4542'E"],
    ["degrees and minutes, google style", "46 58.7904 6 36.4542"],
    ["degrees and minutes, prefixed cardinals", "N46°58.7904' E6°36.4542'"],
    ["degrees, minutes and seconds with double quote", `46°58'47.424" 6°36'27.252"`],
    ["degrees, minutes and seconds with two single quotes", "46°58'47.424'' 6°36'27.252''"],
    ["degrees, minutes and seconds with cardinals", `46°58'47.424"N 6°36'27.252"E`],
    ["degrees, minutes and seconds, google style", "46 58 47.424 6 36 27.252"],
    ["degrees, minutes and seconds, prefixed cardinals", `N46°58'47.424" E6°36'27.252"`],
  ])("parses %s", (_name, text) => {
    const result = extractWGS84Coordinates(text);
    expect(result).toBeDefined();
    expect(result?.[0]).toBeCloseTo(NEUCHATEL[0], 5);
    expect(result?.[1]).toBeCloseTo(NEUCHATEL[1], 5);
  });

  it("rounds to six decimals, the precision of WGS84", () => {
    expect(extractWGS84Coordinates("46.12345678 6.12345678")).toEqual([6.123457, 46.123457]);
  });

  it("lets a cardinal on either value decide which one is the longitude", () => {
    expect(extractWGS84Coordinates("6.5E 46.5N")).toEqual([6.5, 46.5]);
    expect(extractWGS84Coordinates("46.5N 6.5E")).toEqual([6.5, 46.5]);
  });

  it("negates southern and western values, which then fall outside Switzerland", () => {
    expect(extractWGS84Coordinates("46.5S 6.5E")).toBeUndefined();
    expect(extractWGS84Coordinates("46.5N 6.5W")).toBeUndefined();
    expect(extractWGS84Coordinates("6.5W 46.5N")).toBeUndefined();
    expect(extractWGS84Coordinates("6.5E 46.5S")).toBeUndefined();
  });

  it.each([
    ["empty string", ""],
    ["words", "hello world"],
    ["a single number", "46.97984"],
    ["labels around the numbers", "lat: 46.97984, lon: 6.60757"],
    ["a zero value", "0 6.60757"],
    ["outside the Swiss extent", "10 10"],
    ["Null Island", "0 0"],
    ["metric coordinates", "2600000 1200000"],
  ])("rejects %s", (_name, text) => {
    expect(extractWGS84Coordinates(text)).toBeUndefined();
  });
});

describe("extractLV95Coordinates", () => {
  it.each([
    ["plain", "2600000 1200000", [2600000, 1200000]],
    ["comma separated", "2600000, 1200000", [2600000, 1200000]],
    ["slash separated", "2600000/1200000", [2600000, 1200000]],
    ["apostrophe thousand separators", "2'687'892.56, 1'191'012.97", [2687892.56, 1191012.97]],
    ["typographic apostrophes", "2’687’892.56 1’191’012.97", [2687892.56, 1191012.97]],
    ["swapped (north first)", "1200000 2600000", [2600000, 1200000]],
    ["rounded to centimetres", "2600000.126 1200000.004", [2600000.13, 1200000]],
  ] as const)("parses %s", (_name, text, expected) => {
    expect(extractLV95Coordinates(text)).toEqual(expected);
  });

  it.each([
    ["empty", ""],
    ["words", "foo bar"],
    ["outside the extent", "2000000 1200000"],
    ["LV03 values", "600000 200000"],
    ["a single number", "2600000"],
  ])("rejects %s", (_name, text) => {
    expect(extractLV95Coordinates(text)).toBeUndefined();
  });
});

describe("extractLV03Coordinates", () => {
  it.each([
    ["plain", "600000 200000", [600000, 200000]],
    ["thousand separators", "600'000, 200'000", [600000, 200000]],
    ["swapped (north first)", "200000 600000", [600000, 200000]],
    ["rounded to centimetres", "687891.964 191013.321", [687891.96, 191013.32]],
  ] as const)("parses %s", (_name, text, expected) => {
    expect(extractLV03Coordinates(text)).toEqual(expected);
  });

  it.each([
    ["empty", ""],
    ["outside the extent", "100 100"],
    ["LV95 values", "2600000 1200000"],
  ])("rejects %s", (_name, text) => {
    expect(extractLV03Coordinates(text)).toBeUndefined();
  });
});

describe("extractMetricMercatorCoordinates", () => {
  // centre of the LV95 extent in EPSG:3857, as noted in WebMercatorCoordinateSystem (epsg.io)
  it.each([
    ["plain", "917209.87 5914737.43", [917209.87, 5914737.43]],
    ["swapped", "5914737.43 917209.87", [917209.87, 5914737.43]],
    ["thousand separators", "917'209.87, 5'914'737.43", [917209.87, 5914737.43]],
  ] as const)("parses %s", (_name, text, expected) => {
    expect(extractMetricMercatorCoordinates(text)).toEqual(expected);
  });

  it.each([
    ["empty", ""],
    ["outside Switzerland", "0 0"],
    ["words", "x y"],
  ])("rejects %s", (_name, text) => {
    expect(extractMetricMercatorCoordinates(text)).toBeUndefined();
  });
});

describe("numericalExtractor", () => {
  it("has nothing to extract without a match", () => {
    expect(numericalExtractor(null)).toBeUndefined();
  });

  it("strips every kind of thousand separator", () => {
    const match = /^(?<coord1>.+) (?<coord2>.+)$/.exec("2'600`000 1’200´000");
    expect(numericalExtractor(match)).toEqual([2600000, 1200000]);
  });

  it("gives up on values that are not numbers", () => {
    const match = /^(?<coord1>.+) (?<coord2>.+)$/.exec("abc 1");
    expect(numericalExtractor(match)).toBeUndefined();
  });
});

describe("coordinateFromString", () => {
  it.each([
    ["WGS84", "46.97984 6.60757", WGS84, [6.60757, 46.97984]],
    ["LV95", "2'600'000 1'200'000", LV95, [2600000, 1200000]],
    ["LV03", "600000 200000", LV03, [600000, 200000]],
    ["WebMercator", "917209.87 5914737.43", WEBMERCATOR, [917209.87, 5914737.43]],
  ] as const)("recognises %s and names the system", (_name, text, system, coordinate) => {
    const result = coordinateFromString(text);
    expect(result?.coordinateSystem).toBe(system);
    expect(result?.coordinate).toEqual(coordinate);
  });

  it("returns nothing for text that is not a coordinate", () => {
    expect(coordinateFromString("Bern")).toBeUndefined();
  });

  it("returns nothing for input that is not a string", () => {
    expect(coordinateFromString(undefined as unknown as string)).toBeUndefined();
    expect(coordinateFromString(42 as unknown as string)).toBeUndefined();
  });
});
