import type { BabsCategoryNumber, BabsIconId } from "@f-eld-ch/babs-core";

export interface LabelField {
  key: "nameLeft" | "name" | "nameRight";
  /** i18n key for the field's label. */
  labelKey: string;
  /** i18n key for the placeholder; falls back to labelKey when absent. */
  placeholderKey?: string;
}

const DEFAULT_FIELDS: readonly LabelField[] = [
  { key: "name", labelKey: "name", placeholderKey: "mapview.labels.beschreibung" },
];

/**
 * Casualty icons carry a count, not a description.
 * Keyed on specific icon IDs — category 1 is much broader (damage signs, etc.).
 */
const CASUALTY_ICON_IDS = new Set<BabsIconId>([
  "1301", // Verletzte
  "1302", // Vermisste
  "1303", // Obdachlose
  "1304", // Eingesperrte
  "1305", // Tote
]);

const CASUALTY_FIELDS: readonly LabelField[] = [
  { key: "name", labelKey: "name", placeholderKey: "mapview.labels.anzahlPersonen" },
];

/**
 * Formationen and Fahrzeuge annotate in three positions — Nähere Kennzeichnung (left),
 * Ortsbezeichnung (below), Zusatzangaben (right). Shared so the two categories cannot drift.
 */
const ANNOTATED_FIELDS: readonly LabelField[] = [
  { key: "nameLeft", labelKey: "mapview.labels.kennzeichnung" },
  { key: "name", labelKey: "mapview.labels.ortsbezeichnung" },
  { key: "nameRight", labelKey: "mapview.labels.zusatzangaben" },
];

const BY_CATEGORY: Partial<Record<BabsCategoryNumber, readonly LabelField[]>> = {
  "4": ANNOTATED_FIELDS, // Formationen
  "7": ANNOTATED_FIELDS, // Fahrzeuge
};

export const fieldsFor = (
  category: BabsCategoryNumber | undefined,
  iconId?: BabsIconId,
): readonly LabelField[] => {
  if (category && BY_CATEGORY[category]) return BY_CATEGORY[category];
  if (iconId && CASUALTY_ICON_IDS.has(iconId)) return CASUALTY_FIELDS;
  return DEFAULT_FIELDS;
};
