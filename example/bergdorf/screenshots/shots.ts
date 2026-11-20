// Take the documentation screenshots of the example incident, in one language.
//
//   node shots.ts de base editor      # sections, in order; a section may change the data
//   node shots.ts all                 # every language, each on a fresh database (see run-all.sh)
//
// Run it against a freshly seeded database (../start.sh --reset): the sections that follow
// "base" play the tutorials and change the data. Output: out/<lang>/<name>.webp.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import { BASE_URL, OUT_DIR, incidentIdByName, shot, start, url, type Lang, type Session } from "./lib.ts";

/** Day of the operation: the same as the seed (SEED_DATE), default 2026-11-04. */
const DAY = process.env.SEED_DATE ?? "2026-11-04";

// ---- helpers ---------------------------------------------------------------------------------

const settle = async (p: Page, ms = 500) => {
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(ms);
};

async function open(s: Session, path: string, ms = 800) {
  await s.page.goto(url(s, path));
  await settle(s.page, ms);
}

/** Clip around the editor card (heading to preview), independent of the list on the right. */
const EDITOR_CLIP = { x: 16, y: 56, width: 780, height: 840 };

// ---- sections --------------------------------------------------------------------------------

/** Read-only pages on the seeded data. */
async function base(s: Session) {
  await open(s, "journal/messages");
  await shot(s, "einsatzjournal/journal-uebersicht");

  await open(s, "resources", 1200);
  await shot(s, "triage/mitteltabelle", { fullPage: true });

  await open(s, "casualties");
  await shot(s, "triage/personenuebersicht", { clip: { x: 0, y: 0, width: 1600, height: 520 } });

  await open(s, "dashboard", 1500);
  await shot(s, "triage/dashboard");
}

async function fillCommon(s: Session, time: string, content: string) {
  const p = s.page;
  await p.getByRole("textbox", { name: s.t("message.time"), exact: true }).fill(time);
  await p.locator(".w-md-editor-text-input").fill(content);
  await p.waitForTimeout(600);
}

/** The Editor forms per communication type, and the two tutorial messages. */
async function editor(s: Session) {
  const p = s.page;
  const medium = p.getByLabel(s.t("mediumName"));
  const party = (key: string) => p.getByRole("textbox", { name: s.t(key), exact: true });

  // Funk
  await open(s, "journal/edit");
  await medium.selectOption("RADIO");
  await p.getByRole("textbox", { name: s.t("radioChannel") }).first().fill("Kanal 1");
  await party("message.receiver").fill("Gemeindeführungsstab");
  await party("message.sender").fill("Feuerwehr Bergdorf");
  await fillCommon(s, `${DAY}T08:32`, "Zug 1 ist weiterhin im Einsatz. Keine neuen Vermissten.");
  await shot(s, "einsatzjournal/editor-funk", { clip: EDITOR_CLIP });

  // E-Mail
  await open(s, "journal/edit");
  await medium.selectOption("EMAIL");
  await party("email.sender").fill("Kantonaler Führungsstab");
  await p.getByLabel(s.t("emailAddress")).nth(0).fill("fuehrungsstab@kanton.example");
  await party("email.receiver").fill("Gemeindeführungsstab");
  await p.getByLabel(s.t("emailAddress")).nth(1).fill("gfs@bergdorf.example");
  await fillCommon(s, `${DAY}T08:45`, "Bitte bis 09:30 Lagemeldung einreichen.");
  await shot(s, "einsatzjournal/editor-email", { clip: EDITOR_CLIP });

  // Andere
  await open(s, "journal/edit");
  await medium.selectOption("OTHER");
  await party("message.sender").fill("Gemeindepräsident");
  await party("message.receiver").fill("Gemeindeführungsstab");
  await p.getByLabel(s.t("otherDetails")).first().fill("persönlich im Führungsraum");
  await fillCommon(s, `${DAY}T08:50`, "Der Gemeindepräsident verlangt um 10:00 eine Orientierung.");
  await shot(s, "einsatzjournal/editor-andere", { clip: EDITOR_CLIP });

  // Telefon: tutorial message 12, then 13
  await tutorialMessage(s, "08:41", "Im Oberdorf wurden 3 weitere Personen mit leichten Verletzungen versorgt. Eine zusätzliche Sanitätsgruppe mit 6 Personen ist aufgeboten und in 20 Minuten einsatzbereit.", "editor-telefon");
  await shot(s, "einsatzjournal/editor-liste", { clip: { x: 800, y: 56, width: 800, height: 944 } });
  await tutorialMessage(s, "08:52", "Sanitätsgruppe 2 ist eingetroffen und übernimmt Erstversorgung und Transport an der Dorfstrasse.");

  // Bearbeiten: load a pending message into the form
  await open(s, "journal/edit");
  await p.getByTestId("edit-button").first().click();
  await p.waitForTimeout(600);
  await shot(s, "einsatzjournal/editor-bearbeiten", { clip: EDITOR_CLIP });
  await p.getByRole("button", { name: s.t("close") }).first().click().catch(() => {});

  // Anhang
  const pdf = join(OUT_DIR, "Lageplan-Dorfstrasse.pdf");
  writeFileSync(pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  await open(s, "journal/edit");
  await medium.selectOption("PHONE");
  await party("message.receiver").fill("Gemeindeführungsstab");
  await p.getByLabel(s.t("phoneNumber")).nth(0).fill("041 555 00 00");
  await party("phone.sender").fill("Feuerwehr Bergdorf");
  await p.getByLabel(s.t("phoneNumber")).nth(1).fill("041 555 04 04");
  await fillCommon(s, `${DAY}T08:55`, "Foto vom Schadenplatz an der Dorfstrasse, siehe Anhang.");
  await p.locator("input[type=file]").first().setInputFiles(pdf);
  await p.waitForTimeout(600);
  await shot(s, "einsatzjournal/editor-anhang", { clip: EDITOR_CLIP });
}

async function tutorialMessage(s: Session, hhmm: string, content: string, shotName?: string) {
  const p = s.page;
  await open(s, "journal/edit");
  await p.getByLabel(s.t("mediumName")).selectOption("PHONE");
  await p.getByRole("textbox", { name: s.t("message.receiver"), exact: true }).fill("Gemeindeführungsstab");
  await p.getByLabel(s.t("phoneNumber")).nth(0).fill("041 555 00 00");
  await p.getByRole("textbox", { name: s.t("phone.sender"), exact: true }).fill("Sanität Region Bergdorf");
  await p.getByLabel(s.t("phoneNumber")).nth(1).fill("144");
  await fillCommon(s, `${DAY}T${hhmm}`, content);
  if (shotName) await shot(s, `einsatzjournal/${shotName}`, { clip: EDITOR_CLIP });
  await p.getByRole("button", { name: s.t("save"), exact: true }).click();
  await settle(p, 1200);
}

/** Triage of the two tutorial messages (12 and 13). */
async function triage(s: Session) {
  const p = s.page;
  const next = () => p.getByRole("button", { name: s.t("next"), exact: true }).click().then(() => p.waitForTimeout(500));
  /** The "+" of a division chip in the Meldefluss step. */
  const addDivision = (label: string) =>
    p.locator("span", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::button").click();

  await open(s, "journal/triage", 1500);

  // Message 11 (the canton's request) is triaged first, so that "next pending" leads to message 13.
  await p.getByRole("button", { name: /Bitte bis 09:30 Lagemeldung/ }).click();
  await p.waitForTimeout(600);
  await next(); // Meldefluss
  await addDivision("C Lage");
  await addDivision("Stabschef");
  await next(); // Personen
  await next(); // Mittel
  await p.getByRole("button", { name: s.t("saveTriage"), exact: true }).click();
  await settle(p, 800);

  await p.getByRole("button", { name: /Im Oberdorf wurden 3 weitere/ }).click();
  await p.waitForTimeout(800);
  await shot(s, "triage/triage-1-meldung");
  await next();

  await addDivision("C Lage");
  await addDivision("Chef Einsatz");
  await p.waitForTimeout(300);
  await shot(s, "triage/triage-2-meldefluss");
  await next();

  await p.getByRole("spinbutton", { name: s.t("casualties.verletzte"), exact: true }).fill("3");
  await p.waitForTimeout(400);
  await shot(s, "triage/triage-3-personen");
  await next();

  await p.getByRole("button", { name: /^\+ / }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "San", exact: true }).click();
  await p.getByRole("textbox", { name: s.t("resource.fields.homeLocation") }).fill("Region Bergdorf");
  await p.getByRole("textbox", { name: s.t("resource.fields.name"), exact: true }).fill("Gruppe 2");
  await p.getByRole("spinbutton", { name: s.t("resource.fields.personnelCount"), exact: true }).fill("6");
  await p.waitForTimeout(500);
  await shot(s, "triage/triage-4-mittel-aufbieten");
  await p.getByRole("button", { name: s.t("resource.addResource"), exact: true }).click();
  await settle(p, 1000);
  await shot(s, "triage/triage-4-mittel-liste");

  await p.getByRole("button", { name: s.t("saveTriage"), exact: true }).click();
  await settle(p, 1000);
  await shot(s, "triage/triage-gespeichert");

  // ---- message 13: the resource arrives and is deployed ----
  const edit = () => p.getByRole("button", { name: s.t("edit"), exact: true }).first().click().then(() => p.waitForTimeout(500));
  await p.getByRole("button", { name: s.t("triageNextPending", { number: 13 }) }).click();
  await p.waitForTimeout(800);
  await next(); // Meldefluss
  await addDivision("C Lage");
  await addDivision("Nachrichtenkarte");
  await next(); // Personen
  await next(); // Mittel

  await p.getByRole("searchbox", { name: s.t("resource.search") }).fill("Gruppe 2");
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /Gruppe 2/ }).first().click(); // add to the message
  await p.waitForTimeout(600);
  await edit();
  await shot(s, "triage/triage-mittel-aufgeboten");
  await p.getByRole("button", { name: s.t("resource.actions.markReady"), exact: true }).click();
  await p.waitForTimeout(900);

  await edit();
  await p.getByRole("textbox", { name: s.t("resource.fields.hauptaufgabe") }).fill("Erstversorgung und Transport");
  await p.getByRole("textbox", { name: s.t("resource.fields.deploymentLocation") }).fill("Dorfstrasse");
  // leaving the field saves the Einsatzort; no focus ring in the screenshot
  await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await p.waitForTimeout(900);
  await shot(s, "triage/triage-mittel-einsetzen");
  await p.getByRole("button", { name: s.t("resource.actions.deploy"), exact: true }).click();
  await p.waitForTimeout(1000);

  await edit();
  await shot(s, "triage/triage-mittel-eingesetzt");
  await p.getByRole("button", { name: s.t("close"), exact: true }).first().click().catch(() => {});
  await p.getByRole("button", { name: s.t("saveTriage"), exact: true }).click();
  await settle(p, 1000);

  // Summary of a triaged message, with "Triage anpassen"
  await open(s, "journal/triage", 1500);
  await p.getByRole("button", { name: /Sanitätsgruppe 2 ist eingetroffen/ }).click();
  await p.getByRole("button", { name: s.t("triageAdjust"), exact: true }).waitFor();
  await p.getByText("Gruppe 2").first().waitFor(); // the linked resources load a moment later
  await p.waitForTimeout(800);
  await shot(s, "triage/triage-zusammenfassung");
}

/** Results of the tutorials: the overviews after message 13. */
async function results(s: Session) {
  await open(s, "casualties");
  await shot(s, "triage/personenuebersicht-nach-tutorial", { clip: { x: 0, y: 0, width: 1600, height: 520 } });
  await open(s, "resources", 1200);
  await shot(s, "triage/mitteltabelle-nach-tutorial", { fullPage: true });
}

/** Relieve, reactivate and correct a resource (changes the data; run after "results"). */
async function mittelExtras(s: Session) {
  const p = s.page;
  await open(s, "journal/triage", 1500);
  await p.getByRole("button", { name: /Sanitätsgruppe 2 ist eingetroffen/ }).click();
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: s.t("triageAdjust"), exact: true }).click();
  await p.waitForTimeout(600);
  await p.getByRole("navigation", { name: "steps" }).getByRole("button", { name: s.t("stepMittel") }).click();
  await p.waitForTimeout(800);

  // The resource of this message (Gruppe 2, eingesetzt); select it when it is not shown as selected
  const editButton = p.getByRole("button", { name: s.t("edit"), exact: true }).first();
  if (!(await editButton.isVisible({ timeout: 2500 }).catch(() => false))) {
    await p.getByRole("searchbox", { name: s.t("resource.search") }).fill("Gruppe 2");
    await p.getByRole("button", { name: /Gruppe 2/ }).first().click();
    await p.waitForTimeout(600);
  }
  await editButton.click();
  await p.waitForTimeout(500);

  await p.getByRole("button", { name: s.t("resource.editDetails") }).first().click();
  await p.waitForTimeout(500);
  await shot(s, "triage/triage-mittel-angaben-korrigieren");
  await p.getByRole("button", { name: s.t("resource.editDetails") }).first().click();

  // option labels contain the Ortsbezeichnung: pick the one of Feuerwehr Oberdorf
  const successor = p.getByRole("combobox").last();
  const label = await successor.locator("option", { hasText: "Oberdorf" }).first().textContent();
  await successor.selectOption({ label: label ?? "" });
  await p.waitForTimeout(400);
  await shot(s, "triage/triage-mittel-abloesen");
  await p.getByRole("button", { name: s.t("resource.actions.relieve"), exact: true }).click();
  await p.waitForTimeout(1200);

  // Remove the relieved resource from this message: it then shows up under "Abgelöst" and can be
  // brought back (reactivated).
  await p.locator("div").filter({ hasText: new RegExp(`Gruppe 2.*${s.t("resource.status.ABGELOEST")}`) }).getByRole("button", { name: s.t("close"), exact: true }).first().click();
  await p.waitForTimeout(600);
  const relieved = p.getByRole("button", { name: new RegExp(s.t("resource.relievedSection")) }).first();
  await relieved.click();
  await relieved.scrollIntoViewIfNeeded();
  await p.getByRole("button", { name: s.t("resource.actions.reactivate") }).first().scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await shot(s, "triage/triage-mittel-abgeloest");
}

/** Put the map of the workplace over Bergdorf (Attinghausen, Chummetbach): search, zoom out, pan. */
async function goToBergdorf(p: Page) {
  const input = p.locator(".maplibregl-map input").first();
  await input.click();
  await input.fill("Attinghausen Dorfstrasse");
  await p.waitForTimeout(2500);
  await p.getByText("Attinghausen (UR)").first().click();
  await p.waitForTimeout(4500);
  await p.mouse.move(1000, 640);
  await p.mouse.wheel(0, 240);
  await p.waitForTimeout(2000);
  for (const [from, to] of [[[1100, 880], [1000, 600]], [[1000, 880], [930, 560]]] as const) {
    await p.mouse.move(from[0], from[1]);
    await p.mouse.down();
    await p.mouse.move(to[0], to[1], { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(1500);
  }
  await p.waitForTimeout(1500);
}

/** Lagebild and Nachrichtenkarte (needs the drawing from features.json and "triage"). */
async function lagebild(s: Session) {
  const p = s.page;

  // Lagebild with the timeline at "Live" and at an earlier point
  await open(s, "map", 4000);
  await shot(s, "lagebild/lagebild-zeitstrahl");
  for (let i = 0; i < 4; i++) {
    await p.getByRole("button", { name: s.t("mapTimeline.previous") }).click();
    await p.waitForTimeout(500);
  }
  await p.waitForTimeout(1500);
  await shot(s, "lagebild/lagebild-zeitstrahl-frueher");

  // Layer menu with "Layer hinzufügen"
  await open(s, "map", 3500);
  await p.locator(".maplibregl-ctrl-bottom-right button").nth(1).click();
  await p.waitForTimeout(700);
  await p.getByRole("button", { name: s.t("layerControl.addLayer") }).click().catch(() => {});
  await p.waitForTimeout(500);
  await p.getByPlaceholder(s.t("layerControl.layerName")).fill("Führung").catch(() => {});
  await p.waitForTimeout(300);
  await shot(s, "lagebild/lagebild-layer-menue");

  // Nachrichtenkarte workplace: message 13 is the oldest one still to draw
  await open(s, "journal/messagemap", 3500);
  await goToBergdorf(p);
  await shot(s, "lagebild/nachrichtenkarte-arbeitsplatz");

  // A drawn message with its changes highlighted (message 9 changed two objects), locked
  await p.getByRole("button", { name: s.t("messageMap.showAll") }).click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /Vermisste Person im Keller Dorfstrasse 14 gefunden/ }).click();
  await p.waitForTimeout(3000);
  await shot(s, "lagebild/nachrichtenkarte-gezeichnet");
  await p.getByRole("button", { name: s.t("messageMap.edit"), exact: true }).click();
  await p.waitForTimeout(1500);
  await shot(s, "lagebild/nachrichtenkarte-aendern");
}


/**
 * Ressorts that the tutorial adds besides the defaults (Name, Kürzel). The defaults are hard-coded in
 * the app and follow the language of the browser; these two are typed in, so each language has its
 * own wording (the names are the app's labels of the formations Feuerwehr and Sanität; the
 * abbreviations are those of the BABS set, Sanität as agreed with "SAN").
 */
const EXTRA_DIVISIONS: Record<Lang, [[string, string], [string, string]]> = {
  de: [["Feuerwehr", "FW"], ["Sanität", "SAN"]],
  fr: [["Sapeurs-pompiers", "SP"], ["Services sanitaires", "SAN"]],
  it: [["Pompieri", "CP"], ["Servizi sanitari", "SAN"]],
};

const CANTONAL = "Unwetter Kanton – Kantonales Führungsorgan";
const TUTORIAL_INCIDENT = "Übung Seeburg";

/** Create, edit, close, reopen and delete an incident, and a parent incident with its children. */
async function ereignis(s: Session) {
  const p = s.page;
  const listUrl = `${BASE_URL}/incident/list?lang=${s.lang}`;
  const toList = async () => {
    await p.goto(listUrl);
    await settle(p, 1200);
  };
  const card = (name: string) => p.getByRole("heading", { name, exact: false }).first().locator("xpath=ancestor::*[.//button][1]");
  /** Clip from the top of the page to the bottom of an element, so that nothing is cut or empty. */
  const through = async (loc: Locator) => {
    const box = await loc.boundingBox();
    return { x: 0, y: 0, width: 1600, height: Math.ceil((box?.y ?? 560) + (box?.height ?? 0)) + 24 };
  };
  const lastCard = () => p.getByRole("heading", { level: 4 }).last().locator("xpath=ancestor::*[.//button][1]");
  const formCard = () => p.getByRole("button", { name: s.t("save"), exact: true }).locator("xpath=ancestor::div[contains(@class,'rounded')][1]");
  await p.setViewportSize({ width: 1600, height: 1100 });

  // The cantonal incident adds up its regional ones (before the tutorial incident exists)
  const cantonId = await incidentIdByName(CANTONAL);
  await p.goto(`${BASE_URL}/incident/${cantonId}/casualties?lang=${s.lang}`);
  await settle(p, 1500);
  await shot(s, "ereignis/uebergeordnet-personen", { clip: await through(p.getByRole("heading", { level: 2 }).last().locator("xpath=following::div[1]")) });
  await p.goto(`${BASE_URL}/incident/${cantonId}/resources?lang=${s.lang}`);
  await settle(p, 1500);
  await shot(s, "ereignis/uebergeordnet-mittel", { clip: { x: 0, y: 0, width: 1600, height: 540 } });

  // The list: open incidents, then with the closed ones
  await toList();
  await shot(s, "ereignis/ereignisliste", { clip: await through(lastCard()) });
  await p.getByRole("button", { name: s.t("showClosed") }).click();
  await p.waitForTimeout(600);
  await shot(s, "ereignis/ereignisliste-geschlossene", { clip: await through(lastCard()) });
  await p.getByRole("button", { name: s.t("hideClosed") }).click();

  // Create
  await p.getByRole("button", { name: s.t("create"), exact: true }).click();
  await p.waitForTimeout(1200);
  await shot(s, "ereignis/ereignis-formular-leer", { clip: await through(formCard()) });
  await p.getByPlaceholder(s.t("name")).first().fill(TUTORIAL_INCIDENT);
  await p.getByPlaceholder(s.t("location"), { exact: true }).fill("Seeburg");
  for (const [name, short] of EXTRA_DIVISIONS[s.lang]) {
    await p.getByPlaceholder(s.t("name")).last().fill(name);
    await p.getByPlaceholder(s.t("short")).last().fill(short);
    await p.getByRole("button", { name: s.t("add"), exact: true }).click();
    await p.waitForTimeout(300);
  }
  await p.waitForTimeout(400);
  await shot(s, "ereignis/ereignis-formular-ausgefuellt", { clip: await through(formCard()) });
  await p.getByRole("button", { name: s.t("save"), exact: true }).click();
  await settle(p, 1500);

  // The menu of the incident: its name in the navigation bar opens "Dashboard" and "Ereignis bearbeiten"
  await p.locator("nav a").nth(1).hover();
  await p.waitForTimeout(700);
  await shot(s, "ereignis/ereignis-menue", { clip: { x: 0, y: 0, width: 1600, height: 150 } });
  await p.mouse.move(800, 600);

  // Edit: location and the parent incident
  await toList();
  await card(TUTORIAL_INCIDENT).getByRole("button", { name: s.t("edit"), exact: true }).click();
  await p.waitForTimeout(1200);
  await p.getByPlaceholder(s.t("location"), { exact: true }).fill("Seeburg Hafen");
  await shot(s, "ereignis/ereignis-bearbeiten-formular", { clip: await through(formCard()) });
  await p.getByRole("combobox", { name: s.t("parentIncident") }).selectOption({ label: CANTONAL });
  await p.waitForTimeout(400);
  await shot(s, "ereignis/ereignis-uebergeordnet-gewaehlt", { clip: await through(formCard()) });
  await p.getByRole("button", { name: s.t("save"), exact: true }).click();
  await settle(p, 1500);

  await toList();
  await shot(s, "ereignis/ereignisliste-hierarchie", { clip: await through(lastCard()) });

  // Close: the card of a closed incident, and what is blocked in it
  await card(TUTORIAL_INCIDENT).getByRole("button", { name: s.t("close"), exact: true }).click();
  await p.waitForTimeout(1200);
  await p.getByRole("button", { name: s.t("showClosed") }).click();
  await p.waitForTimeout(800);
  await shot(s, "ereignis/ereignis-karte-geschlossen", { clip: await through(lastCard()) });
  await card(TUTORIAL_INCIDENT).getByRole("button", { name: s.t("enter"), exact: true }).click();
  await settle(p, 1200);
  await p.goto(p.url().replace(/\/dashboard.*$/, `/journal/edit?lang=${s.lang}`));
  await settle(p, 1500);
  await shot(s, "ereignis/ereignis-geschlossen-hinweis", { clip: { x: 0, y: 0, width: 1600, height: 560 } });

  // Reopen, close again and delete
  await toList();
  await p.getByRole("button", { name: s.t("showClosed") }).click();
  await p.waitForTimeout(600);
  await card(TUTORIAL_INCIDENT).getByRole("button", { name: s.t("open"), exact: true }).click();
  await p.waitForTimeout(1200);
  await card(TUTORIAL_INCIDENT).getByRole("button", { name: s.t("close"), exact: true }).click();
  await p.waitForTimeout(1200);
  await card(TUTORIAL_INCIDENT).getByRole("button", { name: s.t("delete"), exact: true }).click();
  await p.waitForTimeout(1500);
  await shot(s, "ereignis/ereignisliste-nach-loeschen", { clip: await through(lastCard()) });
}

// ---- main ------------------------------------------------------------------------------------

const sections: Record<string, (s: Session) => Promise<void>> = { base, editor, triage, results, mittelExtras, lagebild, ereignis };

const [lang, ...wanted] = process.argv.slice(2) as [Lang, ...string[]];
const s = await start(lang);
try {
  for (const name of wanted.length ? wanted : Object.keys(sections)) {
    const run = sections[name];
    if (!run) throw new Error(`unknown section ${name}`);
    console.log("section", name);
    await run(s);
  }
} finally {
  await s.browser.close();
}
