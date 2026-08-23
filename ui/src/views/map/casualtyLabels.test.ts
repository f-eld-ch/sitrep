import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { aliasFor } from "components/babs/iconResolver";
import type { LayerProps } from "react-map-gl/maplibre";
import { describe, expect, it } from "vitest";
import { createMapStyle } from "./styleGenerator";

/**
 * Some icons get their name label placed differently from every other one: stretched inside
 * the symbol for Obdachlose/Eingesperrte and the hazard plate, offset to the right for
 * Tote/Vermisste/Verletzte, and the generic label must skip all of those.
 *
 * Which layer an icon lands on is not cosmetic. The stretched families sit on two layers
 * rather than one because `icon-text-fit-padding` is data-constant, and anything without
 * stretch metadata must stay off them entirely or it draws at full cell size.
 *
 * Those layers select on `properties.icon` with a literal filter, so unlike `icon-image`
 * there is no `match` expression resolving aliases for them. When features began storing
 * aliases instead of legacy German names, the filters kept listing only the legacy names —
 * so every newly placed casualty icon fell through to the generic label. This pins that
 * all three identifier forms select correctly.
 */

const TEXT_FIT_CASUALTY = "gl-draw-point-icon-text-fit-casualty";
const TEXT_FIT_PLATE = "gl-draw-point-icon-text-fit-plate";
const RIGHT = "gl-draw-text-special-placement-points-right";
const GENERIC = "gl-draw-text-name-point";

const LABEL_LAYERS = [TEXT_FIT_CASUALTY, TEXT_FIT_PLATE, RIGHT, GENERIC];

/**
 * id → the layer that should place its label.
 *
 * The two text-fit families are separate layers because `icon-text-fit-padding` is
 * data-constant: a round count badge and a wide hazard plate cannot share one value. Which
 * means an icon landing on the wrong one of them is a real bug, not a cosmetic detail.
 */
const EXPECTED_LAYER: Record<string, string> = {
  "1304": TEXT_FIT_CASUALTY, // Eingesperrte
  "1303": TEXT_FIT_CASUALTY, // Obdachlose
  "2109a": TEXT_FIT_PLATE, // Gefahrentafel ohne UN-Nummer
  // The catalogue's illustration of the plate rather than the plate itself, so it carries
  // no stretch metadata and cannot be fitted. Excluded from the picker; only legacy
  // features still hold it, and they fall through to the ordinary label.
  "2109b": GENERIC,
  "1305": RIGHT, // Tote
  "1302": RIGHT, // Vermisste
  // Verletzte carries stretch metadata too, but its count belongs beside the figure rather
  // than inside it, so it stays on the right-placement layer.
  "1301": RIGHT,
};

/** A non-casualty icon, which must take the generic label instead. */
const ORDINARY_ICON = "1101"; // Beschädigung

/** Not every icon has one: 2109a was never given a legacy German name. */
const LEGACY_NAMES: Record<string, string | undefined> = {
  "1304": "EingesperrteAbgeschnittene",
  "1303": "Obdachlose",
  "2109b": "GefahrentafelmitUNNummer",
  "1305": "Tote",
  "1302": "Vermisste",
  "1301": "Verletzte",
  "1101": "Beschaedigung",
};

/** Every identifier a feature could legitimately be carrying for this icon. */
function identifiersFor(id: string): [string, string][] {
  const legacy = LEGACY_NAMES[id];
  return [
    ...(legacy ? ([["legacy name", legacy]] as [string, string][]) : []),
    ["alias", aliasFor(id as never)],
    ["bare id", id],
  ];
}

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
    .filter((layer): layer is LayerProps & { id: string } => LABEL_LAYERS.includes(layer.id ?? ""))
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
    it.each(identifiersFor(id))(
      "is placed by its own layer when stored as a %s",
      (_form, identifier) => {
        expect(matchingLayers(identifier, forDraw)).toEqual([expectedLayer]);
      },
    );
  });

  it("gives an ordinary icon the generic label, and only that", () => {
    for (const [, identifier] of identifiersFor(ORDINARY_ICON)) {
      expect(matchingLayers(identifier, forDraw)).toEqual([GENERIC]);
    }
  });

  it("never places two labels on the same feature", () => {
    // The special layers and the generic one are mutually exclusive by construction; a
    // feature matching both would be labelled twice, in two different positions.
    for (const id of [...Object.keys(EXPECTED_LAYER), ORDINARY_ICON]) {
      for (const [, identifier] of identifiersFor(id)) {
        expect(matchingLayers(identifier, forDraw)).toHaveLength(1);
      }
    }
  });
});
