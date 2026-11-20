// Shared helpers for the documentation screenshots.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export const BASE_URL = process.env.SITREP_URL ?? "http://localhost:4181";
export const OUT_DIR = process.env.SHOT_DIR ?? join(import.meta.dirname, "out");
export const INCIDENT_NAME = "Unwetter Bergdorf – Murgang Dorfbach";

export type Lang = "de" | "fr" | "it";
export const LANGS: Lang[] = ["de", "fr", "it"];

/** Look up a UI string of the app, so locators work in every language (dotted keys). */
export function translations(lang: Lang): (key: string, vars?: Record<string, string | number>) => string {
  const file = join(import.meta.dirname, "../../../ui/src/i18n/locales", lang, "translations.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return (key, vars) => {
    let cur: unknown = data;
    for (const part of key.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[part];
    if (typeof cur !== "string") throw new Error(`missing translation ${lang}:${key}`);
    return Object.entries(vars ?? {}).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)), cur);
  };
}

export interface Session {
  lang: Lang;
  t: ReturnType<typeof translations>;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  incidentId: string;
}

async function gql<T>(query: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v2/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = (await res.json()) as { data: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

/** The id of an incident by its name (the example data comes from the seed). */
export async function incidentIdByName(name: string): Promise<string> {
  const { incidents } = await gql<{ incidents: { id: string; name: string }[] }>("{ incidents { id name } }");
  const found = incidents.find((i) => i.name === name);
  if (!found) throw new Error(`incident "${name}" not found`);
  return found.id;
}

export async function start(lang: Lang, width = 1600, height = 1000): Promise<Session> {
  const { incidents } = await gql<{ incidents: { id: string; name: string }[] }>("{ incidents { id name } }");
  const incident = incidents.find((i) => i.name === INCIDENT_NAME);
  if (!incident) throw new Error(`incident "${INCIDENT_NAME}" not found; run ../start.sh --reset`);

  // --lang makes native controls (the date and time input) use the language of the screenshots.
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium-browser",
    headless: true,
    args: [`--lang=${lang}-CH`],
    env: { ...process.env, LANG: `${lang}_CH.UTF-8`, LC_ALL: `${lang}_CH.UTF-8`, LANGUAGE: `${lang}_CH:${lang}` },
  });
  const context = await browser.newContext({
    viewport: { width, height },
    locale: `${lang}-CH`,
    timezoneId: "Europe/Zurich",
    colorScheme: "light",
  });
  // Feature flags come from an external service; without it the defaults apply, like for most users.
  await context.route("https://flipt.sitrep.ch/**", (route) => route.abort());
  const page = await context.newPage();
  return { lang, t: translations(lang), browser, context, page, incidentId: incident.id };
}

export function url(s: Session, path: string): string {
  return `${BASE_URL}/incident/${s.incidentId}/${path}?lang=${s.lang}`;
}

/** Save a PNG and a WebP (quality 85, at most 1600px wide) named like the docs expect. */
export interface ShotOptions {
  clip?: { x: number; y: number; width: number; height: number };
  fullPage?: boolean;
}

export async function shot(s: Session | Page, name: string, opts: ShotOptions = {}): Promise<void> {
  const page = "page" in s ? s.page : s;
  const lang = "lang" in s ? s.lang : "de";
  const dir = join(OUT_DIR, lang);
  mkdirSync(join(dir, name, ".."), { recursive: true });
  const png = join(dir, `${name}.png`);
  const webp = join(dir, `${name}.webp`);
  await page.screenshot({ path: png, clip: opts.clip, fullPage: opts.fullPage });
  execFileSync("magick", [png, "-resize", "1600x>", "-quality", "85", webp]);
  console.log("shot", lang, name);
}
