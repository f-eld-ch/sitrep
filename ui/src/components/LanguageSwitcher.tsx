import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { useTranslation } from "react-i18next";

/**
 * Languages offered in the UI.
 *
 * English is deliberately absent: the BABS symbol catalogue has no English labels
 * (`resolveBabsLang` maps anything unknown onto German), so an English UI would be half
 * translated. It stays available via the `?lang=en` querystring for anyone who wants it.
 *
 * Labelled with autonyms rather than translated names — a language picker that names
 * languages in a language you may not read is not much use, and it is the convention.
 */
const LANGUAGES = [
  { code: "de", short: "DE", name: "Deutsch" },
  { code: "fr", short: "FR", name: "Français" },
  { code: "it", short: "IT", name: "Italiano" },
] as const;

/**
 * Compact language picker for the settings dropdown.
 *
 * A segmented control rather than a cycling toggle like the dark-mode switch: with three
 * options, cycling makes reaching the third a guessing game, and the current language is
 * worth showing rather than inferring from the surrounding text.
 */
function LanguageSwitcher() {
  const { i18n } = useTranslation();

  // resolvedLanguage collapses regional variants, so "de-CH" matches the "de" button.
  const active = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div className="navbar-item">
      <span className="icon-text is-flex-wrap-nowrap">
        <span className="icon">
          <FontAwesomeIcon icon={faGlobe} />
        </span>
        {/* `mb-0` because Bulma's .buttons carries a bottom margin meant for standalone
            groups, which misaligns it against the icon inside a navbar item. */}
        <span className="buttons has-addons are-small mb-0">
          {LANGUAGES.map((language) => {
            const isActive = active === language.code;
            return (
              <button
                key={language.code}
                type="button"
                className={classNames("button", "is-small", {
                  "is-primary is-selected": isActive,
                })}
                // The autonym is the accessible name; the visible label is an abbreviation.
                title={language.name}
                aria-label={language.name}
                // aria-pressed rather than aria-current: these are toggle buttons, not
                // navigation. Screen readers then announce which language is in effect.
                aria-pressed={isActive}
                lang={language.code}
                onClick={() => {
                  if (isActive) return;
                  // Persisted by i18next-browser-languagedetector, which caches to
                  // session and local storage on change (see i18n/index.ts detection).
                  void i18n.changeLanguage(language.code);
                }}
              >
                {language.short}
              </button>
            );
          })}
        </span>
      </span>
    </div>
  );
}

export default LanguageSwitcher;
export { LANGUAGES };
