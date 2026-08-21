import type { BabsIconId } from "@f-eld-ch/babs-core";

/**
 * Legacy German icon names as persisted in `features.properties.icon` before the
 * `@f-eld-ch/babs-*` migration, mapped onto catalogue ids.
 *
 * FROZEN: every key here may exist in production data. Never remove one — a missing
 * entry silently degrades an existing feature to the chevron fallback. Adding is safe.
 *
 * Values are validated against `BabsIconId` at compile time by `satisfies`, so a typo
 * fails the build. Aliases are never hand-written here: they are derived from the id at
 * runtime (see `iconResolver.ts`), so an upstream alias rename cannot desync this file.
 *
 * Trailing comments give the catalogue label so a reviewer can check the pairing
 * without cross-referencing the package. `[hand]` marks a non-mechanical decision.
 */
export const LEGACY_ICON_IDS = {

  // ─── Category 1: Auswirkungen ───
  Beschaedigung: "1101", // Beschaedigung
  Teilzerstoerung: "1102", // Teilzerstoerung
  Totalzerstoerung: "1103", // Totalzerstoerung
  BrandeinzelnesGebaeudeFlamme: "1104", // Brand-einzelnes-Gebaeude-Flamme
  BranduebergriffGefahr: "1111a", // Brandübergriffsgefahr - Signatur — [hand] old registry split Signatur/Beispiel — (not pickable; insurance only)
  BranduebergriffErfolgt: "1111b", // Brandübergriff erfolgt - Signatur — [hand] old registry split Signatur/Beispiel — (not pickable; insurance only)
  Rutschgebiet: "1113", // Rutschgebiet — (not pickable; insurance only)
  Schadengebiet: "1114", // Schadengebiet - Schadenraum — [hand] was a zone thumbnail, not a pickable icon — (not pickable; insurance only)
  UeberschwemmtesGebiet: "1115", // Überschwemmtes Gebiet — (not pickable; insurance only)
  TruemmerbereichSignatur: "1116a", // Trümmerbereich - Signatur — (not pickable; insurance only)
  Strerschwertbefahrbarbegehbar: "1201", // Str erschwert befahrbar - begehbar — (not pickable; insurance only)
  Strnichtbefahrbarschwerbegehbar: "1202", // Str nicht befahrbar - schwer begehbar — (not pickable; insurance only)
  Strunpassierbargesperrt: "1203", // Str unpassierbar - gesperrt — (not pickable; insurance only)
  Verletzte: "1301", // Verletzte
  Vermisste: "1302", // Vermisste
  Obdachlose: "1303", // Obdachlose
  EingesperrteAbgeschnittene: "1304", // Eingesperrte — [hand] legacy name conflated "eingesperrt" + "abgeschnitten"
  Tote: "1305", // Tote

  // ─── Category 2: Gefahren ───
  Chemikalien: "2101", // Chemikalien Gefahr — [hand]
  GefahrElektrizitaet: "2102", // Elektrizität Gefahr — [hand]
  GefahrExplosion: "2103", // Explosion Gefahr — [hand]
  Gas: "2104", // Gas Gefahr — [hand]
  Unfall: "2105", // Unfall Gefahr — [hand]
  GefahrdurchLoeschenmitWasser: "2106", // Gefahr durch Löschen mit Wasser — [hand]
  RadioaktiveStoffe: "2107", // Radioaktive Stoffe Gefahr — [hand]
  GefahrfuerGrundwasser: "2108", // Gefahr für Grundwasser — [hand]
  GefahrentafelmitUNNummer: "2109b", // Gefahrentafel mit UN-Nummer

  // ─── Category 3: Zivile Führungsstandorte ───
  Einsatzleitung: "3101", // Einsatzleitung
  MobileEinsatzzentrale: "3102", // Mobile Einsatzzentrale
  KommandopostenFront: "3103", // Kommandoposten Front
  KommandopostenRueckwaertiges: "3104", // Kommandoposten Rückwärtiges
  Einsatzzentrale: "3105", // Einsatzzentrale
  ZivilesFuehrungsorgan: "3106", // Ziviles Führungsorgan
  Gemeindefuehrungsorgan: "3107", // Gemeindeführungsorgan
  RegionalesFuehrungsorgan: "3108", // Regionales Führungsorgan
  Bezirksfuehrungsorgan: "3109", // Bezirksführungsorgan
  KantonalesFuehrungsorgan: "3110", // Kantonales Führungsorgan

  // ─── Category 4: Formationen ───
  Trupp: "4801", // Trupp
  Gruppe: "4802", // Gruppe
  Zug: "4803", // Zug
  Kompanie: "4804", // Kompanie
  Einsatzleiter: "4806", // Einsatzleiter
  Gruppenfuehrer: "4807", // Gruppenführer
  OffizierZugfuehrer: "4808", // Offizier-Zugführer

  // ─── Category 5: Einrichtungen im Einsatzraum ───
  Verkehrsposten: "5101", // Verkehrsposten
  StandortmobileFuehrungsstelle: "5102", // Standort mobile Führungsstelle
  Sammelstelle: "5103", // Sammelstelle
  Betreuungsstelle: "5104", // Betreuungsstelle
  Patientensammelstelle: "5105", // Patientensammelstelle
  Verletztennest: "5105", // Patientensammelstelle — [hand] synonym: Verletztennest -> Patientensammelstelle (renamed terminology)
  Sanitaetshilfsstelle: "5106", // Sanitaetshilfsstelle
  Sanitaetsumladestelle: "5106", // Sanitaetshilfsstelle — [hand] APPROXIMATION, no exact successor; orphan atlas key, unreachable in practice — (not pickable; insurance only)
  BLaboratorium: "5108", // B Laboratorium
  ABCDekontaminationsstelle: "5109", // ABC Dekontaminationsstelle
  Totensammelstelle: "5111", // Totensammelstelle
  Verpflegungsabgabestelle: "5112", // Verpflegungsabgabestelle
  Betriebsstoffabgabestelle: "5113", // Betriebsstoffabgabestelle
  Informationsstelle: "5114", // Informationsstelle
  Informationszentrum: "5115", // Informationszentrum
  Debriefingstelle: "5116", // Debriefingstelle
  Angehoerigensammelstelle: "5117", // Angehörigensammelstelle
  Kadaversammelstelle: "5118", // Kadaversammelstelle
  Streugutsammelstelle: "5119", // Streugutsammelstelle
  Trinkwasserabgabestelle: "5120", // Trinkwasserabgabestelle
  Kontrollstelle: "5121", // Kontrollstelle
  Kontrollzentrum: "5122", // Kontrollzentrum
  Umleitung: "5123", // Umleitung
  Pforte: "5124", // Pforte
  AbsperrungVerkehrswege: "5125", // Absperrung Verkehrswege
  Einsatzraum: "5126", // Absperrung Einsatzraum — [hand] was a zone thumbnail, not a pickable icon — (not pickable; insurance only)
  Sperre: "5127", // Sperre
  Stuetzpunkt: "5128", // Stützpunkt
  Helikopterlandeplatz: "5129", // Helikopterlandeplatz
  Materialdepot: "5131", // Materialdepot
  Beobachtung: "5132a", // Beobachtung
  Ueberwachung: "5133", // Ueberwachung
  KGSNotlager: "5134", // KGS Notlager
  KGSNotdepot: "5135", // KGS-Notdepot
  KGSSammelpunkt: "5136", // KGS Sammelpunkt

  // ─── Category 6: Bewegungen ───
  BeabsichtigteVerschiebung: "6101a", // Beabsichtigte Verschiebung — (not pickable; insurance only)
  DurchgefuehrteVerschiebung: "6101b", // Durchgeführte Verschiebung — (not pickable; insurance only)
  BeabsichtigterEinsatz: "6102a", // Beabsichtigter Einsatz — (not pickable; insurance only)
  DurchgefuehrterEinsatz: "6102b", // Durchgeführter Einsatz — (not pickable; insurance only)
  BeabsichtigteErkundung: "6103a", // Beabsichtigte Erkundung — (not pickable; insurance only)
  DurchgefuehrteErkundung: "6103b", // Durchgeführte Erkundung — (not pickable; insurance only)
  RettungsAchse: "6106", // Rettungsachse — (not pickable; insurance only)

  // ─── Category 7: Fahrzeuge ───
  Wasserwerfer: "7115", // Wasserwerfer
  Tankloeschfahrzeug: "7118", // Tanklöschfahrzeug

  // ─── Category 8: Bildhafte Signaturen ───
  Sturm: "8101", // Sturm
  Starkniederschlag: "8102", // Starkniederschlag
  Ueberschwemmung: "8103", // Ueberschwemmung
  Erdrutsch: "8104", // Erdrutsch
  Lawine: "8105", // Lawine
  Erdbeben: "8106", // Erdbeben
  Duerre: "8107", // Dürre
  Epidemie: "8108", // Epidemie
  Tierseuche: "8109", // Tierseuche
  Brand: "8201", // Brand
  Explosion: "8202", // Explosion
  Stau: "8203", // Stau
  Autounfall: "8204", // Autounfall
  Eisenbahnunglueck: "8205", // Eisenbahnunglueck
  Energieausfall: "8207", // Energieausfall
  Kommunikationsstoerung: "8208", // Kommunikationsstörung
  Wasservsgausfall: "8209", // Ausfall Wasserversorgung — [hand]
  Kanalisationsausfall: "8210", // Kanalisationsausfall
  Atomunfall: "8211", // Atomunfall
  Biounfall: "8212", // Biounfall
  Chemieunfall: "8213", // Chemieunfall
  Oelverschmutzung: "8214", // Oelverschmutzung
  Infrastrukturschaden: "8215", // Infrastrukturschaden
  Gebaeudeeinsturz: "8219", // Gebaeudeeinsturz
  Pluenderung: "8301", // Pluenderung
  Demogewaltlos: "8305", // Demo-gewaltlos
  Demogewaltsam: "8306", // Demo-gewaltsam
  Terroranschlag: "8323", // Terroranschlag
  Bombendrohung: "8324", // Bombendrohung
  Bombenanschlag: "8325", // Bombenanschlag--
  Massenpanik: "8326", // Massenpanik
  Brandanschlag: "8327", // Brandanschlag
  Sabotage: "8328", // Sabotage
  Drohung: "8331", // Drohung
  Fluechtlinge: "8332", // Flüchtlinge
} as const satisfies Record<string, BabsIconId>;

/** Union of every legacy name known to have been persisted. */
export type LegacyIconName = keyof typeof LEGACY_ICON_IDS;

/**
 * Deliberately NOT mapped
 * ------------------------
 * `Einsatz`, `Verschiebung`
 *   Line-end cap glyphs from the non-pickable `Others` group. They only ever existed
 *   on synthetic start/end point features generated per render by
 *   `EnrichedLayerFeatures`, which are never persisted. Replaced by the purpose-built
 *   chevron markers. The catalogue has no plain equivalent either — only 6101a/b
 *   (Verschiebung) and 6102a/b (Einsatz), which are the beabsichtigt/durchgeführt
 *   line types already covered by `lineType`.
 *
 * `Flugzeugabsturz`
 *   Pickable in the old registry, and the only one of the 106 pickable names with no
 *   target in the 0.3.3 catalogue — group 82 (Technisch bedingte Lagen) covers car
 *   (8204), rail (8205) and ship (8216) but not air.
 *
 *   TODO(babs 0.3.5): add `Flugzeugabsturz: "8333"` once the dependency is bumped.
 *   The id cannot be written yet: `8333` is not in `BabsIconId` in 0.3.3 (83xx ends at
 *   8332), so `satisfies` would fail the build. `legacyIconNames.test.ts` asserts this
 *   automatically — it fails the moment `isBabsIconId("8333")` starts returning true,
 *   so the bump cannot land without completing the mapping.
 *
 *   Until then a legacy feature carrying this name renders the chevron fallback. The
 *   stored string is untouched, so nothing is lost and the fix is a one-line change.
 */
