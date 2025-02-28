import { CHtoWGS, WGStoCH } from "./utils_conversion";

describe("Coordinate Conversion Tests", () => {
  test("Convert WGS to CH and back to WGS", () => {
    const lat = 46.95108; // Example latitude
    const lng = 7.43864; // Example longitude

    // Convert WGS to CH
    const [chY, chX] = WGStoCH(lat, lng);

    // Convert CH back to WGS
    const [convertedLng, convertedLat] = CHtoWGS(chY, chX);

    // Check if the converted coordinates are close to the original
    expect(convertedLat).toBeCloseTo(lat, 5);
    expect(convertedLng).toBeCloseTo(lng, 5);
  });

  test("Convert CH to WGS and back to CH", () => {
    const chY = 600000; // Example CH y coordinate
    const chX = 200000; // Example CH x coordinate

    // Convert CH to WGS
    const [lng, lat] = CHtoWGS(chY, chX);

    // Convert WGS back to CH
    const [convertedChY, convertedChX] = WGStoCH(lat, lng);

    // Check if the converted coordinates are close to the original
    expect(convertedChY).toBeCloseTo(chY, 0);
    expect(convertedChX).toBeCloseTo(chX, 0);
  });
});
