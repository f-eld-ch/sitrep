import type { BabsCategoryNumber, BabsIconId } from "@f-eld-ch/babs-core";

/**
 * What the icon picker hides.
 *
 * Excluding something here only removes it from the *picker*. It stays in the sprite and
 * keeps rendering on existing features, and the line and zone controllers draw their
 * thumbnails directly, so nothing here can orphan persisted data or blank a thumbnail.
 */

/**
 * Whole categories the icon picker does not offer.
 *
 * Category 6 (Bewegungen) describes how a line is drawn, not a point symbol. Its icons
 * are the thumbnails in the line controller, which turns a choice there into a `lineType`
 * that the style resolves to the right pattern and end marker. Offering them as
 * placeable point icons as well would be misleading.
 */
export const EXCLUDED_CATEGORIES: ReadonlySet<BabsCategoryNumber> = new Set<BabsCategoryNumber>([
  "6",
]);

/**
 * Individual icons the picker does not offer.
 *
 * These are all symbols that belong to a different control: area and line symbology, or
 * the *Beispiel* illustrations that accompany a *Signatur* in the catalogue rather than
 * being placeable in their own right.
 *
 * Typed as `BabsIconId`, so an id that disappears upstream becomes a compile error rather
 * than a silently dead entry.
 */
export const EXCLUDED_BABS_ICON_IDS: ReadonlySet<BabsIconId> = new Set<BabsIconId>([
  // Zone symbology — drawn via the zone controller as a `zoneType`.
  "1110", // Brandzone Flächenbrand
  "1112", // Zerstörte Zone einer Ortschaft
  "1114", // Schadengebiet - Schadenraum
  "1115", // Überschwemmtes Gebiet
  "5126", // Absperrung Einsatzraum

  // Line symbology — drawn via the line controller as a `lineType`.
  "1113", // Rutschgebiet
  "1201", // Str erschwert befahrbar - begehbar
  "1202", // Str nicht befahrbar - schwer begehbar
  "1203", // Str unpassierbar - gesperrt
  "1111a", // Brandübergriffsgefahr - Signatur
  "1111b", // Brandübergriff erfolgt - Signatur

  // Catalogue illustrations: a "Beispiel" shows how a "Signatur" is used on a map, so it
  // is documentation rather than a symbol to place.
  "1105b", // Explosionsherd-Beispiel
  "1106a", // Brand einzelnes Gebäude - Signatur
  "1106b", // Brand einzelnes Gebäude - Beispiel
  "1107a", // Brand mehrerer Gebäude - Signatur
  "1107b", // Brand mehrerer Gebäude - Beispiel
  "1108", // Brandübergriffsgefahr - Beispiel
  "1109", // Brandübergriff erfolgt - Beispiel
  "1116a", // Trümmerbereich - Signatur
  "1116b", // Trümmerbereich - Beispiel
  "2109b", // Gefahrentafel mit UN-Nummer
]);

/** True when an icon should be offered in the picker. */
export const isPickableIcon = (id: BabsIconId): boolean => !EXCLUDED_BABS_ICON_IDS.has(id);

/** True when a category should be offered in the picker at all. */
export const isPickableCategory = (category: BabsCategoryNumber): boolean =>
  !EXCLUDED_CATEGORIES.has(category);
