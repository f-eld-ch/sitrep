import type { BabsIconId } from "@f-eld-ch/babs-core";

/**
 * Catalogue icons hidden from the picker.
 *
 * The migration widened the picker from the 106 icons this repo used to bundle to the
 * full 257-icon catalogue. Some of those are not useful in this application, so they are
 * excluded here rather than by curating a bundled subset — which is what made the old
 * registry expensive to maintain.
 *
 * Typed as `BabsIconId`, so an id that disappears upstream becomes a compile error
 * instead of a silently dead entry. Excluding an icon only hides it from the picker: it
 * stays in the sprite and keeps rendering on existing features, so removing an icon here
 * can never orphan persisted data.
 */
export const EXCLUDED_BABS_ICON_IDS: ReadonlySet<BabsIconId> = new Set<BabsIconId>([
  // Intentionally empty: the full catalogue is offered until the exclusions are chosen.
  // Add ids here, e.g. "9101c", grouped by category with a note on why.
]);

/** True when an icon should be offered in the picker. */
export const isPickableIcon = (id: BabsIconId): boolean => !EXCLUDED_BABS_ICON_IDS.has(id);
