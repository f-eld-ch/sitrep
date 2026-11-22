import {
  type BabsIconId,
  type BabsLang,
  getCategory,
  getGroup,
  listIcons,
  resolveBabsLang,
} from "@f-eld-ch/babs-core";
import { isPickableCategory, isPickableIcon } from "./excludedIcons";
import { ICON_KEYWORDS } from "./iconKeywords";

/**
 * Typeahead search over the symbols the picker offers.
 *
 * What a query is matched against, strongest first: the symbol's name in the language of the
 * interface, words people use for it that the name does not contain (`ICON_KEYWORDS`, never
 * shown), the category and group it sits in (so "polizei zug" finds *Zug-P*, whose name only
 * carries the partner as a letter), and its names in the other languages.
 *
 * Every word of the query has to match somewhere; the words need not match the same field.
 * Numbers and the technical alias are deliberately not searchable: they mean nothing to the
 * people using the map.
 */

/** A matched stretch of the text as displayed: `[start, end)` indices into the original string. */
export type Range = readonly [start: number, end: number];

export interface IconHit {
  id: BabsIconId;
  /** The name as shown in the picker. */
  label: string;
  /** Where the query matched in `label`, for highlighting. */
  labelMatch: readonly Range[];
  /** Where the symbol sits: "Formationen › Polizei", or just the group when it says it all. */
  path: string;
  /** Where the query matched in `path`, for highlighting. */
  pathMatch: readonly Range[];
  score: number;
}

export type IconSearch = (query: string, limit?: number) => IconHit[];

// ── folding ──────────────────────────────────────────────────────────────────────────────────

interface Folded {
  /** Lower case, without accents, umlauts folded (ä and ae both become a), words split by one space. */
  text: string;
  /** For each character of `text`, the stretch of the original string it came from. */
  from: readonly number[];
  to: readonly number[];
}

const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Brings text and query to one spelling, so they can be compared.
 *
 * The catalogue spells the same sound both ways ("Beschaedigung", "Gebäude", "Überschwemmtes"),
 * and people type either. Both are therefore folded the same way: an umlaut loses its dots and
 * the transliteration "ae", "oe", "ue" collapses to one letter. The folding is applied to the
 * query as well, so it never has to be right linguistically, only the same on both sides.
 */
export function fold(input: string): Folded {
  const chars: string[] = [];
  const from: number[] = [];
  const to: number[] = [];

  const push = (c: string, start: number, end: number) => {
    if (c === " " && (chars.length === 0 || chars[chars.length - 1] === " ")) return;
    chars.push(c);
    from.push(start);
    to.push(end);
  };

  let index = 0;
  for (const original of input) {
    const start = index;
    index += original.length;

    let lower = original.toLowerCase();
    if (lower === "ß") lower = "ss";
    if (lower === "æ") lower = "ae";
    if (lower === "œ") lower = "oe";

    for (const c of lower.normalize("NFD").replace(COMBINING_MARKS, "")) {
      push(/[a-z0-9]/.test(c) ? c : " ", start, index);
    }
  }
  if (chars[chars.length - 1] === " ") {
    chars.pop();
    from.pop();
    to.pop();
  }

  // "ae", "oe", "ue" -> one letter, remembering both original characters for highlighting.
  const text: string[] = [];
  const outFrom: number[] = [];
  const outTo: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if ((c === "a" || c === "o" || c === "u") && chars[i + 1] === "e") {
      text.push(c);
      outFrom.push(from[i]);
      outTo.push(to[i + 1]);
      i++;
      continue;
    }
    text.push(c);
    outFrom.push(from[i]);
    outTo.push(to[i]);
  }

  return { text: text.join(""), from: outFrom, to: outTo };
}

// ── matching ─────────────────────────────────────────────────────────────────────────────────

type Kind = "exact" | "start" | "inside";
const KIND_WEIGHT: Record<Kind, number> = { exact: 1, start: 0.8, inside: 0.4 };

interface TokenMatch {
  kind: Kind;
  /** Index range in the folded text. */
  at: readonly [number, number];
}

/** The best way `token` occurs in `field`: as a whole word, at the start of one, or inside one. */
function matchToken(field: string, token: string): TokenMatch | undefined {
  if (field === "" || token === "") return undefined;

  let start: TokenMatch | undefined;
  let inside: TokenMatch | undefined;
  let wordStart = 0;
  while (wordStart <= field.length) {
    let wordEnd = field.indexOf(" ", wordStart);
    if (wordEnd === -1) wordEnd = field.length;
    const word = field.slice(wordStart, wordEnd);

    if (word === token) return { kind: "exact", at: [wordStart, wordEnd] };
    if (!start && word.startsWith(token)) {
      start = { kind: "start", at: [wordStart, wordStart + token.length] };
    }
    if (!inside) {
      const found = word.indexOf(token);
      if (found > 0)
        inside = { kind: "inside", at: [wordStart + found, wordStart + found + token.length] };
    }
    wordStart = wordEnd + 1;
  }

  return start ?? inside;
}

/** Maps a stretch of folded text back to the original string and merges neighbours. */
function toRanges(folded: Folded, matches: readonly (readonly [number, number])[]): Range[] {
  const ranges = matches
    .map(([a, b]): Range => [folded.from[a], folded.to[b - 1]])
    .sort((x, y) => x[0] - y[0]);

  const merged: [number, number][] = [];
  for (const [a, b] of ranges) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }

  return merged;
}

// ── index ────────────────────────────────────────────────────────────────────────────────────

const FIELD_WEIGHT = { label: 10, keyword: 7, path: 5, other: 3 } as const;

interface Entry {
  id: BabsIconId;
  label: string;
  labelFolded: Folded;
  path: string;
  pathFolded: Folded;
  keywords: string;
  other: string;
}

const LANGS: readonly BabsLang[] = ["de", "fr", "it"];

/**
 * "Formationen › Polizei" for a symbol of group Polizei in category Formationen. Where the group's
 * name already starts with the category's ("Auswirkungen von Schadenereignissen auf Gebiete"), or
 * is the same, the group alone says it.
 */
function pathOf(categoryLabel: string, groupLabel: string): string {
  const category = fold(categoryLabel).text;
  const group = fold(groupLabel).text;

  return group === category || group.startsWith(category + " ")
    ? groupLabel
    : `${categoryLabel} › ${groupLabel}`;
}

function buildEntries(lang: BabsLang): Entry[] {
  const entries: Entry[] = [];

  for (const meta of listIcons()) {
    if (!isPickableIcon(meta.id) || !isPickableCategory(meta.category)) continue;

    const label = meta.labels[lang] ?? meta.labels.de;
    const path = pathOf(getCategory(meta.category).labels[lang], getGroup(meta.group).labels[lang]);

    entries.push({
      id: meta.id,
      label,
      labelFolded: fold(label),
      path,
      pathFolded: fold(path),
      keywords: fold((ICON_KEYWORDS[meta.id] ?? []).join(" ")).text,
      other: fold(
        LANGS.filter((l) => l !== lang)
          .map(
            (l) =>
              `${meta.labels[l]} ${pathOf(getCategory(meta.category).labels[l], getGroup(meta.group).labels[l])}`,
          )
          .join(" "),
      ).text,
    });
  }

  return entries;
}

const searches = new Map<BabsLang, IconSearch>();

/** The search for one interface language. Built once per language, cheap afterwards. */
export function iconSearch(requestedLang: string | undefined): IconSearch {
  const lang = resolveBabsLang(requestedLang);
  const cached = searches.get(lang);
  if (cached) return cached;

  const entries = buildEntries(lang);

  const search: IconSearch = (query, limit = 50) => {
    const tokens = fold(query).text.split(" ").filter(Boolean);
    if (tokens.length === 0) return [];

    const hits: IconHit[] = [];

    for (const entry of entries) {
      let score = 0;
      const labelMatches: [number, number][] = [];
      const pathMatches: [number, number][] = [];
      let matchedAll = true;

      for (const token of tokens) {
        const inLabel = matchToken(entry.labelFolded.text, token);
        const inPath = matchToken(entry.pathFolded.text, token);
        const inKeywords = matchToken(entry.keywords, token);
        const inOther = matchToken(entry.other, token);

        const best = Math.max(
          inLabel ? FIELD_WEIGHT.label * KIND_WEIGHT[inLabel.kind] : 0,
          inKeywords ? FIELD_WEIGHT.keyword * KIND_WEIGHT[inKeywords.kind] : 0,
          inPath ? FIELD_WEIGHT.path * KIND_WEIGHT[inPath.kind] : 0,
          inOther ? FIELD_WEIGHT.other * KIND_WEIGHT[inOther.kind] : 0,
        );
        if (best === 0) {
          matchedAll = false;
          break;
        }

        score += best;
        if (inLabel) labelMatches.push([...inLabel.at]);
        if (inPath) pathMatches.push([...inPath.at]);
      }
      if (!matchedAll) continue;

      hits.push({
        id: entry.id,
        label: entry.label,
        labelMatch: toRanges(entry.labelFolded, labelMatches),
        path: entry.path,
        pathMatch: toRanges(entry.pathFolded, pathMatches),
        // A shorter name is the likelier meaning ("Brand" before "Brandübergriff, Gefahr").
        score: score - entry.label.length * 0.01,
      });
    }

    // Array.prototype.sort is stable: equal scores stay in catalogue order.
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  };

  searches.set(lang, search);

  return search;
}
