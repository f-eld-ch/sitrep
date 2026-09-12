import { faGlobe } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
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
    <div className="flex items-center gap-2 px-4 py-2">
      <FontAwesomeIcon icon={faGlobe} />
      <div className="flex overflow-hidden rounded border border-border">
        {LANGUAGES.map((language) => {
          const isActive = active === language.code;
          return (
            <button
              key={language.code}
              type="button"
              className={clsx(
                "px-2 py-0.5 text-xs font-medium transition-colors",
                isActive ? "bg-primary text-white" : "bg-bg text-fg hover:bg-bg-subtle",
              )}
              title={language.name}
              aria-label={language.name}
              aria-pressed={isActive}
              lang={language.code}
              onClick={() => {
                if (isActive) return;
                void i18n.changeLanguage(language.code);
              }}
            >
              {language.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default LanguageSwitcher;
export { LANGUAGES };
