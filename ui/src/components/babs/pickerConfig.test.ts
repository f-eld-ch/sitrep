import { getGroup, isBabsIconId, listCategories, listIcons } from "@f-eld-ch/babs-core";
import { describe, expect, it } from "vitest";
import { isPickableCategory, isPickableIcon } from "./excludedIcons";
import { LineTypes } from "./lineAndZoneTypes";
import { CATEGORY_DRILL_DOWN, CATEGORY_ICON, PICKER_ICON_SIZE } from "./pickerConfig";

/**
 * The picker fails quietly when this config is wrong: `<BabsIcon>` renders its `fallback`
 * for an unknown id, so a bad entry shows an empty button rather than throwing.
 */

describe("CATEGORY_ICON", () => {
  it("covers every catalogue category", () => {
    const missing = listCategories()
      .map((c) => c.number)
      .filter((number) => CATEGORY_ICON[number] === undefined);
    expect(missing).toEqual([]);
  });

  it("names only real catalogue icons", () => {
    const invalid = Object.entries(CATEGORY_ICON).filter(([, id]) => !isBabsIconId(id));
    expect(invalid).toEqual([]);
  });

  it("uses an icon that belongs to the category it represents", () => {
    // A representative from a different category would still render, just confusingly.
    const mismatched = Object.entries(CATEGORY_ICON).filter(
      ([category, id]) => !listIcons({ category: category as never }).some((m) => m.id === id),
    );
    expect(mismatched).toEqual([]);
  });

  it("never points at an icon hidden by the exclusion list", () => {
    const excluded = Object.entries(CATEGORY_ICON).filter(([, id]) => !isPickableIcon(id));
    expect(excluded).toEqual([]);
  });
});

describe("CATEGORY_DRILL_DOWN", () => {
  const entries = Object.entries(CATEGORY_DRILL_DOWN);

  it("only lists categories that actually have several groups to choose between", () => {
    const byNumber = new Map(listCategories().map((c) => [c.number, c]));
    const pointless = entries.filter(
      ([category]) => (byNumber.get(category as never)?.groups.length ?? 0) < 2,
    );
    expect(pointless).toEqual([]);
  });

  it("names only real selector icons and real target groups", () => {
    const invalid = entries.flatMap(([category, list]) =>
      (list ?? [])
        .filter((e) => !isBabsIconId(e.selector) || listIcons({ group: e.group }).length === 0)
        .map((e) => `${category}: ${e.selector} -> ${e.group}`),
    );
    expect(invalid).toEqual([]);
  });

  it("opens a distinct group per selector, so no selection is unreachable", () => {
    for (const [, list] of entries) {
      const groups = (list ?? []).map((e) => e.group);
      expect(new Set(groups).size).toBe(groups.length);
      const selectors = (list ?? []).map((e) => e.selector);
      expect(new Set(selectors).size).toBe(selectors.length);
    }
  });

  it("leaves every icon in a drill-down category reachable", () => {
    // The selector level replaces the flat list, so any group it does not open becomes
    // invisible in the picker. This is what makes the group-48 entry load-bearing:
    // without it, the eight partner-less ranks would silently disappear.
    //
    // Icons hidden on purpose via EXCLUDED_BABS_ICON_IDS are not orphans, so dropping a
    // selector *and* excluding its group is a legitimate way to hide one.
    for (const [category, list] of entries) {
      const reachable = new Set(
        (list ?? []).flatMap((e) => [
          e.selector,
          ...listIcons({ group: e.group }).map((m) => m.id),
        ]),
      );
      const orphaned = listIcons({ category: category as never })
        .filter((meta) => isPickableIcon(meta.id))
        .map((meta) => meta.id)
        .filter((id) => !reachable.has(id));
      expect(orphaned).toEqual([]);
    }
  });

  it("maps the Formationen partner symbols onto their hierarchy groups", () => {
    // 4701 P -> 41 Polizei ... 4706 A -> 46 Armee. Regression guard for the mapping the
    // picker is built around.
    const formationen = CATEGORY_DRILL_DOWN["4"] ?? [];
    const partners = formationen
      .filter((e) => e.selector.startsWith("47"))
      .map((e) => [e.selector, e.group] as const);
    expect(partners).toEqual([
      ["4701", "41"],
      ["4702", "42"],
      ["4703", "43"],
      ["4704", "44"],
      ["4705", "45"],
      ["4706", "46"],
    ]);
    // Each selector's label should identify the partner it opens.
    expect(getGroup("41").labels.de).toBe("Polizei");
    expect(getGroup("46").labels.de).toBe("Armee");
  });
});

describe("EXCLUDED_CATEGORIES", () => {
  it("hides Bewegungen, which the line controller owns", () => {
    // Category 6 describes how a line is drawn, not a point symbol. Its icons are the
    // line controller's thumbnails, and choosing one there sets a `lineType` that the
    // style turns into the right pattern and end marker.
    expect(isPickableCategory("6")).toBe(false);
  });

  it("leaves every other category available", () => {
    const hidden = listCategories()
      .map((c) => c.number)
      .filter((number) => !isPickableCategory(number));
    expect(hidden).toEqual(["6"]);
  });

  it("keeps each hidden category's icons reachable through the line controller", () => {
    // Excluding a category removes it from the picker, so anything still needed must be
    // offered elsewhere. Every 61xx icon is either a line-type thumbnail or one of the
    // movements deliberately not offered (6104, 6105, 6107, 6108).
    const offered = new Set(Object.values(LineTypes).map((type) => type.thumbnail));
    const notOffered = ["6104", "6105", "6107", "6108"];
    const stranded = listIcons({ category: "6" })
      .map((meta) => meta.id)
      .filter((id) => !offered.has(id) && !notOffered.includes(id));
    expect(stranded).toEqual([]);
  });
});

describe("PICKER_ICON_SIZE", () => {
  it("fits inside the 35px button", () => {
    // Deliberately a loose bound. The exact padding lives in BabsIconController.scss,
    // which this test cannot read, so asserting a precise fit would just couple two files
    // that can't see each other and break on any harmless tweak. This catches the cases
    // that actually matter: zero, negative, or wider than the button.
    expect(PICKER_ICON_SIZE).toBeGreaterThan(0);
    expect(PICKER_ICON_SIZE).toBeLessThanOrEqual(35);
  });
});
