import { describe, expect, it } from "vitest";
import { MapStyles } from "./StyleController";

describe("MapStyles vector tile sources", () => {
  it.each(MapStyles.map((s) => [s.name, s] as const))(
    "%s loads its vector tiles from the sitrep tile endpoint with absolute URLs",
    (_name, { style }) => {
      const vectorUrls = Object.values(style.sources)
        .filter((s) => s.type === "vector")
        .map((s) => ("url" in s ? s.url : undefined));

      expect(vectorUrls.length).toBeGreaterThan(0);

      for (const url of vectorUrls) {
        expect(url).toMatch(
          /^https?:\/\/[^/]+\/api\/v2\/tiles\/ch\.swisstopo\.(base|relief)\.vt\/v1\.0\.0\/tiles\.json$/,
        );
      }
    },
  );

  it("never points at swisstopo directly for vector tiles", () => {
    expect(JSON.stringify(MapStyles.map((s) => s.style.sources))).not.toContain(
      "vectortiles.geo.admin.ch",
    );
  });
});
