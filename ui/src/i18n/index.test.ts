import { describe, expect, it } from "vitest";
import i18n from ".";
import { de, en, fr, it as it_ } from "./locales";

/** Every translation key as a dotted path. */
function keyPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n setup", () => {
  it("falls back to German and offers the four locales", () => {
    expect(i18n.options.fallbackLng).toEqual(["de"]);
    expect(i18n.languages).toEqual(["de", "en", "fr", "it"]);
    expect(i18n.options.defaultNS).toBe("translations");
  });

  it.each([
    ["de", de.resource.formation.FW],
    ["en", en.resource.formation.FW],
    ["fr", fr.resource.formation.FW],
    ["it", it_.resource.formation.FW],
  ])("translates in %s", async (lang, expected) => {
    await i18n.changeLanguage(lang);

    expect(i18n.t("resource.formation.FW")).toBe(expected);
  });

  it("uses a different word per language, so a copied locale is noticed", () => {
    expect(new Set([de, fr, it_].map((l) => l.resource.formation.FW)).size).toBe(3);
  });

  it("falls back to German for a language it does not have", async () => {
    await i18n.changeLanguage("nl");

    expect(i18n.t("resource.formation.FW")).toBe(de.resource.formation.FW);
  });
});

describe("locale files", () => {
  const german = new Set(keyPaths(de));

  it.each([
    ["en", en],
    ["fr", fr],
    ["it", it_],
  ])("%s has exactly the keys of de", (_, locale) => {
    const keys = new Set(keyPaths(locale));

    expect([...german].filter((key) => !keys.has(key))).toEqual([]);
    expect([...keys].filter((key) => !german.has(key))).toEqual([]);
  });
});
