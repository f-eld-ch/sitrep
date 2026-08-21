import { babsSpriteUrl } from "@f-eld-ch/babs-sprites";
import babsAtlas from "@f-eld-ch/babs-sprites/dist/babs-de.json";
import type { CSSProperties } from "react";
import { BABS_SPRITE_BASE } from "./iconResolver";

/**
 * Renders a BABS icon by slicing it out of the sprite atlas.
 *
 * Deliberately not `<BabsIcon>` from `@f-eld-ch/babs-react`. That renders inline SVG,
 * which is crisper, but the definitions total **9.4 MB** and the package's `exports` map
 * offers no per-icon entry point — only the `all` / `icons` / `named` barrels — so using
 * it at all pulls in the entire catalogue. Even lazily that is a multi-megabyte download
 * for a picker in a tool that has to work on poor connectivity.
 *
 * The atlas costs ~76 KB and the map has already fetched it, so thumbnails are close to
 * free. The atlas cell is 36px against 35px picker buttons, so the natural size is
 * already the right size.
 */

interface AtlasEntry {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly pixelRatio: number;
}

const ATLAS = babsAtlas as unknown as Record<string, AtlasEntry>;

/**
 * Sprite geometry is taken from the German sheet and used for every language.
 *
 * Safe because `layout.lock.json` pins the packing (a fixed 36px, 17-column grid) and all
 * 268 keys are verified byte-identical across the de/fr/it manifests — only the pixels
 * differ. `styleImageResolution.test.ts` asserts that invariant, so this cannot silently
 * drift. One 26 KB coordinate table therefore serves all three languages.
 */
const SHEET = Object.values(ATLAS).reduce(
  (extent, cell) => ({
    width: Math.max(extent.width, cell.x + cell.width),
    height: Math.max(extent.height, cell.y + cell.height),
  }),
  { width: 0, height: 0 },
);

/**
 * The 1x PNG for a language.
 *
 * Built from `babsSpriteUrl()` so the package's content-hash cache-buster is preserved —
 * that URL is extensionless *and* query-bearing, so the extension has to be inserted into
 * the path rather than appended to the string.
 */
function sheetUrl(lang: string | undefined): string {
  const url = new URL(babsSpriteUrl(lang, BABS_SPRITE_BASE));
  url.pathname = `${url.pathname}.png`;
  return url.toString();
}

export interface BabsSpriteIconProps {
  /** Atlas key: a bare catalogue id (`"1101"`), a pattern key, or a marker key. */
  spriteKey: string;
  /** Rendered edge length in px. Defaults to the atlas cell's natural size. */
  size?: number;
  /** Accessible name. Omit for a purely decorative icon. */
  title?: string;
  lang?: string;
  className?: string;
}

export function BabsSpriteIcon(props: BabsSpriteIconProps) {
  const { spriteKey, size, title, lang, className } = props;
  const cell = ATLAS[spriteKey];

  // An unknown key renders nothing rather than a broken box. The atlas-membership tests
  // are what stop this happening silently for keys we actually use.
  if (!cell) return null;

  const scale = size === undefined ? 1 : size / cell.width;
  const style: CSSProperties = {
    display: "inline-block",
    width: cell.width * scale,
    height: cell.height * scale,
    backgroundImage: `url(${sheetUrl(lang)})`,
    backgroundPosition: `-${cell.x * scale}px -${cell.y * scale}px`,
    backgroundSize: `${SHEET.width * scale}px ${SHEET.height * scale}px`,
    backgroundRepeat: "no-repeat",
  };

  return (
    <span
      className={className}
      style={style}
      title={title}
      role={title ? "img" : "presentation"}
      aria-label={title}
    />
  );
}
