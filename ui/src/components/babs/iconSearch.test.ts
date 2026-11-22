import { listIcons } from "@f-eld-ch/babs-core";
import { describe, expect, it } from "vitest";
import { isPickableIcon } from "./excludedIcons";
import { fold, iconSearch } from "./iconSearch";
import { ICON_KEYWORDS } from "./iconKeywords";

const de = iconSearch("de");
const ids = (query: string, search = de) => search(query).map((hit) => hit.id);

describe("fold", () => {
  it("treats an umlaut and its transliteration alike", () => {
    expect(fold("Gebäude").text).toBe(fold("Gebaeude").text);
    expect(fold("Überschwemmung").text).toBe(fold("Ueberschwemmung").text);
    expect(fold("Sanität").text).toBe(fold("Sanitaet").text);
    expect(fold("Straße").text).toBe(fold("Strasse").text);
  });

  it("ignores case, accents and punctuation", () => {
    expect(fold("Étage-Détail").text).toBe("etage detail");
    expect(fold("  Brand,  einzelnes - Gebäude ").text).toBe("brand einzelnes gebaude");
  });

  it("keeps track of where each folded letter came from", () => {
    const folded = fold("Sanitaetshilfsstelle");
    // "ae" is one letter, spanning both original characters
    expect(folded.text.slice(0, 7)).toBe("sanitat");
    expect(folded.from[5]).toBe(5);
    expect(folded.to[5]).toBe(7);
  });
});

describe("search", () => {
  it("finds nothing for an empty or blank query", () => {
    expect(de("")).toEqual([]);
    expect(de("   ")).toEqual([]);
    expect(de("-- ,")).toEqual([]);
  });

  it("puts the exact name first", () => {
    expect(ids("brand")[0]).toBe("8201");
    expect(ids("ambulanz")[0]).toBe("7114");
    expect(ids("sammelstelle")).toContain("5103");
  });

  it("finds a partner's formation by group and rank together", () => {
    // The names only carry the partner as a letter: "Zug-P".
    const result = ids("polizei zug");
    expect(result[0]).toBe("4103");
    expect(result).toContain("4108"); // Offizier-Zugführer-P
    expect(result).not.toContain("4101"); // Trupp-P
    expect(result).not.toContain("4203"); // Zug-FW
  });

  it("does not care about the order of the words or hyphens", () => {
    expect(ids("zug polizei")).toEqual(ids("polizei zug"));
    expect(ids("polizei-trupp")).toEqual(ids("polizei trupp"));
    expect(ids("polizei trupp")[0]).toBe("4101");
  });

  it("finds a name written with umlauts or without", () => {
    expect(ids("sanität")).toEqual(ids("sanitaet"));
    expect(ids("sanität")).toContain("5106"); // Sanitaetshilfsstelle
    expect(ids("gebäude")).toEqual(ids("gebaeude"));
    expect(ids("gebäude")).toContain("8219"); // Gebaeudeeinsturz
    expect(ids("überschwemmung")).toContain("8103");
  });

  it("matches while the word is still being typed", () => {
    expect(ids("sanitae")).toContain("5106");
    expect(ids("sanit")).toContain("5106");
    expect(ids("helik")).toEqual(expect.arrayContaining(["7113", "5129"]));
  });

  it("finds a symbol by a word that is not in its name", () => {
    expect(ids("kaputt").slice(0, 3).sort()).toEqual(["1101", "1102", "1103"]);
    expect(ids("feuer")).toEqual(expect.arrayContaining(["8201", "1104"]));
    expect(ids("heli")).toEqual(expect.arrayContaining(["7113", "5129"]));
    expect(ids("lkw")).toContain("7105");
    expect(ids("sanka")).toContain("7114");
    expect(ids("töff")).toContain("7101");
    expect(ids("toeff")).toContain("7101");
  });

  it("ranks a word in the name before the same word as a keyword or group", () => {
    // "Feuerwehr" is the group of the FW formations; "Brand" carries the keyword "feuer".
    const result = ids("feuer");
    expect(result.indexOf("8201")).toBeLessThan(result.indexOf("4203"));
  });

  it("never matches numbers or the technical alias", () => {
    expect(de("4101")).toEqual([]);
    expect(de("1101")).toEqual([]);
    expect(de("babsBeschaedigung")).toEqual([]);
  });

  it("only returns symbols the picker offers", () => {
    for (const query of ["brand", "gebiet", "zone", "strasse", "gefahr", "beispiel", "signatur"]) {
      for (const hit of de(query)) expect(isPickableIcon(hit.id)).toBe(true);
    }
    // Line and zone symbols belong to their own controls.
    expect(ids("rutschgebiet")).not.toContain("1113");
    expect(ids("beispiel")).toEqual([]);
  });

  it("limits the number of results", () => {
    expect(de("a", 5).length).toBeLessThanOrEqual(5);
    expect(de("e").length).toBeLessThanOrEqual(50);
  });

  it("returns every matching word in all the words of the query or nothing", () => {
    expect(de("polizei brand")).toEqual([]);
  });
});

describe("other languages", () => {
  const fr = iconSearch("fr");
  const it_ = iconSearch("it");

  it("searches the names in the language of the interface", () => {
    expect(ids("incendie", fr).length).toBeGreaterThan(0);
    expect(ids("incendio", it_).length).toBeGreaterThan(0);
    expect(fr("incendie")[0].label.toLowerCase()).toContain("incendie");
  });

  it("also finds a symbol by its German name", () => {
    expect(ids("brand", fr)).toContain("8201");
    expect(ids("zug polizei", fr)).toContain("4103");
  });

  it("falls back to German for a language the catalogue does not have", () => {
    expect(ids("brand", iconSearch("en"))[0]).toBe("8201");
    expect(iconSearch("en")).toBe(iconSearch("de"));
  });
});

describe("what is shown", () => {
  it("names the place of a symbol, without repeating a group that says it all", () => {
    const zug = de("polizei zug")[0];
    expect(zug.label).toBe("Zug-P");
    expect(zug.path).toBe("Formationen › Polizei");

    // category and group are both "Fahrzeuge"
    expect(de("ambulanz")[0].path).toBe("Fahrzeuge");
    // the group name starts with the category's
    expect(de("beschaedigung")[0].path).toMatch(/^Auswirkungen von Schadenereignissen/);
  });

  it("marks where the query matched in the name and in the path", () => {
    const zug = de("polizei zug")[0];
    expect(zug.labelMatch.map(([a, b]) => zug.label.slice(a, b))).toEqual(["Zug"]);
    expect(zug.pathMatch.map(([a, b]) => zug.path.slice(a, b))).toEqual(["Polizei"]);

    // The two characters "ae" are one letter of the query, and are marked as one stretch.
    const typed = de("sanität").find((hit) => hit.id === "5106")!;
    expect(typed.labelMatch.map(([a, b]) => typed.label.slice(a, b))).toEqual(["Sanitaet"]);

    const partial = de("sanitae").find((hit) => hit.id === "5106")!;
    expect(partial.labelMatch.map(([a, b]) => partial.label.slice(a, b))).toEqual(["Sanitae"]);
  });

  it("marks nothing for a match through a keyword", () => {
    const hit = de("kaputt").find((h) => h.id === "1101")!;
    expect(hit.labelMatch).toEqual([]);
    expect(hit.pathMatch).toEqual([]);
  });
});

describe("keywords", () => {
  it("name only symbols the picker offers", () => {
    const known = new Set(listIcons().map((meta) => meta.id));
    const stray = Object.keys(ICON_KEYWORDS).filter(
      (id) => !known.has(id as never) || !isPickableIcon(id as never),
    );
    expect(stray).toEqual([]);
  });

  it("have no empty entries", () => {
    const empty = Object.entries(ICON_KEYWORDS)
      .filter(
        ([, words]) => !words || words.length === 0 || words.some((word) => word.trim() === ""),
      )
      .map(([id]) => id);
    expect(empty).toEqual([]);
  });
});
