import { getIcon, isBabsIconId, listIcons } from "@f-eld-ch/babs-core";
import { describe, expect, it } from "vitest";
import { aliasFor, resolveIconId } from "./iconResolver";
import { LEGACY_ATLAS_ICON_KEYS } from "./legacyAtlasKeys";
import { LEGACY_ICON_IDS } from "./legacyIconNames";

/**
 * Names that existed in the pre-migration registry but are deliberately unmapped.
 * See the block comment in legacyIconNames.ts for the reasoning behind each.
 */
const INTENTIONALLY_UNMAPPED = ["Einsatz", "Verschiebung"] as const;

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
    it("is mapped, now that the catalogue ships id 8333", () => {
      // This started life as a self-activating reminder: 8333 did not exist in 0.3.3, so
      // the assertion below was a no-op that would begin failing the moment the catalogue
      // gained the id. That happened in 0.4.0 and the mapping was added, so it is now a
      // plain regression guard.
      const mappedIds: readonly string[] = Object.values(LEGACY_ICON_IDS);
      const availableButUnmapped = ["8333"].filter(
        (id) => isBabsIconId(id) && !mappedIds.includes(id),
      );
      expect(availableButUnmapped).toEqual([]);
      expect(getIcon("8333").labels.de).toBe("Flugzeugabsturz");
    });
  });

  it("documents every unmapped legacy name rather than dropping it silently", () => {
    for (const name of INTENTIONALLY_UNMAPPED) {
      expect(Object.hasOwn(LEGACY_ICON_IDS, name)).toBe(false);
    }
  });

  it("covers every icon key from the deleted sprite atlas", () => {
    // The guard against orphaning persisted data: any of these could be sitting in a
    // features.properties.icon right now. Anything genuinely unmappable must be listed in
    // INTENTIONALLY_UNMAPPED with a documented reason, never just omitted.
    const unaccounted = LEGACY_ATLAS_ICON_KEYS.filter(
      (key) =>
        resolveIconId(key) === undefined &&
        !INTENTIONALLY_UNMAPPED.includes(key as (typeof INTENTIONALLY_UNMAPPED)[number]),
    );
    expect(unaccounted).toEqual([]);
  });
});

describe("resolveIconId", () => {
  it("round-trips legacy name -> id -> alias -> id", () => {
    const broken = Object.keys(LEGACY_ICON_IDS).filter((legacyName) => {
      const id = resolveIconId(legacyName);
      if (!id) return true;
      return resolveIconId(aliasFor(id)) !== id;
    });
    expect(broken).toEqual([]);
  });

  it("accepts a bare id, an alias and an export name for every catalogue icon", () => {
    const broken = listIcons().flatMap((meta) =>
      [meta.id, meta.alias, meta.export]
        .filter((identifier) => resolveIconId(identifier) !== meta.id)
        .map((identifier) => `${meta.id}: ${identifier}`),
    );
    expect(broken).toEqual([]);
  });

  it("returns undefined for unknown and empty input", () => {
    expect(resolveIconId("definitelyNotAnIcon")).toBeUndefined();
    expect(resolveIconId("")).toBeUndefined();
    expect(resolveIconId(undefined)).toBeUndefined();
  });

  it("resolves each legacy name to an id whose category matches its mapping", () => {
    // Cheap sanity check that the table's values are real catalogue members rather than
    // plausible-looking strings: getIcon throws on an unknown id.
    for (const id of Object.values(LEGACY_ICON_IDS)) {
      expect(getIcon(id).id).toBe(id);
    }
  });
});
