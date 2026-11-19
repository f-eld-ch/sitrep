import { describe, expect, it } from "vitest";
import {
  BABS_SPRITE_ID,
  aliasFor,
  babsImage,
  categoryOf,
  iconIdentifiers,
  legacyIconMatchExpression,
  resolveIconId,
} from "./iconResolver";

describe("resolveIconId", () => {
  it.each([
    ["a bare catalogue id", "1101"],
    ["an alias", "babsBeschaedigung"],
    ["an export name", "babs1101"],
    ["a legacy German name", "Beschaedigung"],
  ])("resolves %s to the catalogue id", (_, value) => {
    expect(resolveIconId(value)).toBe("1101");
  });

  it.each([undefined, "", "gibtEsNicht"])("returns undefined for %j", (value) => {
    expect(resolveIconId(value)).toBeUndefined();
  });
});

describe("categoryOf", () => {
  it.each([
    ["1301", "1"],
    ["babsVerletzte", "1"],
    ["Tote", "1"],
  ])("returns the category of %s", (value, category) => {
    expect(categoryOf(value)).toBe(category);
  });

  it("returns undefined for an unknown identifier", () => {
    expect(categoryOf("gibtEsNicht")).toBeUndefined();
  });
});

describe("aliasFor", () => {
  it("is the reverse of resolving the alias", () => {
    const alias = aliasFor("1101");

    expect(alias).toBe("babsBeschaedigung");
    expect(resolveIconId(alias)).toBe("1101");
  });

  it("throws for an id that is not in the catalogue", () => {
    expect(() => aliasFor("0000" as never)).toThrow("Unknown BABS icon id: 0000");
  });
});

describe("babsImage", () => {
  it("namespaces the key with the sprite id", () => {
    expect(babsImage("1101")).toBe(`${BABS_SPRITE_ID}:1101`);
  });
});

describe("iconIdentifiers", () => {
  it("lists the id, the alias and every legacy name of an icon", () => {
    const identifiers = iconIdentifiers(["1101", "1305"]);

    expect(identifiers).toEqual(
      expect.arrayContaining(["1101", "babsBeschaedigung", "Beschaedigung", "1305", "Tote"]),
    );
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it("is empty for no icons", () => {
    expect(iconIdentifiers([])).toEqual([]);
  });
});

describe("legacyIconMatchExpression", () => {
  const expression = legacyIconMatchExpression("pre_") as unknown as unknown[];

  it("matches on the prefixed icon property and falls back to an empty key", () => {
    expect(expression[0]).toBe("match");
    expect(expression[1]).toEqual(["get", "pre_icon"]);
    expect(expression.at(-1)).toBe("");
  });

  it("maps ids, aliases and legacy names onto the sprite key", () => {
    const pairs = new Map<unknown, unknown>();
    for (let i = 2; i < expression.length - 1; i += 2) pairs.set(expression[i], expression[i + 1]);

    for (const stored of ["1101", "babsBeschaedigung", "Beschaedigung"]) {
      expect(pairs.get(stored)).toBe(babsImage("1101"));
    }
  });
});
