import { babsImage } from "components/babs/iconResolver";
import { Colors } from "components/babs/lineAndZoneTypes";
import { ARROW, CHEVRON_BEARING_OFFSET } from "./arrow";
import { FLOW_ARROW_LENGTH_RATIO } from "./flowArrow";
import { SLIDE_ARROW_LENGTH_RATIO } from "./slideArrow";
import type { EnrichLineConfig, EnrichPolygonConfig } from "./types";

/**
 * Which line and zone types get a generated indicator, and what each one looks like.
 *
 * Both maps are exported so `styleImageResolution.test.ts` can assert every sprite named here
 * exists in the atlas: these ids are written straight onto synthetic features and read by a
 * bare `["get", "icon"]`, bypassing the `match` expression, so nothing else would catch a typo
 * or an unprefixed key.
 */

/** End-of-line arrowhead only — start is left bare so the line reads directionally. */
const directional = (arrow: string = ARROW.movement): EnrichLineConfig => ({
  iconStart: undefined,
  iconEnd: arrow,
  iconRotation: CHEVRON_BEARING_OFFSET,
});

/**
 * Damage severity marked at both ends of the affected road segment. These are semantic symbols
 * rather than arrowheads, so they stay catalogue icons rather than becoming chevrons: 1101
 * Beschädigung, 1102 Teilzerstörung, 1103 Totalzerstörung.
 */
const damageExtent = (id: "1101" | "1102" | "1103"): EnrichLineConfig => ({
  iconStart: babsImage(id),
  iconEnd: babsImage(id),
  iconRotation: CHEVRON_BEARING_OFFSET,
});

/**
 * No cap at all: the whole indicator is the slide arrow, drawn across the boundary. Its ratio
 * is read against the line's own length.
 */
const slideDirection = (): EnrichLineConfig => ({
  iconRotation: CHEVRON_BEARING_OFFSET,
  slideArrow: {
    icon: ARROW.fireSpread,
    color: Colors.Red,
    lengthRatio: SLIDE_ARROW_LENGTH_RATIO,
  },
});

export const EnrichLineStringMap: Record<string, EnrichLineConfig> = {
  begehbar: damageExtent("1101"),
  schwerBegehbar: damageExtent("1102"),
  unpassierbar: damageExtent("1103"),
  beabsichtigteErkundung: directional(),
  durchgeführteErkundung: directional(),
  beabsichtigteVerschiebung: directional(),
  rettungsAchse: directional(),
  durchgeführteVerschiebung: directional(),
  // Einsatz takes the double chevron; it previously reused the single one, which made it
  // indistinguishable from Verschiebung on the map.
  beabsichtigterEinsatz: directional(ARROW.deployment),
  durchgeführterEinsatz: directional(ARROW.deployment),
  // Fire spread: the movement line styles in red, so a red chevron to match the stroke.
  brandUebergriffGefahr: directional(ARROW.fireSpread),
  brandUebergriffErfolgt: directional(ARROW.fireSpread),
  // The only entry whose indicator is not a cap: the catalogue draws Rutschgebiet with a slide
  // arrow across the boundary rather than a symbol at either end.
  Rutschgebiet: slideDirection(),
};

export const EnrichPolygonMap: Record<string, EnrichPolygonConfig> = {
  // 1115 is a flooded area *with a flow direction* — the arrow is part of the catalogue symbol
  // rather than decoration, which is why it is generated rather than left to the user. Its
  // ratio is read against the ring's bounding-box diagonal.
  UeberschwemmtesGebiet: {
    flowArrow: {
      icon: ARROW.fireSpread,
      color: Colors.Red,
      lengthRatio: FLOW_ARROW_LENGTH_RATIO,
    },
  },
};
