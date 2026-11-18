// The source reference swisstopo requires for the Base Map tiles, in the four languages it is
// published in (https://www.geo.admin.ch/<lang>/vector-tiles-service-..., "Licence and terms of
// use"). The names of the federal offices differ per language, so the text follows the app language.
//
// The map shows a short form, "© swisstopo", that expands to the full list on a click (see
// ExpandableAttribution in Map.tsx). The full text stays in the markup and in the tooltip: the map
// export reads the text of the attribution control, so a printed map still carries every credit.
//
// MapLibre sanitizes attributions with a short allow list of tags and attributes and drops
// everything else *with its contents*, so this uses only <span>, class, role, title and aria-*.
// A <details> element, for example, would make the whole attribution vanish.
//
// The tiles' TileJSON (internal/core/domain/maptile, Attribution) carries the English wording for
// clients other than this UI; the styles blank it so only this text is shown.

type Lang = "de" | "en" | "fr" | "it";

const SHORT = "© swisstopo";

const CREDITS: Record<Lang, string> = {
  de: `${SHORT}, © EDA, © BAFU, © BABS, © SAC, © Naturfreunde Schweiz, © opentransportdata.swiss`,
  fr: `${SHORT}, © DFAE, © OFEV, © OFPP, © CAS, © Amis de la Nature Suisse, © opentransportdata.swiss`,
  it: `${SHORT}, © DFAE, © UFAM, © UFPP, © CAS, © Amici della Natura Svizzera, © opentransportdata.swiss`,
  en: `${SHORT}, © FDFA, © FOEN, © FOCP, © SAC, © Naturefriends Switzerland, © opentransportdata.swiss`,
};

/** German is the app's fallback language. */
const FALLBACK: Lang = "de";

/** The credits supported languages, e.g. "fr-CH" and "fr" both give "fr"; anything else gives German. */
function languageOf(language: string | undefined): Lang {
  const base = (language ?? "").slice(0, 2).toLowerCase();
  return base in CREDITS ? (base as Lang) : FALLBACK;
}

/** The complete source reference as plain text, in the given app language. */
export function swisstopoAttributionText(language: string | undefined): string {
  return CREDITS[languageOf(language)];
}

/** CSS class of the clickable short form; toggled with ATTRIBUTION_EXPANDED_CLASS. */
export const ATTRIBUTION_CLASS = "attrib-short";
export const ATTRIBUTION_EXPANDED_CLASS = "attrib-expanded";

/**
 * The attribution as shown on the map: "© swisstopo", with the other credits one click away, in the
 * given app language.
 */
export function swisstopoAttributionHtml(language: string | undefined): string {
  const text = swisstopoAttributionText(language);
  const rest = text.slice(SHORT.length); // starts with ", ", so the text reads on without a gap

  return (
    `<span class="${ATTRIBUTION_CLASS}" role="button" aria-expanded="false" title="${text}">` +
    `${SHORT}<span class="attrib-more">${rest}</span></span>`
  );
}

/**
 * Expands or folds the short attribution that `target` is part of. Returns whether the click was on
 * one, so callers can ignore every other click on the map.
 */
export function toggleAttributionAt(target: EventTarget | null): boolean {
  const short = (target as Element | null)?.closest?.(`.${ATTRIBUTION_CLASS}`);
  if (!short) return false;

  const expanded = short.classList.toggle(ATTRIBUTION_EXPANDED_CLASS);
  short.setAttribute("aria-expanded", String(expanded));

  return true;
}
