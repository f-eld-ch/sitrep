import {
  type BabsCategoryNumber,
  type BabsIconId,
  isPointCategory,
  isPointIcon,
} from "@f-eld-ch/babs-core";

/**
 * What the icon picker hides.
 *
 * The catalogue says how each symbol is used (`getIconUsage` in `@f-eld-ch/babs-core`): the
 * picker offers only the plain point symbols. Line and zone symbols belong to their own
 * controls, and the "Beispiel" illustrations are documentation. Hiding a symbol here only
 * removes it from the *picker*: it stays in the sprite and keeps rendering on existing
 * features, so nothing can orphan persisted data or blank a thumbnail.
 */

/** True when an icon should be offered in the picker. */
export const isPickableIcon = (id: BabsIconId): boolean => isPointIcon(id);

/** True when a category should be offered in the picker at all. */
export const isPickableCategory = (category: BabsCategoryNumber): boolean =>
  isPointCategory(category);
