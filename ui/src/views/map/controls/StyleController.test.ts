import { describe, expect, it } from "vitest";
// oxlint-disable-next-line import/default -- a ?raw import has a default export
import domSource from "../../../../node_modules/maplibre-gl/src/util/dom.ts?raw";
import {
  swisstopoAttributionHtml,
  swisstopoAttributionText,
  toggleAttributionAt,
} from "../swisstopoAttribution";
import { MapStyles } from "./StyleController";

describe("MapStyles vector tile sources", () => {
  it.each(MapStyles.map((s) => [s.name, s] as const))(
    "%s loads its vector tiles from the sitrep tile endpoint with absolute URLs",
    (_name, { style }) => {
      const vectorUrls = Object.values(style.sources)
        .filter((s) => s.type === "vector")
        .map((s) => ("url" in s ? s.url : undefined));

      expect(vectorUrls.length).toBeGreaterThan(0);

      for (const url of vectorUrls) {
        expect(url).toMatch(
          /^https?:\/\/[^/]+\/api\/v2\/tiles\/ch\.swisstopo\.(base|relief)\.vt\/v1\.0\.0\/tiles\.json$/,
        );
      }
    },
  );

  it("never points at swisstopo directly for vector tiles", () => {
    expect(JSON.stringify(MapStyles.map((s) => s.style.sources))).not.toContain(
      "vectortiles.geo.admin.ch",
    );
  });
});

// The source reference swisstopo requires, as published on geo.admin.ch for each language
// (https://www.geo.admin.ch/<lang>/vector-tiles-service-...). The wording is pinned here so that
// shortening the display can never drop a credit or a translation.
const PUBLISHED = {
  de: "© swisstopo, © EDA, © BAFU, © BABS, © SAC, © Naturfreunde Schweiz, © opentransportdata.swiss",
  fr: "© swisstopo, © DFAE, © OFEV, © OFPP, © CAS, © Amis de la Nature Suisse, © opentransportdata.swiss",
  it: "© swisstopo, © DFAE, © UFAM, © UFPP, © CAS, © Amici della Natura Svizzera, © opentransportdata.swiss",
  en: "© swisstopo, © FDFA, © FOEN, © FOCP, © SAC, © Naturefriends Switzerland, © opentransportdata.swiss",
} as const;

const html = (language: string | undefined) => {
  const el = document.createElement("div");
  el.innerHTML = swisstopoAttributionHtml(language);
  return el;
};

describe("swisstopo attribution", () => {
  it.each(Object.entries(PUBLISHED))("is the published wording in %s", (language, text) => {
    expect(swisstopoAttributionText(language)).toBe(text);
    // Complete in the markup although only the short form is shown: the map export reads the text.
    expect(html(language).textContent).toBe(text);
    // ... and a hover shows the whole list too.
    expect(html(language).querySelector(".attrib-short")).toHaveAttribute("title", text);
  });

  it("follows the app language, including regional variants and the fallback", () => {
    expect(swisstopoAttributionText("fr-CH")).toBe(PUBLISHED.fr);
    expect(swisstopoAttributionText("IT")).toBe(PUBLISHED.it);
    expect(swisstopoAttributionText("en-US")).toBe(PUBLISHED.en);
    // German is the app's fallback language.
    expect(swisstopoAttributionText("rm")).toBe(PUBLISHED.de);
    expect(swisstopoAttributionText(undefined)).toBe(PUBLISHED.de);
    expect(swisstopoAttributionText("")).toBe(PUBLISHED.de);
  });

  it.each(Object.keys(PUBLISHED))(
    "starts folded in %s: only '© swisstopo' is always shown",
    (l) => {
      const short = html(l).querySelector(".attrib-short") as Element;

      expect(short.classList.contains("attrib-expanded")).toBe(false);
      expect(short.firstChild?.textContent).toBe("© swisstopo");
      expect(short.querySelector(".attrib-more")?.textContent).toBe(
        PUBLISHED[l as keyof typeof PUBLISHED].slice("© swisstopo".length),
      );
    },
  );

  it("expands and folds on a click, and reports the aria state", () => {
    const el = html("de");
    const short = el.querySelector(".attrib-short") as Element;
    const more = el.querySelector(".attrib-more") as Element;

    expect(toggleAttributionAt(more)).toBe(true); // a click on the expandable part counts
    expect(short.classList.contains("attrib-expanded")).toBe(true);
    expect(short).toHaveAttribute("aria-expanded", "true");

    expect(toggleAttributionAt(short)).toBe(true);
    expect(short.classList.contains("attrib-expanded")).toBe(false);
    expect(short).toHaveAttribute("aria-expanded", "false");
  });

  it("ignores clicks elsewhere on the map", () => {
    const el = document.createElement("div");
    el.innerHTML = "<div><span class='other'>x</span></div>";

    expect(toggleAttributionAt(el.querySelector(".other"))).toBe(false);
    expect(toggleAttributionAt(null)).toBe(false);
  });

  it("blanks the TileJSON's English wording on every sitrep vector source", () => {
    // A blank entry is not shown; the language-specific text comes from the attribution control.
    for (const { style } of MapStyles) {
      for (const source of Object.values(style.sources)) {
        if (source.type !== "vector") continue;
        expect("attribution" in source && source.attribution).toBe(" ");
      }
    }
  });
});

// MapLibre sanitizes attributions with an allow list and removes everything else together with its
// contents, so markup outside it makes the whole attribution vanish. The list is read from the
// installed MapLibre, so an upgrade that narrows it fails here instead of in the browser.
describe("swisstopo attribution and MapLibre's sanitizer", () => {
  const allowList = (name: string) => {
    const body = domSource.match(new RegExp(`${name} = new Set\\(\\[([^\\]]*)\\]`))?.[1] ?? "";
    return new Set([...body.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  };

  const tags = allowList("ALLOWED_TAGS");
  const attributes = allowList("ALLOWED_ATTRIBUTES");

  it("reads a plausible allow list from the installed MapLibre", () => {
    expect(tags.has("span")).toBe(true);
    expect(tags.has("details")).toBe(false);
    expect(attributes.has("title")).toBe(true);
  });

  it.each(Object.keys(PUBLISHED))("only uses allowed tags and attributes in %s", (language) => {
    const notAllowed: string[] = [];

    for (const el of html(language).querySelectorAll("*")) {
      if (!tags.has(el.localName)) notAllowed.push(`<${el.localName}>`);

      for (const name of el.getAttributeNames()) {
        if (!attributes.has(name) && !name.startsWith("aria-")) {
          notAllowed.push(`${name} on <${el.localName}>`);
        }
      }
    }

    expect(notAllowed).toEqual([]);
  });
});
