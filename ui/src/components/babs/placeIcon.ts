import type { BabsCategoryNumber, BabsIconId } from "@f-eld-ch/babs-core";
import type { GeoJsonProperties } from "geojson";
import { isUndefined, omitBy } from "lodash";
import { aliasFor } from "./iconResolver";
import { rotationAllowed, unsupportedLabelKeys } from "./labelSchema";
import { ColorForCategory } from "./lineAndZoneTypes";

const isEmptyValue = (v: unknown): boolean => isUndefined(v) || v === "";

/**
 * The properties of a point after a symbol was chosen for it, from wherever it was chosen: the
 * category browser and the search must give the same result.
 *
 * The icon is stored as its readable alias, not the numeric id: that keeps persisted data
 * greppable, and the style's match expression resolves it to a sprite key at render time.
 * `iconType` used to be written as an exact duplicate of `icon` and was read nowhere, so it is
 * no longer set.
 */
export function propertiesWithIcon(
  properties: GeoJsonProperties | undefined,
  id: BabsIconId,
  category: BabsCategoryNumber,
): GeoJsonProperties {
  return omitBy(
    {
      ...properties,
      icon: aliasFor(id),
      color: ColorForCategory[category],
      // The new symbol may have to stay upright where the old one could turn.
      iconRotation: rotationAllowed(category, id) ? properties?.iconRotation : undefined,
      // Undefined so `omitBy` strips them: the new symbol may annotate in fewer positions than the
      // old one, and a leftover label would keep being drawn.
      ...Object.fromEntries(unsupportedLabelKeys(category, id).map((key) => [key, undefined])),
    },
    isEmptyValue,
  );
}
