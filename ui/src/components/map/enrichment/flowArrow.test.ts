import type { Position } from "geojson";
import { describe, expect, it } from "vitest";
import { ARROW } from "./arrow";
import { enrichFeature, selectionFill } from "./enrichFeature";
import { buildFlowArrow, defaultFlowAt } from "./flowArrow";
import { SMOOTHED_ZONE_NAMES } from "./registry";

const A: Position = [8.0, 47.0];
const B: Position = [8.1, 47.0];
const C: Position = [8.1, 47.1];
const D: Position = [8.0, 47.1];
const square: Position[] = [A, B, C, D, A];

describe("the position of the flow arrow", () => {
  const config = { icon: ARROW.fireSpread, color: "#ff0000", lengthRatio: 0.12 };
  const tailOf = (at?: number, smooth = false) => {
    const shaft = buildFlowArrow("z", "flow", square, config, undefined, smooth, at).find((f) =>
      String(f.id).endsWith(":flow"),
    );
    return (shaft!.geometry as { coordinates: Position[] }).coordinates[0];
  };

  it("is the middle of the closing edge when none is given", () => {
    // closing edge D→A is the west side of the square
    expect(tailOf()[0]).toBeCloseTo(8.0, 4);
    expect(tailOf()[1]).toBeCloseTo(47.05, 3);
  });

  it("names that default as a fraction of the outline from the first vertex", () => {
    // three sides of four, then half the fourth: 3.5 / 4 of the outline (the sides differ in length)
    const at = defaultFlowAt(square)!;
    expect(at).toBeGreaterThan(0.8);
    expect(at).toBeLessThan(1);
    const [x, y] = tailOf(at);
    expect(x).toBeCloseTo(tailOf()[0], 4);
    expect(y).toBeCloseTo(tailOf()[1], 4);
  });

  it("moves round the outline with the position, from the first vertex", () => {
    expect(tailOf(0)[0]).toBeCloseTo(8.0, 4);
    expect(tailOf(0)[1]).toBeCloseTo(47.0, 4);
    // somewhere on the south side, going east from A
    const [x, y] = tailOf(0.15);
    expect(y).toBeCloseTo(47.0, 4);
    expect(x).toBeGreaterThan(8.0);
    expect(x).toBeLessThan(8.1);
  });

  it("goes once round and wraps", () => {
    expect(tailOf(1.15)[0]).toBeCloseTo(tailOf(0.15)[0], 5);
    expect(tailOf(-0.85)[0]).toBeCloseTo(tailOf(0.15)[0], 5);
  });

  it("follows the curve when the outline is drawn as one", () => {
    const [x, y] = tailOf(0.15, true);
    // on the smoothed outline, which bulges below the south side
    expect(y).toBeLessThan(47.0 + 1e-9);
    expect(x).toBeGreaterThan(8.0);
  });

  it("falls back to the default for a value that is not a number", () => {
    expect(tailOf(Number.NaN)[1]).toBeCloseTo(tailOf()[1], 6);
  });

  it("has no default for a ring that encloses nothing", () => {
    expect(defaultFlowAt([A, B, A])).toBeUndefined();
  });
});

describe("a flooded area drawn as a curve", () => {
  const zone = {
    type: "Feature" as const,
    id: "z",
    geometry: { type: "Polygon" as const, coordinates: [square] },
    properties: { zoneType: "UeberschwemmtesGebiet", deletedAt: null, color: "#ff0000" },
  };
  const parts = () => {
    const features = enrichFeature(zone);
    const lines = features.filter((f) => f.geometry.type === "LineString");
    const coordinates = (f: (typeof features)[number] | undefined): Position[] =>
      f ? (f.geometry as { coordinates: Position[] }).coordinates : [];

    return {
      outline: coordinates(lines.find((f) => String(f.id).includes(":outline"))),
      edge: coordinates(lines.find((f) => String(f.id).endsWith("-edge"))),
      shaft: coordinates(
        lines.find((f) => !String(f.id).includes(":outline") && !String(f.id).endsWith("-edge")),
      ),
    };
  };

  it("emits a closed outline through every vertex, with many more points than the zone has", () => {
    const { outline } = parts();
    expect(outline.length).toBeGreaterThan(20);
    expect(outline[0]).toEqual(outline[outline.length - 1]);
    [A, B, C, D].forEach((vertex) => expect(outline).toContainEqual(vertex));
  });

  it("emphasises a fifth of the smoothed outline, centred on the arrow, not a straight line", () => {
    const { outline, edge, shaft } = parts();
    const lengthOf = (pts: Position[]) =>
      pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    expect(lengthOf(edge) / lengthOf(outline)).toBeCloseTo(0.2, 1);
    // it is the curve: more than the two ends, and every point of it on the outline
    expect(edge.length).toBeGreaterThan(5);
    for (const p of edge) {
      const nearest = Math.min(...outline.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
      expect(nearest).toBeLessThan(0.01);
    }
    // the arrow springs from its middle
    const middle = edge[Math.floor(edge.length / 2)];
    expect(Math.hypot(middle[0] - shaft[0][0], middle[1] - shaft[0][1])).toBeLessThan(0.06);
  });

  it("springs the arrow from the curve itself", () => {
    const { outline, shaft } = parts();
    const [tail] = shaft;
    const nearest = Math.min(...outline.map((p) => Math.hypot(p[0] - tail[0], p[1] - tail[1])));
    // within one sample step of the outline
    expect(nearest).toBeLessThan(0.01);
  });

  it("leaves the outline to the map style no longer, and the straight edges are gone with it", () => {
    expect(SMOOTHED_ZONE_NAMES).toEqual(["UeberschwemmtesGebiet"]);
  });

  it("does not round a zone that is not configured for it", () => {
    const other = { ...zone, properties: { ...zone.properties, zoneType: "Einsatzraum" } };
    expect(enrichFeature(other).some((f) => String(f.id).includes(":outline"))).toBe(false);
  });
});

describe("the wash of a selected flooded area", () => {
  const zone = {
    type: "Feature" as const,
    id: "z",
    geometry: { type: "Polygon" as const, coordinates: [square] },
    properties: { zoneType: "UeberschwemmtesGebiet", deletedAt: null },
  };

  it("has the shape of the curve, closed, through every vertex", () => {
    const wash = selectionFill(zone);
    expect(wash?.geometry.type).toBe("Polygon");
    const ring = (wash!.geometry as { coordinates: Position[][] }).coordinates[0];
    expect(ring.length).toBeGreaterThan(20);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    [A, B, C, D].forEach((vertex) => expect(ring).toContainEqual(vertex));
  });

  it("covers every part of a multipart zone", () => {
    const wash = selectionFill({
      ...zone,
      geometry: { type: "MultiPolygon", coordinates: [[square], [square]] },
    });
    expect(wash?.geometry.type).toBe("MultiPolygon");
  });

  it("is only there for zones drawn as a curve", () => {
    expect(selectionFill({ ...zone, properties: { zoneType: "Einsatzraum" } })).toBeUndefined();
    expect(
      selectionFill({ ...zone, geometry: { type: "Point", coordinates: [8, 47] } }),
    ).toBeUndefined();
  });
});
