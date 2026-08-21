import { getLabel, isBabsIconId } from "@f-eld-ch/babs-core";
import { describe, expect, it } from "vitest";
import { EnrichLineStringMap } from "components/map/EnrichedLayerFeatures";
import { createMapStyle } from "views/map/styleGenerator";
import {
  byColor,
  ColorForCategory,
  Colors,
  LineTypes,
  type SelectableTypes,
  ZoneTypes,
} from "./lineAndZoneTypes";

/**
 * A line or zone type only exists if the style draws it. Adding one here without adding it
 * to a layer filter in styleGenerator produces a feature that is saved but invisible,
 * which no other test would catch.
 */

/** Collects the values every `["in", <prop>, …]` filter clause admits, across both modes. */
function styledValues(property: "lineType" | "zoneType"): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown, prefix: string) => {
    if (!Array.isArray(node)) return;
    const [op, key, ...values] = node as unknown[];
    if ((op === "in" || op === "!in") && key === `${prefix}${property}`) {
      // "!in" is an exclusion list, so its values are handled by some *other* layer —
      // naming a type there still means the style knows about it.
      for (const value of values) if (typeof value === "string") found.add(value);
    }
    for (const child of node) walk(child, prefix);
  };
  for (const forDraw of [true, false]) {
    const prefix = forDraw ? "user_" : "";
    for (const layer of createMapStyle({ forDraw })) {
      // `filter` is absent from some members of the LayerProps union (background, for one),
      // so it has to be read off a widened view rather than the union itself.
      walk((layer as { filter?: unknown }).filter, prefix);
    }
  }
  return found;
}

describe("LineTypes", () => {
  it("names only real catalogue icons as thumbnails", () => {
    const invalid = Object.values(LineTypes).filter((type) => !isBabsIconId(type.thumbnail));
    expect(invalid).toEqual([]);
  });

  it("uses its own key as the persisted name", () => {
    // The key is what the picker iterates and `name` is what gets stored, so a mismatch
    // would silently save the wrong lineType.
    const mismatched = Object.entries(LineTypes).filter(([key, type]) => key !== type.name);
    expect(mismatched).toEqual([]);
  });

  it("has a label in every catalogue language", () => {
    const missing = Object.values(LineTypes).flatMap((type) =>
      (["de", "fr", "it"] as const)
        .filter((lang) => !getLabel(type.thumbnail, lang))
        .map((lang) => `${type.name} (${lang})`),
    );
    expect(missing).toEqual([]);
  });

  it("is drawn by some layer in the generated style", () => {
    const styled = styledValues("lineType");
    const undrawn = Object.keys(LineTypes).filter((name) => !styled.has(name));
    expect(undrawn).toEqual([]);
  });

  it("gives the fire-spread lines the movement styling in red", () => {
    // Brandübergriffsgefahr mirrors Beabsichtigte Verschiebung, "erfolgt" mirrors
    // Durchgeführte Verschiebung — the whole point of the pair.
    expect(LineTypes.brandUebergriffGefahr.color).toBe(LineTypes.Rutschgebiet.color);
    expect(LineTypes.brandUebergriffGefahr.color).not.toBe(
      LineTypes.beabsichtigteVerschiebung.color,
    );
    expect(EnrichLineStringMap.brandUebergriffGefahr?.iconEnd).toContain("chevron-red");
    expect(EnrichLineStringMap.brandUebergriffErfolgt?.iconEnd).toContain("chevron-red");
  });

  it("marks Einsatz with the double chevron, distinguishing it from Verschiebung", () => {
    // Both used the single chevron before, which made them indistinguishable on the map.
    expect(EnrichLineStringMap.beabsichtigterEinsatz?.iconEnd).toContain("double-chevron");
    expect(EnrichLineStringMap.durchgeführterEinsatz?.iconEnd).toContain("double-chevron");
    expect(EnrichLineStringMap.beabsichtigteVerschiebung?.iconEnd).not.toContain("double-chevron");
    expect(EnrichLineStringMap.durchgeführteVerschiebung?.iconEnd).not.toContain("double-chevron");
  });
});

describe("byColor", () => {
  it("groups line types so each colour appears in one contiguous run", () => {
    const colors = byColor(LineTypes).map((type) => type.color);
    const runs = colors.filter((color, i) => color !== colors[i - 1]);
    expect(runs).toEqual([...new Set(runs)]);
  });

  it("puts red before blue, following BABS convention", () => {
    const colors = byColor(LineTypes).map((type) => type.color);
    expect(colors.indexOf(Colors.Red)).toBeLessThan(colors.indexOf(Colors.Blue));
  });

  it("keeps declaration order within a colour, so related pairs stay adjacent", () => {
    const names = byColor(LineTypes).map((type) => type.name);
    const adjacent = (a: string, b: string) => names.indexOf(b) - names.indexOf(a) === 1;
    expect(adjacent("beabsichtigteErkundung", "durchgeführteErkundung")).toBe(true);
    expect(adjacent("beabsichtigteVerschiebung", "durchgeführteVerschiebung")).toBe(true);
    expect(adjacent("beabsichtigterEinsatz", "durchgeführterEinsatz")).toBe(true);
    expect(adjacent("brandUebergriffGefahr", "brandUebergriffErfolgt")).toBe(true);
  });

  it("loses nothing", () => {
    expect(byColor(LineTypes)).toHaveLength(Object.keys(LineTypes).length);
    expect(byColor(ZoneTypes)).toHaveLength(Object.keys(ZoneTypes).length);
  });

  it("actually reorders an interleaved input, rather than passing by luck", () => {
    // LineTypes is currently written in colour order, so sorting it is a no-op and the
    // assertions above would hold even if byColor did nothing. This feeds it a
    // deliberately interleaved table to prove the sort is doing the work.
    const interleaved: SelectableTypes = {
      red1: { name: "red1", thumbnail: "1101", color: Colors.Red },
      blue1: { name: "blue1", thumbnail: "3101", color: Colors.Blue },
      red2: { name: "red2", thumbnail: "1102", color: Colors.Red },
      blue2: { name: "blue2", thumbnail: "3102", color: Colors.Blue },
    };
    expect(byColor(interleaved).map((t) => t.name)).toEqual(["red1", "red2", "blue1", "blue2"]);
  });

  it("sorts an unknown colour last rather than first", () => {
    const withUnknown: SelectableTypes = {
      mystery: { name: "mystery", thumbnail: "1101", color: "#123456" },
      red: { name: "red", thumbnail: "1102", color: Colors.Red },
    };
    expect(byColor(withUnknown).map((t) => t.name)).toEqual(["red", "mystery"]);
  });
});

describe("ZoneTypes", () => {
  it("names only real catalogue icons as thumbnails", () => {
    const invalid = Object.values(ZoneTypes).filter((type) => !isBabsIconId(type.thumbnail));
    expect(invalid).toEqual([]);
  });

  it("uses its own key as the persisted name", () => {
    const mismatched = Object.entries(ZoneTypes).filter(([key, type]) => key !== type.name);
    expect(mismatched).toEqual([]);
  });

  it("is drawn by some layer in the generated style", () => {
    const styled = styledValues("zoneType");
    const undrawn = Object.keys(ZoneTypes).filter((name) => !styled.has(name));
    expect(undrawn).toEqual([]);
  });
});

describe("ColorForCategory", () => {
  it("covers every category, including ones the picker hides", () => {
    // onClickIcon reads this by category number, so a gap would write `undefined` as the
    // feature colour.
    const uncovered = (["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const).filter(
      (category) => !ColorForCategory[category],
    );
    expect(uncovered).toEqual([]);
  });
});
