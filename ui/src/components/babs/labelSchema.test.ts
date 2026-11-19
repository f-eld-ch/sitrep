import { describe, expect, it } from "vitest";
import {
  ANNOTATED_CATEGORIES,
  fieldsFor,
  rotationAllowed,
  unsupportedLabelKeys,
} from "./labelSchema";

const keys = (fields: readonly { key: string }[]) => fields.map((f) => f.key);

describe("fieldsFor", () => {
  it.each(["4", "7"] as const)("offers three label positions for category %s", (category) => {
    expect(keys(fieldsFor(category))).toEqual(["nameLeft", "name", "nameRight"]);
  });

  it("asks for a count on casualty icons", () => {
    const fields = fieldsFor("1", "1301");

    expect(keys(fields)).toEqual(["name"]);
    expect(fields[0].placeholderKey).toBe("mapview.labels.anzahlPersonen");
  });

  it.each([
    ["no category", undefined, undefined],
    ["a plain category", "1", "1101"],
  ] as const)("falls back to a single description for %s", (_, category, iconId) => {
    const fields = fieldsFor(category, iconId);

    expect(keys(fields)).toEqual(["name"]);
    expect(fields[0].placeholderKey).toBe("mapview.labels.beschreibung");
  });
});

describe("ANNOTATED_CATEGORIES", () => {
  it("lists the formation and vehicle categories", () => {
    expect([...ANNOTATED_CATEGORIES].sort()).toEqual(["4", "7"]);
  });
});

describe("rotationAllowed", () => {
  it.each([
    ["formations", "4", undefined, undefined, false],
    ["vehicles", "7", undefined, undefined, false],
    ["casualty icon ids", "1", "1301", undefined, false],
    ["casualty aliases", "1", undefined, "babsVerletzte", false],
    ["legacy casualty names", "1", undefined, "Tote", false],
    ["UN symbols", "2", undefined, "un:fire", false],
    ["other icons", "1", "1101", "babsBeschaedigung", true],
    ["an unknown icon", undefined, undefined, undefined, true],
  ] as const)("for %s: %s", (_, category, iconId, iconValue, expected) => {
    expect(rotationAllowed(category, iconId, iconValue)).toBe(expected);
  });
});

describe("unsupportedLabelKeys", () => {
  it.each([
    ["a formation", "4", undefined, []],
    ["a casualty icon", "1", "1301", ["nameLeft", "nameRight"]],
    ["a plain icon", "1", "1101", ["nameLeft", "nameRight"]],
  ] as const)("lists what %s cannot show", (_, category, iconId, expected) => {
    expect(unsupportedLabelKeys(category, iconId)).toEqual(expected);
  });
});
