import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import type { DrawingLayerState } from "../LayerContext";
import {
  faDrawPolygon,
  faEdit,
  faClipboardList,
  faObjectGroup,
} from "@fortawesome/free-solid-svg-icons";
import { groupLayersForControl, hasOwnLayerGroup, layerIcon } from "./ActiveLayersControl";

function layerState(
  id: string,
  sourceIncidentId: string,
  sourceIncidentName: string,
): DrawingLayerState {
  return {
    layer: {
      id,
      sourceIncidentId,
      sourceIncidentName,
      name: id,
      kind: "STANDARD",
      incident: {} as Layer["incident"],
      features: [],
      createdAt: new Date(0),
      updatedAt: new Date(0),
      deletedAt: null as unknown as Date,
    },
    isVisible: true,
  };
}

describe("groupLayersForControl", () => {
  it("groups layers by source incident and marks inherited groups", () => {
    const groups = groupLayersForControl(
      [
        layerState("KFS Karte", "kfs", "KFS"),
        layerState("Führungskarte", "gfs-ahausen", "GFS Ahausen"),
        layerState("Nachrichtenkarte", "gfs-ahausen", "GFS Ahausen"),
        layerState("Nachrichtenkarte", "gfs-altdorf", "GFS Altdorf"),
      ],
      "kfs",
    );

    expect(groups.map((group) => group.sourceIncidentName)).toEqual([
      "KFS",
      "GFS Ahausen",
      "GFS Altdorf",
    ]);
    expect(groups.map((group) => group.isInherited)).toEqual([false, true, true]);
    expect(groups[1].layers.map((item) => item.layer.name)).toEqual([
      "Führungskarte",
      "Nachrichtenkarte",
    ]);
  });
});

describe("hasOwnLayerGroup", () => {
  it("returns false when only inherited layer groups are present", () => {
    const groups = groupLayersForControl(
      [layerState("Nachrichtenkarte", "gfs-altdorf", "GFS Altdorf")],
      "kfs",
    );

    expect(hasOwnLayerGroup(groups)).toBe(false);
  });
});

describe("layerIcon", () => {
  const standard = layerState("a", "inc-1", "One").layer;
  const messageMap: Layer = { ...standard, id: "m", kind: "MESSAGE_MAP" };

  it("marks the Nachrichtenkarte with its own icon, active or not, own or inherited", () => {
    expect(layerIcon(messageMap, false, undefined)).toBe(faClipboardList);
    expect(layerIcon(messageMap, false, "m")).toBe(faClipboardList);
    expect(layerIcon(messageMap, true, undefined)).toBe(faClipboardList);
  });

  it("keeps the usual icons for other layers", () => {
    expect(layerIcon(standard, false, undefined)).toBe(faDrawPolygon);
    expect(layerIcon(standard, false, "a")).toBe(faEdit);
    expect(layerIcon(standard, true, "a")).toBe(faObjectGroup);
  });
});
