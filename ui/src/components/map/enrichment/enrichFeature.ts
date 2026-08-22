import bearing from "@turf/bearing";
import { point } from "@turf/helpers";
import type { Feature, Position } from "geojson";
import { buildFlowArrow } from "./flowArrow";
import { EnrichLineStringMap, EnrichPolygonMap } from "./registry";
import { buildSlideArrow } from "./slideArrow";
import type { SyntheticFeature } from "./types";

/**
 * A cap at one end of a line.
 *
 * Rotated to the bearing from that end *towards its neighbour* — inwards, at both ends —
 * which is why the configured offset is added here where the arrow builders subtract it.
 */
const capFeature = (
  parentId: Feature["id"],
  kind: "start" | "end",
  at: Position,
  towards: Position,
  icon: string,
  iconRotation: number,
): SyntheticFeature => {
  const cap = point(at);
  cap.id = `${parentId}:${kind}`;
  cap.properties = {
    parent: parentId,
    // Already a fully-namespaced sprite id; do not prefix again.
    icon,
    iconRotation: bearing(point(at), point(towards)) + iconRotation,
  };
  return cap;
};

/**
 * The extra features a stored feature is drawn with, derived from its own geometry.
 *
 * Returns only the synthetic additions — never the feature itself, which the draw and display
 * sources render. An unregistered line or zone type yields nothing.
 */
export const enrichFeature = (f: SyntheticFeature): SyntheticFeature[] => {
  if (f === undefined) {
    return [];
  }

  const features: SyntheticFeature[] = [];

  // A single-coordinate LineString can arrive via import, and every path below reads at least
  // two vertices.
  if (f.geometry.type === "LineString" && f.geometry.coordinates.length >= 2) {
    const enrich = EnrichLineStringMap[f.properties?.lineType];
    const coordinates = f.geometry.coordinates;
    const last = coordinates.length - 1;

    if (enrich?.iconStart) {
      features.push(
        capFeature(
          f.id,
          "start",
          coordinates[0],
          coordinates[1],
          enrich.iconStart,
          enrich.iconRotation,
        ),
      );
    }
    if (enrich?.iconEnd) {
      features.push(
        capFeature(
          f.id,
          "end",
          coordinates[last],
          coordinates[last - 1],
          enrich.iconEnd,
          enrich.iconRotation,
        ),
      );
    }
    if (enrich?.slideArrow) {
      features.push(...buildSlideArrow(f.id, coordinates, enrich.slideArrow, f.properties?.color));
    }
  }

  if (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") {
    const flowArrow = EnrichPolygonMap[f.properties?.zoneType]?.flowArrow;
    if (flowArrow !== undefined) {
      // Outer rings only. A hole is interior detail, and an arrow springing off one would
      // point into the zone rather than out of it.
      const outerRings: Position[][] =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates[0]]
          : f.geometry.coordinates.map((part) => part[0]);

      outerRings.forEach((ring, index) => {
        if (ring === undefined) {
          return;
        }
        features.push(
          // A multipart zone gets one arrow per part, so the synthetic ids must stay distinct.
          ...buildFlowArrow(
            f.id,
            outerRings.length > 1 ? `flow-${index}` : "flow",
            ring,
            flowArrow,
            f.properties?.color,
          ),
        );
      });
    }
  }

  return features;
};
