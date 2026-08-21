import { type BabsIconId, isBabsIconId, listIcons } from "@f-eld-ch/babs-core";
import type { ExpressionSpecification } from "maplibre-gl";
import { LEGACY_ICON_IDS, type LegacyIconName } from "./legacyIconNames";

/**
 * Sprite id under which the BABS atlas is registered on the map style.
 * Must match the id used by `withBabsSprite()` from `@f-eld-ch/babs-sprites`.
 */
export const BABS_SPRITE_ID = "babs";

/**
 * Root-absolute path the sprite atlases are served from.
 *
 * Must be passed explicitly to every `@f-eld-ch/babs-sprites` helper. Their default is
 * the *relative* `"map/sprites"`, which is resolved against `document.baseURI` — and this
 * app has no `<base>` tag, so on a route like `/incident/:id/map` that yields
 * `/incident/:id/map/sprites/...` and 404s. The leading slash pins it to the site root,
 * matching how the basemap and imagery sprites are already referenced in the style JSONs.
 *
 * Safe because the Vite `base` is `/`. A sub-path deployment would need a `<base>` tag
 * and the relative form instead.
 */
export const BABS_SPRITE_BASE = "/map/sprites";

/**
 * Namespaces a raw atlas key for use in a style expression.
 *
 * MapLibre registers multi-sprite images as `<spriteId>:<key>` for every sprite except
 * the one with id `default` (see `Style._getSpriteImageId`). The `babs-core` helpers
 * return *unprefixed* keys — `markerSpriteKey("chevron-blue")` is `"marker-chevron-blue"`,
 * `patternSpriteKey("1113")` is `"1113-pattern"` — so passing them straight into an
 * `icon-image` / `line-pattern` expression silently renders nothing.
 *
 * Always route keys through here. Never concatenate `"babs:"` by hand.
 */
export const babsImage = <K extends string>(key: K): `babs:${K}` =>
  `${BABS_SPRITE_ID}:${key}` as const;

/** Every catalogue icon, resolved once at module load. */
const ICONS = listIcons();

/**
 * Reverse of {@link LEGACY_ICON_IDS}: catalogue id → legacy names pointing at it.
 * Several legacy names can share a target (e.g. Signatur/Beispiel pairs collapsed
 * upstream), so the value is a list.
 */
const legacyNamesById = new Map<BabsIconId, string[]>();
for (const [legacyName, id] of Object.entries(LEGACY_ICON_IDS)) {
  const existing = legacyNamesById.get(id);
  if (existing) existing.push(legacyName);
  else legacyNamesById.set(id, [legacyName]);
}

/** alias (`babsBeschaedigung`) and export name (`babs1101`) → id. */
const idByName = new Map<string, BabsIconId>();
for (const meta of ICONS) {
  idByName.set(meta.alias, meta.id);
  idByName.set(meta.export, meta.id);
}

/**
 * Every identifier that can denote one of the given icons — alias, bare id, and any legacy
 * German name mapping to it.
 *
 * For use in style *filters*, which compare `properties.icon` literally and so cannot rely
 * on the `match` expression that resolves `icon-image`. A filter listing only the legacy
 * names silently stops matching as soon as features start storing aliases, which is how
 * the casualty-count text layers came to miss every newly placed feature.
 */
export function iconIdentifiers(ids: readonly BabsIconId[]): string[] {
  const identifiers = new Set<string>();
  for (const id of ids) {
    identifiers.add(id);
    const meta = ICONS.find((m) => m.id === id);
    if (meta) identifiers.add(meta.alias);
    for (const legacyName of legacyNamesById.get(id) ?? []) identifiers.add(legacyName);
  }
  return [...identifiers];
}

/**
 * Resolves any identifier this application has ever persisted into a catalogue id.
 *
 * Accepts, in order of precedence: a bare catalogue id (`"1101"`), an alias
 * (`"babsBeschaedigung"`), an export name (`"babs1101"`), or a legacy German name
 * (`"Beschaedigung"`). Returns `undefined` for anything unrecognised, so callers can
 * fall back deliberately rather than rendering a broken image.
 */
export function resolveIconId(value: string | undefined): BabsIconId | undefined {
  if (!value) return undefined;
  if (isBabsIconId(value)) return value;
  return idByName.get(value) ?? LEGACY_ICON_IDS[value as LegacyIconName];
}

/** The readable, persistable identifier for an icon. This is what new features store. */
export const aliasFor = (id: BabsIconId): string => {
  const meta = ICONS.find((m) => m.id === id);
  if (!meta) throw new Error(`Unknown BABS icon id: ${id}`);
  return meta.alias;
};

/**
 * Builds the `match` expression that maps a stored `icon` property onto a sprite key.
 *
 * Covers both data generations at once — legacy German names and current aliases — so
 * old and new features coexist with no cutover and no data migration.
 *
 * `match` compiles to a hash lookup, so the pair count does not affect evaluation cost.
 * The export name (`babs1101`) is deliberately omitted: nothing ever persists it, and it
 * would add a third of the table for no benefit. `resolveIconId` still accepts it.
 *
 * The trailing `""` is the `match` default — a key that cannot exist, so a wrapping
 * `["image", …]` yields `null` and lets an outer `coalesce` reach its fallback.
 */
export function legacyIconMatchExpression(propPrefix: string): ExpressionSpecification {
  const pairs: string[] = [];
  for (const meta of ICONS) {
    const target = babsImage(meta.id);
    // alias = what new features store; id = cheap safety net for hand-authored data.
    pairs.push(meta.alias, target, meta.id, target);
    for (const legacyName of legacyNamesById.get(meta.id) ?? []) {
      pairs.push(legacyName, target);
    }
  }
  return [
    "match",
    ["get", `${propPrefix}icon`],
    ...pairs,
    "",
  ] as unknown as ExpressionSpecification;
}
