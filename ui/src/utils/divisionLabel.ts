import type { Division } from "types/journal";

type Translate = (key: string) => string;
type Labelled = Pick<Division, "name" | "description" | "kind">;

/**
 * System-managed entities (kind MESSAGE_MAP) are stored with fallback labels only;
 * the UI always renders the translation for the active language.
 */
const MESSAGE_MAP_KEY = "divisionsNames.Karte";

/** Short label (chips, tags): the abbreviation, falling back to the description. */
export function divisionShortLabel(division: Labelled, t: Translate): string {
  if (division.kind === "MESSAGE_MAP") return t(`${MESSAGE_MAP_KEY}.name`);

  return division.name.trim() !== "" ? division.name : division.description;
}

/** Long label (selects, toggles): the description, falling back to the abbreviation. */
export function divisionLongLabel(division: Labelled, t: Translate): string {
  if (division.kind === "MESSAGE_MAP") return t(`${MESSAGE_MAP_KEY}.description`);

  return division.description.trim() !== "" ? division.description : division.name;
}

/** Label of a layer; the message map layer is translated, others are user-named. */
export function layerLabel(
  layer: { name: string; kind: "STANDARD" | "MESSAGE_MAP" },
  t: Translate,
) {
  return layer.kind === "MESSAGE_MAP" ? t(`${MESSAGE_MAP_KEY}.description`) : layer.name;
}
