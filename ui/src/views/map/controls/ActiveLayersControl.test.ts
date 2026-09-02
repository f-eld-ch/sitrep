import { describe, expect, it } from "vitest";
import type { Layer } from "types/layer";
import type { DrawingLayerState } from "../LayerContext";
import { groupLayersForControl } from "./ActiveLayersControl";

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
