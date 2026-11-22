import type { BabsIconId } from "@f-eld-ch/babs-core";

/**
 * Words people use for a symbol that its catalogue name does not contain.
 *
 * They are only ever used to find a symbol: the picker never shows them. Matching is
 * insensitive to case, accents and the umlaut spellings (see `iconSearch.ts`), so write them
 * naturally.
 *
 * This is a seed written from the catalogue's names, not a reviewed vocabulary. It is German
 * only: French and Italian searches still match the names in their own language, and also the
 * German names and these words. Whoever knows the field language should extend it.
 *
 * Typed as `BabsIconId`, so an id that disappears from the catalogue fails to compile instead of
 * leaving a dead entry. Icons the picker does not offer (see `excludedIcons.ts`) are not listed.
 */
export const ICON_KEYWORDS: Partial<Record<BabsIconId, readonly string[]>> = {
  // Auswirkungen
  "1101": ["kaputt", "defekt", "beschädigt", "schaden"],
  "1102": ["kaputt", "zerstört", "teilweise", "einsturz"],
  "1103": ["kaputt", "zerstört", "eingestürzt", "komplett"],
  "1104": ["feuer", "flamme", "gebäudebrand", "hausbrand"],
  "1105a": ["detonation", "knall"],
  "1301": ["verwundet", "verletzt", "schwerverletzt", "patient", "patienten"],
  "1302": ["vermisst", "abgängig", "gesucht"],
  "1303": ["evakuiert", "notunterkunft", "unterkunft"],
  "1304": ["eingeklemmt", "verschüttet", "verschüttete", "gefangen"],
  "1305": ["leiche", "leichen", "todesopfer", "verstorben", "gestorben"],
  // Gefahren
  "2101": ["gefahrgut", "chemie", "gift"],
  "2102": ["strom", "stromschlag", "hochspannung"],
  "2103": ["knall", "detonation", "sprengung"],
  "2104": ["gasleck", "gasaustritt", "erdgas"],
  "2105": ["verkehrsunfall", "crash"],
  "2107": ["strahlung", "atom", "radioaktiv"],
  // Führungsstandorte
  "3101": ["el", "leitung", "führung", "kommando"],
  "3103": ["kp front", "kommandoposten", "führungsstelle"],
  "3105": ["zentrale", "leitstelle"],
  // Einrichtungen im Einsatzraum
  "5101": ["verkehr", "verkehrsdienst", "regelung", "posten"],
  "5103": ["treffpunkt", "sammelplatz", "besammlung"],
  "5105": ["pasa", "verletztensammelstelle", "sanität"],
  "5111": ["leichen", "tote", "tote sammeln"],
  "5112": ["essen", "verpflegung", "küche"],
  "5120": ["wasserverteilung", "trinkwasser", "wasser"],
  "5123": ["umfahrung", "ableitung", "umleiten"],
  "5125": ["gesperrt", "strassensperre", "sperrung", "absperren"],
  "5127": ["gesperrt", "absperrung", "barriere", "sperrung"],
  "5129": ["heli", "landeplatz", "hubschrauber", "rega"],
  "5131": ["lager", "depot", "material"],
  // Bewegungen
  "6104": ["suche", "absuchen", "durchkämmen"],
  "6106": ["zufahrt", "anfahrt", "rettungsweg"],
  "6108": ["bergung", "retten"],
  // Fahrzeuge
  "7101": ["töff", "motorrad"],
  "7102": ["schiff", "kahn", "wasserfahrzeug"],
  "7105": ["lkw", "camion", "lastwagen"],
  "7113": ["heli", "hubschrauber", "rega", "luftrettung"],
  "7114": ["sanität", "rettung", "krankenwagen", "rettungswagen", "sanka"],
  "7116": ["drehleiter", "hubretter", "leiter"],
  "7117": ["drehleiter", "adl", "leiter"],
  "7118": ["tlf", "feuerwehr", "löschfahrzeug", "tanklöscher"],
  // Bildhafte Signaturen
  "8101": ["unwetter", "wind", "orkan", "gewitter"],
  "8102": ["regen", "unwetter", "hagel", "gewitter", "wolkenbruch"],
  "8103": ["hochwasser", "flut", "überflutung", "überflutet", "wasser"],
  "8104": ["hangrutsch", "rutschung", "murgang", "erdrutsch"],
  "8105": ["schnee", "lawinenniedergang"],
  "8106": ["beben", "erschütterung"],
  "8201": ["feuer", "flamme", "flammen", "brandausbruch"],
  "8202": ["knall", "detonation", "sprengung"],
  "8203": ["verkehrsstau", "kolonne", "stockender verkehr"],
  "8204": ["unfall", "verkehrsunfall", "crash", "kollision"],
  "8205": ["bahn", "zug", "zugunglück", "entgleisung", "bahnunfall"],
  "8207": ["stromausfall", "blackout", "strom"],
  "8209": ["wasser", "wasserausfall", "trinkwasser"],
  "8210": ["abwasser", "kanal", "kanalisation"],
  "8211": ["strahlung", "atom", "kernkraftwerk"],
  "8213": ["gefahrgut", "chemikalien", "austritt", "chemie"],
  "8214": ["öl", "ölunfall", "gewässerverschmutzung"],
  "8219": ["einsturz", "eingestürzt", "haus", "gebäude"],
  "8222": ["fischsterben", "verschmutzung", "wasser"],
  "8308": ["prügelei", "streit", "gewalt"],
  "8321": ["schüsse", "schusswaffe", "schiessen"],
  "8322": ["amoklauf", "amokläufer"],
  "8323": ["terror", "anschlag"],
  "8327": ["feuer", "brandstiftung", "anschlag"],
  "8333": ["absturz", "flugzeug", "flieger"],
  // Spezial
  "9101b": ["a1", "nationalstrasse", "autobahnsperre", "gesperrt"],
};
