import {
  type BabsIconHit,
  type BabsIconSearch,
  type BabsSearchRange,
  createIconSearch,
  resolveBabsLang,
  type BabsLang,
} from "@f-eld-ch/babs-core";
import { isPickableCategory, isPickableIcon } from "./excludedIcons";

/**
 * Typeahead search over the symbols the picker offers. The matching itself (folding of umlauts,
 * every word must match, weighted names, keywords and groups) lives in `@f-eld-ch/babs-core`;
 * this only limits it to the symbols a point can be given here.
 */
export type Range = BabsSearchRange;
export type IconHit = BabsIconHit;
export type IconSearch = BabsIconSearch;

const searches = new Map<BabsLang, IconSearch>();

/** The search for one interface language. Built once per language, cheap afterwards. */
export function iconSearch(requestedLang: string | undefined): IconSearch {
  const lang = resolveBabsLang(requestedLang);
  const cached = searches.get(lang);
  if (cached) return cached;

  const search = createIconSearch({
    lang,
    filter: (meta) => isPickableIcon(meta.id) && isPickableCategory(meta.category),
  });
  searches.set(lang, search);

  return search;
}
