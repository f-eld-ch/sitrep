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
import { EnrichLineStringMap } from "components/map/EnrichedLayerFeatures";
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
  /**
   * Feature property the expression branches on, without the mode prefix.
   *
   * Derived rather than assumed: `icon-image` is not always keyed on `icon`. The zone
   * symbol layer draws an icon but selects it by `zoneType`, so driving every icon layer
   * with an `icon` value would report it as broken when it is working correctly.
   */
  keyedOn: string;
}

/**
 * Reads the labels a `match` expression branches on.
 *
 * `["match", input, label, output, …, fallback]` — labels sit at even indices from 2.
 * Driving each layer with its own labels rather than a hand-kept list means a new zone or
 * line type is covered automatically, and no layer is asserted against values it was never
 * meant to handle.
 */
function matchLabels(expression: unknown): string[] {
  if (!Array.isArray(expression) || expression[0] !== "match") return [];
  const labels: string[] = [];
  for (let i = 2; i < expression.length - 1; i += 2) {
    const label: unknown = expression[i];
    if (typeof label === "string") labels.push(label);
  }
  return labels;
}

/** Finds the feature property an expression reads, e.g. `["get", "user_zoneType"]`. */
function keyOf(expression: unknown): string {
  const stack: unknown[] = [expression];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!Array.isArray(node)) continue;
    if (node[0] === "get" && typeof node[1] === "string") {
      return node[1].replace(/^user_/, "");
    }
    stack.push(...node);
  }
  return "";
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
            keyedOn: keyOf(container[property]),
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
/** Layers that select an image by the feature's `icon` property. */
const ICON_LAYERS = () =>
  ALL_EXPRESSIONS.filter((f) => f.property === "icon-image" && f.keyedOn === "icon");
/** Layers that select an image by `zoneType` or `lineType` — patterns, and zone symbols. */
const PATTERN_LAYERS = () =>
  ALL_EXPRESSIONS.filter((f) => f.keyedOn === "zoneType" || f.keyedOn === "lineType");

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

    it("resolves every zone and line type its own expression branches on", () => {
      // Driven by each layer's own match labels rather than a hand-kept list, so a new
      // zone or line type is covered automatically and no layer is asserted against
      // values it was never meant to handle.
      const unresolved: string[] = [];
      for (const found of PATTERN_LAYERS()) {
        for (const value of matchLabels(found.expression)) {
          const props = propsFor(found, found.keyedOn, value);
          if (!resolvesToRealImage(found, props, availableImages, availableSet)) {
            unresolved.push(`${found.layerId}: ${found.keyedOn}=${value}`);
          }
        }
      }
      expect(unresolved).toEqual([]);
    });

    it("covers the retired RutschgebietGespiegelt, so legacy features still render", () => {
      // No longer offered in the picker, but pre-existing features carry it.
      const lineLayers = PATTERN_LAYERS().filter((f) => f.property === "line-pattern");
      expect(lineLayers.length).toBeGreaterThan(0);
      const unresolved = lineLayers
        .filter(
          (found) =>
            !resolvesToRealImage(
              found,
              propsFor(found, "lineType", "RutschgebietGespiegelt"),
              availableImages,
              availableSet,
            ),
        )
        .map((found) => found.layerId);
      expect(unresolved).toEqual([]);
    });

    it("gives pattern layers a real fallback, and zone symbols none", () => {
      // A pattern must always draw something or the area reads as unstyled. A zone symbol
      // must not: most zones have no symbol, and inventing one would be wrong.
      const wrong: string[] = [];
      for (const found of PATTERN_LAYERS()) {
        const props = propsFor(found, found.keyedOn, "someFutureType");
        const resolved = resolvesToRealImage(found, props, availableImages, availableSet);
        const shouldFallBack = found.property !== "icon-image";
        if (resolved !== shouldFallBack) wrong.push(`${found.layerId} (${found.property})`);
      }
      expect(wrong).toEqual([]);
    });
  });

  describe.each(Object.entries(ATLASES))(
    "enriched line caps against the %s atlas",
    (_lang, atlas) => {
      it("uses only sprite images that exist", () => {
        // These caps are written straight onto synthetic features and read by a bare
        // ["get", "icon"], bypassing the match expression — so an unprefixed or mistyped
        // key here would be invisible to every other test in this file.
        const available = new Set(availableImagesFor(atlas));
        const missing = Object.entries(EnrichLineStringMap).flatMap(([lineType, config]) =>
          [config.iconStart, config.iconEnd]
            .filter((icon): icon is string => icon !== undefined)
            .filter((icon) => !available.has(icon))
            .map((icon) => `${lineType}: ${icon}`),
        );
        expect(missing).toEqual([]);
      });
    },
  );

  it("defines a cap for every line type that should have one", () => {
    // Guards against a cap silently disappearing during a refactor.
    const withCaps = Object.entries(EnrichLineStringMap).filter(
      ([, c]) => c.iconStart !== undefined || c.iconEnd !== undefined,
    );
    expect(withCaps).toHaveLength(Object.keys(EnrichLineStringMap).length);
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
