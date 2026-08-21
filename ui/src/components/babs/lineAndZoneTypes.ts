import type { BabsCategoryNumber, BabsIconId } from "@f-eld-ch/babs-core";

/**
 * Line and zone types are **this application's** concepts, not catalogue entries. They
 * are persisted as `properties.lineType` / `properties.zoneType` and are unaffected by
 * the move to `@f-eld-ch/babs-*` — only the artwork they display has changed.
 *
 * Each carries a `thumbnail`: the catalogue icon shown in the picker. Deliberately an
 * *icon* rather than the pattern tile the feature renders with — a tiling fragment is
 * hard to recognise at button size, and the corresponding icon reads clearly. The
 * pattern itself is derived in `styleGenerator` via `patternSpriteKey`.
 */

export const Colors = {
  Red: "#ff0000",
  Blue: "#0000ff",
  Black: "#000000",
  Orange: "#F38D11",
  /** Fill wash for contaminated-area zones, which are outlined in black. */
  LightGray: "#535353aa",
} as const;

export interface SelectableType {
  /** Persisted verbatim as `properties.lineType` / `properties.zoneType`. */
  name: string;
  /**
   * Catalogue icon for the picker button — and the source of the label.
   *
   * The name shown to the user comes from `getLabel(thumbnail, lang)` rather than from a
   * `babs.lines.*` / `babs.zones.*` key in this repo, so de/fr/it come from the catalogue
   * and cannot drift from the symbol they describe.
   */
  thumbnail: BabsIconId;
  /** Stroke colour, and the value persisted as `properties.color`. */
  color: string;
  /**
   * How the zone's interior is drawn. At most one of these may be set.
   *
   * A zone with none of them falls through to the generic polygon fill, which washes it
   * in the feature's own colour — so the treatment is always explicit here rather than
   * implied by absence.
   */
  /** Tiling pattern, taken from this icon's pattern tile via `patternSpriteKey`. */
  pattern?: BabsIconId;
  /** Flat fill colour. */
  fill?: string;
  /** No interior fill at all: outline only. */
  outlineOnly?: boolean;
  /**
   * Symbol drawn inside the polygon, at MapLibre's interior anchor for the ring — the
   * pole of inaccessibility, so it stays inside concave shapes rather than drifting out
   * as a centroid would.
   *
   * Note this is a different icon from `thumbnail`: the picker button shows the
   * catalogue's *Beispiel* variant, which depicts the symbol in the context of a zone and
   * so reads better as a button, while the map draws the plain symbol.
   */
  zoneIcon?: BabsIconId;
}

export type SelectableTypes = Record<string, SelectableType>;

export const ZoneTypes: SelectableTypes = {
  Einsatzraum: {
    name: "Einsatzraum",
    thumbnail: "5126", // Absperrung Einsatzraum
    outlineOnly: true,
    color: Colors.Blue,
  },
  Schadengebiet: {
    name: "Schadengebiet",
    thumbnail: "1114", // Schadengebiet - Schadenraum
    outlineOnly: true,
    color: Colors.Red,
  },
  Brandzone: {
    name: "Brandzone",
    thumbnail: "1110", // Brandzone Flächenbrand
    pattern: "1110", // renders 1110-pattern
    color: Colors.Red,
  },
  Zerstoerung: {
    name: "Zerstoerung",
    thumbnail: "1112", // Zerstörte Zone einer Ortschaft
    pattern: "1112", // renders 1112-pattern
    color: Colors.Red,
  },
  /**
   * Contaminated-area zones (group 14): black outline, light grey wash, and the hazard
   * symbol drawn inside the polygon rather than tiled across it.
   *
   * `thumbnail` and `zoneIcon` are the same symbol here: the catalogue's *Beispiel*
   * variants (1401b-1404b) depict the symbol already sitting inside an area, which
   * duplicates what the zone itself draws, so the plain symbol reads better on the button.
   * They stay excluded from the icon picker along with every other Beispiel.
   */
  BiologischVerseucht: {
    name: "BiologischVerseucht",
    thumbnail: "1401", // Biologisch verseuchtes Gebiet
    zoneIcon: "1401", // Biologisch verseuchtes Gebiet
    fill: Colors.LightGray,
    color: Colors.Black,
  },
  ChemieVerseuchtFluessig: {
    name: "ChemieVerseuchtFluessig",
    thumbnail: "1402", // Chemievergiftete Zone flüssig - sesshaft
    zoneIcon: "1402", // Chemievergiftete Zone flüssig - sesshaft
    fill: Colors.LightGray,
    color: Colors.Black,
  },
  ChemieVerseuchtGasfoermig: {
    name: "ChemieVerseuchtGasfoermig",
    thumbnail: "1403", // Chemievergiftetes Gebiet gasförmig - flüchtig
    zoneIcon: "1403", // Chemievergiftetes Gebiet gasförmig - flüchtig
    fill: Colors.LightGray,
    color: Colors.Black,
  },
  Radioaktiv: {
    name: "Radioaktiv",
    thumbnail: "1404", // Radioaktives Gebiet
    zoneIcon: "1404", // Radioaktives Gebiet
    fill: Colors.LightGray,
    color: Colors.Black,
  },
};

export const LineTypes: SelectableTypes = {
  brandUebergriffGefahr: {
    name: "brandUebergriffGefahr",
    thumbnail: "1111a",
    color: Colors.Red,
  },
  brandUebergriffErfolgt: {
    name: "brandUebergriffErfolgt",
    thumbnail: "1111b",
    color: Colors.Red,
  },
  Rutschgebiet: {
    name: "Rutschgebiet",
    thumbnail: "1113",
    color: Colors.Red,
  },
  begehbar: {
    name: "begehbar",
    thumbnail: "1201",
    color: Colors.Red,
  },
  schwerBegehbar: {
    name: "schwerBegehbar",
    thumbnail: "1202",
    color: Colors.Red,
  },
  unpassierbar: {
    name: "unpassierbar",
    thumbnail: "1203",
    color: Colors.Red,
  },
  beabsichtigteErkundung: {
    name: "beabsichtigteErkundung",
    thumbnail: "6103a",
    color: Colors.Blue,
  },
  durchgeführteErkundung: {
    name: "durchgeführteErkundung",
    thumbnail: "6103b",
    color: Colors.Blue,
  },
  beabsichtigteVerschiebung: {
    name: "beabsichtigteVerschiebung",
    thumbnail: "6101a",
    color: Colors.Blue,
  },
  durchgeführteVerschiebung: {
    name: "durchgeführteVerschiebung",
    thumbnail: "6101b",
    color: Colors.Blue,
  },
  beabsichtigterEinsatz: {
    name: "beabsichtigterEinsatz",
    thumbnail: "6102a",
    color: Colors.Blue,
  },
  durchgeführterEinsatz: {
    name: "durchgeführterEinsatz",
    thumbnail: "6102b",
    color: Colors.Blue,
  },
  rettungsAchse: {
    name: "rettungsAchse",
    thumbnail: "6106",
    color: Colors.Blue,
  },
};

/**
 * Order colours appear in the pickers.
 *
 * Follows BABS convention, which is also how the tables above are written: red for
 * damage, hazards and effects, then blue for own forces, means and movements. A colour
 * that is not listed sorts last rather than first, so adding one cannot silently jump the
 * queue.
 */
const COLOR_ORDER: readonly string[] = [Colors.Red, Colors.Blue, Colors.Orange, Colors.Black];

const colorRank = (color: string): number => {
  const index = COLOR_ORDER.indexOf(color);
  return index === -1 ? COLOR_ORDER.length : index;
};

/**
 * Groups selectable types by colour for display.
 *
 * The tables above happen to be written in colour order today, but that is a property of
 * how they were typed rather than something enforced: a type belongs next to its
 * semantic siblings, which is not necessarily next to types of the same colour. Sorting at
 * the point of display means a new entry can be declared wherever it reads best without
 * leaving a stray colour mid-run in the picker.
 *
 * `sort` is stable, so declaration order survives within a colour — which is what keeps
 * pairs like beabsichtigt/durchgeführt adjacent.
 */
export const byColor = (types: SelectableTypes): readonly SelectableType[] =>
  Object.values(types).sort((a, b) => colorRank(a.color) - colorRank(b.color));

/**
 * Feature colour by catalogue category, replacing the old per-group table that was keyed
 * on this repo's German group names.
 *
 * Follows BABS convention: red for damage/hazard/effects, blue for own forces, means and
 * movements. Keyed by `BabsCategoryNumber`, so a category appearing or disappearing
 * upstream surfaces as a type error rather than a silent fallback.
 */
export const ColorForCategory: Record<BabsCategoryNumber, string> = {
  "1": Colors.Red, // Auswirkungen
  "2": Colors.Red, // Gefahren
  "3": Colors.Blue, // Zivile Führungsstandorte
  "4": Colors.Blue, // Formationen
  "5": Colors.Blue, // Einrichtungen im Einsatzraum
  "6": Colors.Blue, // Bewegungen
  "7": Colors.Blue, // Fahrzeuge
  "8": Colors.Red, // Bildhafte Signaturen
  "9": Colors.Black, // Spezial
};
