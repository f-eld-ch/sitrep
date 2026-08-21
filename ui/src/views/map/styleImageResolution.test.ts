import {
  createPropertyExpression,
  latest,
  type StylePropertySpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { listIcons, markerSpriteKey } from "@f-eld-ch/babs-core";
import babsDe from "@f-eld-ch/babs-sprites/dist/babs-de.json";
import babsFr from "@f-eld-ch/babs-sprites/dist/babs-fr.json";
import babsIt from "@f-eld-ch/babs-sprites/dist/babs-it.json";
import type { LayerProps } from "react-map-gl/maplibre";
import { describe, expect, it } from "vitest";
import { babsImage } from "components/babs/iconResolver";
import { LEGACY_ICON_IDS } from "components/babs/legacyIconNames";
import basemap from "../../../public/map/sprites/basemap.json";
import { createMapStyle } from "./styleGenerator";

/**
 * Guards the property that actually matters: **every image our styles can request
 * exists in the sprite**. The sibling `styleGenerator.test.ts` asserts the style's
 * *shape* against a hardcoded fixture; this file asserts its *meaning*, and is the
 * test that catches an unprefixed sprite key or a hole in the legacy mapping.
 *
 * Runs fully offline — MapLibre's expression machinery is usable standalone, so no map
 * instance, canvas or WebGL is needed.
 */

/**
 * Mirrors `Style._getSpriteImageId` in maplibre-gl: images are namespaced
 * `<spriteId>:<key>` for every sprite except the one with id `default`. Replicating it
 * here is deliberate — if this diverges from MapLibre, the test must fail rather than
 * quietly agree with a broken style.
 */
const spriteImageId = (spriteId: string, key: string) =>
  spriteId === "default" ? key : `${spriteId}:${key}`;

const availableImagesFor = (babsAtlas: Record<string, unknown>) => [
  ...Object.keys(babsAtlas).map((k) => spriteImageId("babs", k)),
  ...Object.keys(basemap).map((k) => spriteImageId("default", k)),
];

const ATLASES = { de: babsDe, fr: babsFr, it: babsIt } as const;

/**
 * Spec entry for each image-valued property we emit, keyed by property name.
 *
 * Cast because the style spec is shipped as JSON, so its inferred type carries the
 * documentation fields (`doc`, `sdk-support`, …) and is wider than the
 * `StylePropertySpecification` union the parser accepts. These are the genuine spec
 * entries — taking them from `latest` rather than hand-writing them is the point.
 */
const IMAGE_PROPERTY_SPECS = {
  "icon-image": latest.layout_symbol["icon-image"] as unknown as StylePropertySpecification,
  "fill-pattern": latest.paint_fill["fill-pattern"] as unknown as StylePropertySpecification,
  "line-pattern": latest.paint_line["line-pattern"] as unknown as StylePropertySpecification,
} as const;

type ImageProperty = keyof typeof IMAGE_PROPERTY_SPECS;

interface FoundExpression {
  layerId: string;
  property: ImageProperty;
  expression: unknown;
}

/** Collects every image-valued expression across both style modes. */
function collectImageExpressions(): FoundExpression[] {
  const found: FoundExpression[] = [];
  for (const forDraw of [true, false]) {
    for (const layer of createMapStyle({ forDraw })) {
      const containers = [
        (layer as LayerProps & { layout?: Record<string, unknown> }).layout,
        (layer as LayerProps & { paint?: Record<string, unknown> }).paint,
      ];
      for (const container of containers) {
        if (!container) continue;
        for (const property of Object.keys(IMAGE_PROPERTY_SPECS) as ImageProperty[]) {
          if (container[property] === undefined) continue;
          found.push({
            layerId: `${layer.id}${forDraw ? " (draw)" : " (display)"}`,
            property,
            expression: container[property],
          });
        }
      }
    }
  }
  return found;
}

/**
 * Compiles an expression, failing loudly on a malformed one (e.g. bad `match` arity).
 *
 * Memoised: the icon expression carries ~630 match pairs and the suite evaluates it
 * thousands of times, so recompiling per evaluation is what makes this file slow enough
 * to trip the default test timeout under load.
 */
const compiledCache = new WeakMap<FoundExpression, ReturnType<typeof compileUncached>>();

function compileUncached(found: FoundExpression) {
  const result = createPropertyExpression(
    found.expression,
    found.property,
    IMAGE_PROPERTY_SPECS[found.property],
  );
  if (result.result === "error") {
    throw new Error(
      `${found.layerId} ${found.property} failed to compile: ` +
        result.value.map((e) => e.message).join("; "),
    );
  }
  return result.value;
}

function compile(found: FoundExpression) {
  const cached = compiledCache.get(found);
  if (cached) return cached;
  const compiled = compileUncached(found);
  compiledCache.set(found, compiled);
  return compiled;
}

/**
 * Evaluates to the image name the style would request, or null if it would request
 * nothing renderable.
 *
 * Deliberately returns the `name` without gating on the `available` flag: that flag is
 * only computed by the explicit `["image", …]` operator, so a bare string literal in a
 * `fill-pattern`/`line-pattern` position always reports `available: false` even when the
 * key is present in the atlas. Membership in the atlas is the property we actually care
 * about, and callers assert it.
 */
function resolveImageName(
  found: FoundExpression,
  properties: Record<string, unknown>,
  availableImages: string[],
): string | null {
  const out = compile(found).evaluate(
    { zoom: 14 } as never,
    { type: "Point", properties } as never,
    {},
    undefined,
    availableImages,
  );
  if (out === null || out === undefined) return null;
  // When `coalesce` exhausts its arguments it yields the *requested* name as a bare
  // string rather than a resolvedImage — which renders nothing. That is the silent-blank
  // failure mode this suite exists to catch, so report it as unresolved.
  if (typeof out === "string") return null;
  const { name } = out as { name: string; available: boolean };
  return name || null;
}

/**
 * True when the style would request an image that actually exists in the sprite.
 * Membership uses a Set: this runs tens of thousands of times across the suite.
 */
const resolvesToRealImage = (
  found: FoundExpression,
  properties: Record<string, unknown>,
  availableImages: string[],
  availableSet: ReadonlySet<string>,
) => {
  const name = resolveImageName(found, properties, availableImages);
  return name !== null && availableSet.has(name);
};

/**
 * Collected once so expression identities are stable across tests, which lets the
 * compile cache actually hit and keeps the whole suite well inside the default timeout.
 */
const ALL_EXPRESSIONS = collectImageExpressions();
const ICON_LAYERS = () => ALL_EXPRESSIONS.filter((f) => f.property === "icon-image");
const PATTERN_LAYERS = () => ALL_EXPRESSIONS.filter((f) => f.property !== "icon-image");

/** Strips the mode suffix and derives the property prefix the layer expects. */
const propsFor = (found: FoundExpression, key: string, value: string) =>
  found.layerId.includes("(draw)") ? { [`user_${key}`]: value } : { [key]: value };

describe("style image resolution", () => {
  it("emits at least one expression per image property (guards the collector itself)", () => {
    const byProperty = new Set(collectImageExpressions().map((f) => f.property));
    expect([...byProperty].sort()).toEqual(["fill-pattern", "icon-image", "line-pattern"]);
  });

  it("every expression compiles against the real style spec", () => {
    // Catches malformed `match` arity — the class of bug where a misplaced fallback
    // shifts every subsequent label/output pair.
    for (const found of collectImageExpressions()) expect(() => compile(found)).not.toThrow();
  });

  // `%s` interpolates the language into each test name, so failures identify the atlas
  // without every assertion needing to repeat it.
  describe.each(Object.entries(ATLASES))("against the %s atlas", (_lang, atlas) => {
    const availableImages = availableImagesFor(atlas);
    const availableSet = new Set(availableImages);

    it("resolves every legacy German icon name", () => {
      const unresolved: string[] = [];
      for (const found of ICON_LAYERS()) {
        for (const legacyName of Object.keys(LEGACY_ICON_IDS)) {
          const props = propsFor(found, "icon", legacyName);
          if (!resolvesToRealImage(found, props, availableImages, availableSet)) {
            unresolved.push(`${found.layerId}: ${legacyName}`);
          }
        }
      }
      expect(unresolved).toEqual([]);
    });

    it("resolves every catalogue alias and bare id", () => {
      const unresolved: string[] = [];
      for (const found of ICON_LAYERS()) {
        for (const meta of listIcons()) {
          for (const identifier of [meta.alias, meta.id]) {
            const props = propsFor(found, "icon", identifier);
            if (!resolvesToRealImage(found, props, availableImages, availableSet)) {
              unresolved.push(`${found.layerId}: ${identifier}`);
            }
          }
        }
      }
      expect(unresolved).toEqual([]);
    });

    it("falls back to a real chevron marker for an unknown icon", () => {
      // The regression this codebase never had: the old fallback was `default_marker`,
      // absent from every atlas, so an unknown icon rendered blank and silent.
      const expected = babsImage(markerSpriteKey("chevron-blue"));
      const wrong = ICON_LAYERS()
        .map((found) => ({
          layer: found.layerId,
          resolved: resolveImageName(
            found,
            propsFor(found, "icon", "definitelyNotAnIconName"),
            availableImages,
          ),
        }))
        .filter((r) => r.resolved !== expected);
      expect(wrong).toEqual([]);
    });

    it("resolves every zone and line type used by the pattern layers", () => {
      // Driven off the values the pattern expressions actually branch on, including the
      // retired `RutschgebietGespiegelt`, which must keep working for legacy features.
      const zoneTypes = ["Brandzone", "Zerstoerung"];
      const lineTypes = [
        "unpassierbar",
        "beabsichtigteErkundung",
        "durchgeführteErkundung",
        "Rutschgebiet",
        "RutschgebietGespiegelt",
        "rettungsAchse",
      ];
      const unresolved: string[] = [];
      for (const found of PATTERN_LAYERS()) {
        const [key, values] =
          found.property === "fill-pattern"
            ? (["zoneType", zoneTypes] as const)
            : (["lineType", lineTypes] as const);
        for (const value of values) {
          if (!resolvesToRealImage(found, propsFor(found, key, value), availableImages, availableSet)) {
            unresolved.push(`${found.layerId}: ${key}=${value}`);
          }
        }
      }
      expect(unresolved).toEqual([]);
    });

    it("falls back to a real pattern for an unknown zone or line type", () => {
      const wrong = PATTERN_LAYERS()
        .filter((found) => {
          const key = found.property === "fill-pattern" ? "zoneType" : "lineType";
          return !resolvesToRealImage(
            found,
            propsFor(found, key, "someFutureType"),
            availableImages,
            availableSet,
          );
        })
        .map((found) => found.layerId);
      expect(wrong).toEqual([]);
    });
  });

  it("references no image literal that is missing from the atlas", () => {
    // Catch-all sweep: every `babs:`-prefixed string appearing anywhere in the generated
    // style must exist. This is what would have flagged `default_marker` years ago, and
    // what flags an unprefixed key produced by a bare markerSpriteKey/patternSpriteKey.
    const atlasKeys = new Set(availableImagesFor(babsDe));
    const referenced = new Set<string>();
    const walk = (node: unknown) => {
      if (typeof node === "string") {
        if (node.startsWith("babs:") || node.endsWith("-pattern") || node.startsWith("marker-"))
          referenced.add(node);
        return;
      }
      if (Array.isArray(node)) node.forEach(walk);
    };
    for (const found of collectImageExpressions()) walk(found.expression);

    expect(referenced.size).toBeGreaterThan(0);
    const missing = [...referenced].filter((key) => !atlasKeys.has(key));
    expect(missing).toEqual([]);
  });
});
