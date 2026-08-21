import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { aliasFor } from "components/babs/iconResolver";
import type { LayerProps } from "react-map-gl/maplibre";
import { describe, expect, it } from "vitest";
import { createMapStyle } from "./styleGenerator";

/**
 * The casualty-count icons get their name label placed differently from every other icon:
 * centred over the symbol for Eingesperrte/Obdachlose, offset to the right for
 * Tote/Vermisste/Verletzte, and the generic label must skip all five.
 *
 * Those three layers select on `properties.icon` with a literal filter, so unlike
 * `icon-image` there is no `match` expression resolving aliases for them. When features
 * began storing aliases instead of legacy German names, the filters kept listing only the
 * legacy names — so every newly placed casualty icon fell through to the generic label.
 * This pins that all three identifier forms select correctly.
 */

const CENTRED = "gl-draw-text-special-placement-points-center";
const RIGHT = "gl-draw-text-special-placement-points-right";
const GENERIC = "gl-draw-text-name-point";

/** id → the layer that should place its label. */
const EXPECTED_LAYER: Record<string, string> = {
  "1304": CENTRED, // Eingesperrte
  "1303": CENTRED, // Obdachlose
  "1305": RIGHT, // Tote
  "1302": RIGHT, // Vermisste
  "1301": RIGHT, // Verletzte
};

/** A non-casualty icon, which must take the generic label instead. */
const ORDINARY_ICON = "1101"; // Beschädigung

const LEGACY_NAMES: Record<string, string> = {
  "1304": "EingesperrteAbgeschnittene",
  "1303": "Obdachlose",
  "1305": "Tote",
  "1302": "Vermisste",
  "1301": "Verletzte",
  "1101": "Beschaedigung",
};

/** Which of the three text layers accept a point feature carrying this icon. */
function matchingLayers(icon: string, forDraw: boolean): string[] {
  const prefix = forDraw ? "user_" : "";
  const feature = {
    type: 1 as const,
    // The layers also require a name and a colour to be present.
    properties: {
      [`${prefix}icon`]: icon,
      [`${prefix}name`]: "12",
      [`${prefix}color`]: "#ff0000",
      // Draw-mode filters additionally gate on these.
      active: "false",
      meta: "feature",
      mode: "simple_select",
    },
  };
  return createMapStyle({ forDraw })
    .filter((layer): layer is LayerProps & { id: string } =>
      [CENTRED, RIGHT, GENERIC].includes(layer.id ?? ""),
    )
    .filter((layer) => {
      const filter = (layer as { filter?: unknown }).filter;
      // rootKey is only used to locate errors in messages; any stable label works.
      return featureFilter(filter as never, `layers.${layer.id}.filter`).filter(
        { zoom: 14 } as never,
        feature as never,
      );
    })
    .map((layer) => layer.id);
}

describe.each([
  ["draw", true],
  ["display", false],
])("casualty label placement (%s mode)", (_mode, forDraw) => {
  describe.each(Object.entries(EXPECTED_LAYER))("icon %s", (id, expectedLayer) => {
    // Every identifier a feature could legitimately be carrying.
    it.each([
      ["legacy name", LEGACY_NAMES[id]],
      ["alias", aliasFor(id as never)],
      ["bare id", id],
    ])("is placed by its own layer when stored as a %s", (_form, identifier) => {
      expect(matchingLayers(identifier, forDraw)).toEqual([expectedLayer]);
    });
  });

  it("gives an ordinary icon the generic label, and only that", () => {
    for (const identifier of [
      LEGACY_NAMES[ORDINARY_ICON],
      aliasFor(ORDINARY_ICON as never),
      ORDINARY_ICON,
    ]) {
      expect(matchingLayers(identifier, forDraw)).toEqual([GENERIC]);
    }
  });

  it("never places two labels on the same feature", () => {
    // The special layers and the generic one are mutually exclusive by construction; a
    // feature matching both would be labelled twice, in two different positions.
    for (const id of [...Object.keys(EXPECTED_LAYER), ORDINARY_ICON]) {
      for (const identifier of [LEGACY_NAMES[id], aliasFor(id as never), id]) {
        expect(matchingLayers(identifier, forDraw)).toHaveLength(1);
      }
    }
  });
});
