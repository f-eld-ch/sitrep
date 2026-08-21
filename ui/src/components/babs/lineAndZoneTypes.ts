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
} as const;

export interface SelectableType {
  /** Persisted verbatim as `properties.lineType` / `properties.zoneType`. */
  name: string;
  /** Translation key suffix under `babs.lines.*` / `babs.zones.*`. */
  description: string;
  /** Catalogue icon used for the picker button. */
  thumbnail: BabsIconId;
  color: string;
}

export type SelectableTypes = Record<string, SelectableType>;

export const ZoneTypes: SelectableTypes = {
  Einsatzraum: {
    name: "Einsatzraum",
    description: "Einsatzraum",
    thumbnail: "5126", // Absperrung Einsatzraum — outline only, no fill pattern
    color: Colors.Blue,
  },
  Schadengebiet: {
    name: "Schadengebiet",
    description: "Schadengebiet",
    thumbnail: "1114", // Schadengebiet - Schadenraum — outline only, no fill pattern
    color: Colors.Red,
  },
  Brandzone: {
    name: "Brandzone",
    description: "Brandzone",
    thumbnail: "1110", // Brandzone Flächenbrand — renders 1110-pattern
    color: Colors.Red,
  },
  Zerstoerung: {
    name: "Zerstoerung",
    description: "Zerstörte, unpassierbare Zone",
    thumbnail: "1112", // Zerstörte Zone einer Ortschaft — renders 1112-pattern
    color: Colors.Red,
  },
};

export const LineTypes: SelectableTypes = {
  Rutschgebiet: {
    name: "Rutschgebiet",
    description: "Rutschgebiet",
    thumbnail: "1113",
    color: Colors.Red,
  },
  begehbar: {
    name: "begehbar",
    description: "Strasse erschwert befahrbar / begehbar",
    thumbnail: "1201",
    color: Colors.Red,
  },
  schwerBegehbar: {
    name: "schwerBegehbar",
    description: "Strasse nicht befahrbar / schwer Begehbar",
    thumbnail: "1202",
    color: Colors.Red,
  },
  unpassierbar: {
    name: "unpassierbar",
    description: "Strasse unpassierbar / gesperrt",
    thumbnail: "1203",
    color: Colors.Red,
  },
  beabsichtigteErkundung: {
    name: "beabsichtigteErkundung",
    description: "Beabsichtigte Erkundung",
    thumbnail: "6103a",
    color: Colors.Blue,
  },
  durchgeführteErkundung: {
    name: "durchgeführteErkundung",
    description: "Durchgeführte Erkundung",
    thumbnail: "6103b",
    color: Colors.Blue,
  },
  beabsichtigteVerschiebung: {
    name: "beabsichtigteVerschiebung",
    description: "Beabsichtigte Verschiebung",
    thumbnail: "6101a",
    color: Colors.Blue,
  },
  durchgeführteVerschiebung: {
    name: "durchgeführteVerschiebung",
    description: "Durchgeführte Verschiebung",
    thumbnail: "6101b",
    color: Colors.Blue,
  },
  beabsichtigterEinsatz: {
    name: "beabsichtigterEinsatz",
    description: "Beabsichtigter Einsatz",
    thumbnail: "6102a",
    color: Colors.Blue,
  },
  durchgeführterEinsatz: {
    name: "durchgeführterEinsatz",
    description: "Durchgeführter Einsatz",
    thumbnail: "6102b",
    color: Colors.Blue,
  },
  rettungsAchse: {
    name: "rettungsAchse",
    description: "Rettungs Achse",
    thumbnail: "6106",
    color: Colors.Blue,
  },
};

/**
 * `RutschgebietGespiegelt` is deliberately absent.
 *
 * It was never offered in the picker, and mirroring is a geometry operation: the reverse
 * button in `BabsIconController` reverses the linestring, which flips the tangent and so
 * mirrors an asymmetric `line-pattern` (and flips arrowhead direction for the movement
 * types). `styleGenerator` still maps the value so pre-existing features render, but no
 * new feature can acquire it.
 */

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
