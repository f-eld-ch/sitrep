import { describe, expect, it } from "vitest";
import CoordinateSystemBounds from "./CoordinateSystemBounds";

const bounds = new CoordinateSystemBounds({ lowerX: 0, upperX: 10, lowerY: 0, upperY: 20 });

describe("CoordinateSystemBounds", () => {
  it("derives its corners, centre and flat form from the limits", () => {
    expect(bounds.bottomLeft).toEqual([0, 0]);
    expect(bounds.bottomRight).toEqual([10, 0]);
    expect(bounds.topLeft).toEqual([0, 20]);
    expect(bounds.topRight).toEqual([10, 20]);
    expect(bounds.center).toEqual([5, 10]);
    expect(bounds.flatten).toEqual([0, 0, 10, 20]);
  });

  it("prefers a custom centre over the natural one", () => {
    const custom = new CoordinateSystemBounds({
      lowerX: 0,
      upperX: 10,
      lowerY: 0,
      upperY: 20,
      customCenter: [1, 2],
    });
    expect(custom.center).toEqual([1, 2]);
    expect(custom.customCenter).toEqual([1, 2]);
  });

  it.each([
    ["inside", 5, 5, true],
    ["on the lower corner", 0, 0, true],
    ["on the upper corner", 10, 20, true],
    ["left of it", -0.1, 5, false],
    ["right of it", 10.1, 5, false],
    ["below it", 5, -0.1, false],
    ["above it", 5, 20.1, false],
  ])("isInBounds: %s", (_name, x, y, expected) => {
    expect(bounds.isInBounds(x, y)).toBe(expected);
  });

  describe("splitIfOutOfBounds", () => {
    it.each([
      ["not an array", undefined],
      ["an empty list", []],
      ["a single point", [[1, 1]]],
    ])("returns null for %s", (_name, input) => {
      expect(bounds.splitIfOutOfBounds(input as unknown as [number, number][])).toBeNull();
    });

    it("returns null when a coordinate is malformed", () => {
      expect(bounds.splitIfOutOfBounds([[1, 1], [2]] as unknown as [number, number][])).toBeNull();
    });

    it("keeps coordinates that are all inside as one chunk", () => {
      const line: [number, number][] = [
        [1, 1],
        [5, 5],
        [9, 19],
      ];
      expect(bounds.splitIfOutOfBounds(line)).toEqual([
        { coordinates: line, isWithinBounds: true },
      ]);
    });

    it("splits a line leaving the bounds at the edge", () => {
      expect(
        bounds.splitIfOutOfBounds([
          [5, 5],
          [15, 5],
        ]),
      ).toEqual([
        {
          coordinates: [
            [5, 5],
            [10, 5],
          ],
          isWithinBounds: true,
        },
        {
          coordinates: [
            [10, 5],
            [15, 5],
          ],
          isWithinBounds: false,
        },
      ]);
    });

    it("splits a line entering the bounds, keeping the order of travel", () => {
      const chunks = bounds.splitIfOutOfBounds([
        [-5, 5],
        [5, 5],
      ]);
      expect(chunks?.map((c) => c.isWithinBounds)).toEqual([false, true]);
      expect(chunks?.[0].coordinates).toEqual([
        [-5, 5],
        [0, 5],
      ]);
      expect(chunks?.[1].coordinates).toEqual([
        [0, 5],
        [5, 5],
      ]);
    });

    it("splits a line crossing the bounds into outside, inside, outside", () => {
      const chunks = bounds.splitIfOutOfBounds([
        [-5, 5],
        [15, 5],
      ]);
      expect(chunks?.map((c) => c.isWithinBounds)).toEqual([false, true, false]);
      expect(chunks?.[1].coordinates).toEqual([
        [0, 5],
        [10, 5],
      ]);
    });
  });
});
