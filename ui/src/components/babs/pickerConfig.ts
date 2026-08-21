import type { BabsCategoryNumber, BabsGroupNumber, BabsIconId } from "@f-eld-ch/babs-core";

/**
 * Presentation choices for the icon picker. All of it is deliberately data rather than
 * logic, so tuning the picker means editing this file and nothing else.
 */

/**
 * Rendered edge length of a picker icon, in px.
 *
 * The buttons are 35px (BabsIconController.scss). Leaving room here is what produces the
 * visible gap between icons — at the catalogue's natural 32px the glyphs nearly filled
 * the button and read as cramped.
 */
export const PICKER_ICON_SIZE = 30;

/** Gap between adjacent picker buttons, in px. */
export const PICKER_GAP = 1;

/**
 * Marks a glyph as belonging to the icon picker.
 *
 * The button's padding and centring are keyed off this class in
 * BabsIconController.scss, so the styling travels with the icon rather than being applied
 * to buttons. That matters because the stylesheet is global: styling
 * `.maplibregl-ctrl-group button` directly also hits MapLibre's own zoom, compass and
 * fullscreen controls, which centre a background-image and end up off-centre once padding
 * is added.
 */
export const PICKER_ICON_CLASS = "babs-picker-icon";

/**
 * Icon shown on a category's collapsed button.
 *
 * Previously this was whichever icon happened to sort last in the category, which is why
 * "Formationen" showed *Offizier-Zugführer* and "Auswirkungen" showed *Radioaktives
 * Gebiet*. Each entry below is chosen to be representative of its category.
 */
export const CATEGORY_ICON: Record<BabsCategoryNumber, BabsIconId> = {
  "1": "1101", // Auswirkungen — Beschädigung, the base damage symbol
  "2": "2101", // Gefahren — Chemikalien Gefahr
  "3": "3101", // Zivile Führungsstandorte — Einsatzleitung
  "4": "4801", // Formationen — Trupp, the partner-neutral hierarchy symbol
  "5": "5103", // Einrichtungen im Einsatzraum — Sammelstelle
  "6": "6101a", // Bewegungen — Beabsichtigte Verschiebung
  "7": "7103", // Fahrzeuge — Motorfahrzeug, the generic vehicle
  "8": "8201", // Bildhafte Signaturen — Brand
  "9": "9104", // Spezial — Notfalltreffpunkt
};

/** One entry in a category's first level: an icon that opens a group instead of placing. */
export interface DrillDownEntry {
  /** Icon shown at the first level. */
  readonly selector: BabsIconId;
  /** Group revealed when it is chosen. */
  readonly group: BabsGroupNumber;
}

/**
 * Categories presented in two levels: choose from these icons first, then place from the
 * group each one opens.
 *
 * Category 4 (Formationen) holds 62 icons across 8 groups, and the groups *are* the
 * partner organisations. Every partner repeats the same eight ranks, so a flat list is 62
 * near-identical glyphs. The 47xx icons are exactly the partner symbols without a rank,
 * which makes them the natural first level: pick "P" and you get Polizei's 4101-4108.
 *
 * The selector is also placeable — it is prepended to its own group's list, so opening
 * Polizei offers the plain partner symbol followed by each rank, and nothing in the
 * catalogue becomes unreachable.
 *
 * Categories 1 and 8 also have several groups but are deliberately left flat: their
 * groups hold genuinely distinct symbols rather than parallel variants of one set.
 */
export const CATEGORY_DRILL_DOWN: Partial<Record<BabsCategoryNumber, readonly DrillDownEntry[]>> = {
  "4": [
    { selector: "4701", group: "41" }, // P       → Polizei
    { selector: "4702", group: "42" }, // FW      → Feuerwehr
    { selector: "4703", group: "43" }, // San     → Sanitätsdienst
    { selector: "4704", group: "44" }, // ZS      → Zivilschutz
    { selector: "4705", group: "45" }, // TechnB  → Techn B
    { selector: "4706", group: "46" }, // A       → Armee
    // Not a 47xx partner symbol, but without it group 48 — the ranks with no partner —
    // would be unreachable from the picker. Remove this line to hide those 8 icons.
    { selector: "4801", group: "48" }, // Trupp   → Hierarchiestufe ohne Partner
  ],
};
