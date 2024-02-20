import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import LanguageDetector from 'i18next-browser-languagedetector';

import { de, en, fr, it } from './locales';


i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: 'de',
        resources: {
            en: {
                translations: en,
            },
            de: {
                translations: de,
            },
            fr: {
                translations: fr,
            },
            it: {
                translations: it,
            }
        },
        ns: ['translations'],
        defaultNS: 'translations',
        detection: {
            // order and from where user language should be detected
            order: ['querystring', 'sessionStorage', 'localStorage', 'navigator'],
            lookupQuerystring: 'lang',
            caches: ['sessionStorage', 'localStorage'],
            lookupSessionStorage: 'lang',
            lookupLocalStorage: "lang",
            excludeCacheFor: ['cimode'], // languages to not persist (cookie, localStorage)
        }
    });

i18n.languages = ['de', 'en', 'fr', 'it'];

export default i18n;