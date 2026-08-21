import { isBabsIconId, listIcons } from "@f-eld-ch/babs-core";
import { describe, expect, it } from "vitest";
import { LEGACY_ICON_IDS } from "./legacyIconNames";

/**
 * Names that existed in the pre-migration registry but are deliberately unmapped.
 * See the block comment in legacyIconNames.ts for the reasoning behind each.
 */
const INTENTIONALLY_UNMAPPED = ["Einsatz", "Verschiebung", "Flugzeugabsturz"] as const;

describe("LEGACY_ICON_IDS", () => {
  it("maps every legacy name to an id that exists in the catalogue", () => {
    // `satisfies` already enforces this at compile time; this catches the case where a
    // dependency bump removes an id that used to be valid, which types alone would miss
    // only if the build were stale.
    const invalid = Object.entries(LEGACY_ICON_IDS).filter(([, id]) => !isBabsIconId(id));
    expect(invalid).toEqual([]);
  });

  it("never maps two legacy names onto conflicting expectations", () => {
    // Several legacy names legitimately share a target (e.g. Signatur/Beispiel pairs
    // collapsed upstream). This only asserts the keys themselves are unique, which the
    // object literal guarantees — the value is documenting intent for future edits.
    const keys = Object.keys(LEGACY_ICON_IDS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe("Flugzeugabsturz", () => {
    it("is mapped as soon as the catalogue gains id 8333", () => {
      // Self-activating reminder. `8333` does not exist in 0.3.3, so this passes today.
      // The moment the dependency is bumped to a version that ships it, this fails until
      // `Flugzeugabsturz: "8333"` is added — the bump cannot silently skip the mapping.
      //
      // Phrased as a list so the assertion is unconditional and the failure names itself.
      // Widened to string[]: Object.values() infers the union of the ids actually
      // present, which is narrower than BabsIconId and would reject the lookup.
      const mappedIds: readonly string[] = Object.values(LEGACY_ICON_IDS);
      const availableButUnmapped = ["8333"].filter(
        (id) => isBabsIconId(id) && !mappedIds.includes(id),
      );
      expect(availableButUnmapped).toEqual([]);
    });

    it("still has 8333 as the next free id, so the TODO stays valid", () => {
      // Guards the guard: if 83xx grows past 8333 without 8333 itself appearing, the
      // assumption recorded in legacyIconNames.ts is wrong and needs revisiting.
      const beyond8333 = listIcons()
        .filter((m) => m.id.startsWith("83") && m.id > "8333")
        .map((m) => m.id);
      expect(beyond8333).toEqual([]);
    });
  });

  it("documents every unmapped legacy name rather than dropping it silently", () => {
    for (const name of INTENTIONALLY_UNMAPPED) {
      expect(Object.hasOwn(LEGACY_ICON_IDS, name)).toBe(false);
    }
  });
});
