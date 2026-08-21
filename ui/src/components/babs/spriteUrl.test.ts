import { babsSpriteUrl } from "@f-eld-ch/babs-sprites";
import { afterEach, describe, expect, it } from "vitest";
import { BABS_SPRITE_BASE } from "./iconResolver";

/**
 * Regression guard for a user-visible 404.
 *
 * `babsSpriteUrl()` defaults to the *relative* base `"map/sprites"`, resolved against
 * `document.baseURI`. This app has no `<base>` tag, so on a nested route the atlas was
 * requested from `/incident/:id/map/sprites/...` and the map rendered no icons at all.
 * Every call site must therefore pass the root-absolute `BABS_SPRITE_BASE`.
 */

const NESTED_ROUTE = "/incident/945812d5-c078-4558-941f-03f8aaaf7a56/map";

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("BABS sprite URL", () => {
  it("is root-absolute, so it cannot resolve against the current route", () => {
    expect(BABS_SPRITE_BASE.startsWith("/")).toBe(true);
  });

  it("resolves to the site root even from a deeply nested route", () => {
    window.history.pushState({}, "", NESTED_ROUTE);

    const url = new URL(babsSpriteUrl("de", BABS_SPRITE_BASE));
    expect(url.pathname).toBe("/map/sprites/babs-de");
  });

  it("would regress without an explicit base (documents the failure mode)", () => {
    window.history.pushState({}, "", NESTED_ROUTE);

    // Not asserting on the buggy behaviour to endorse it — this pins *why* the explicit
    // base is required, so nobody removes it as redundant.
    const withDefaultBase = new URL(babsSpriteUrl("de"));
    expect(withDefaultBase.pathname).toBe(`${NESTED_ROUTE}/sprites/babs-de`);
  });

  it("keeps the cache-busting query, and admits a file extension before it", () => {
    const url = new URL(babsSpriteUrl("de", BABS_SPRITE_BASE));
    expect(url.search).not.toBe("");

    // How BabsSpriteIcon builds the PNG URL: the sprite URL is extensionless *and*
    // query-bearing, so appending ".png" to the string would corrupt it.
    url.pathname = `${url.pathname}.png`;
    expect(url.toString()).toBe(`${window.location.origin}/map/sprites/babs-de.png${url.search}`);
  });

  it.each(["de", "fr", "it"])("maps %s onto its own sheet", (lang) => {
    const url = new URL(babsSpriteUrl(lang, BABS_SPRITE_BASE));
    expect(url.pathname).toBe(`/map/sprites/babs-${lang}`);
  });

  it("falls back to the German sheet for a language BABS does not publish", () => {
    // resolveBabsLang maps anything unknown (notably "en") onto "de" by design.
    const url = new URL(babsSpriteUrl("en", BABS_SPRITE_BASE));
    expect(url.pathname).toBe("/map/sprites/babs-de");
  });
});
