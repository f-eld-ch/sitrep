import type { GeoJsonProperties, Geometry } from "geojson";

/** What a message did to a feature: put it on the map, changed it, or took it off again. */
export type HaloKind = "added" | "modified" | "removed";

export interface FeatureHalo {
  kind: HaloKind;
  /** Where the feature was when the message was done with it; used to bring it into view. */
  geometry?: Geometry;
  /** Where a removed feature last was, since it is no longer on the map. */
  lastGeometry?: Geometry;
  /** How a removed feature last looked. */
  lastProperties?: GeoJsonProperties;
}

export interface HistoryChange {
  featureId: string;
  change: "PLACED" | "MOVED" | "RESTYLED" | "REMOVED" | "RESTORED";
  effectiveAt: string | Date;
  recordedAt: string | Date;
  messageId?: string | null;
  geometry?: Geometry | null;
  properties?: GeoJsonProperties;
}

const isRemoveOrRestore = (c: HistoryChange) => c.change === "REMOVED" || c.change === "RESTORED";

/**
 * What the message did to each feature it touched. A feature the message placed is "added", even
 * if the same message also modified it; one it removed is "removed"; anything else is "modified".
 * A feature both placed and removed by the message left nothing behind and is left out, and so is
 * one it removed and brought back. One it only brought back is "added".
 */
export function messageFeatureHalos(
  changes: readonly HistoryChange[],
  messageId: string,
): Map<string, FeatureHalo> {
  const byFeature = new Map<string, HistoryChange[]>();
  for (const c of changes) {
    byFeature.set(c.featureId, [...(byFeature.get(c.featureId) ?? []), c]);
  }

  const halos = new Map<string, FeatureHalo>();
  for (const [featureId, all] of byFeature) {
    const history = [...all].sort(
      (a, b) =>
        new Date(a.effectiveAt).getTime() - new Date(b.effectiveAt).getTime() ||
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    );
    const own = history.filter((c) => c.messageId === messageId);
    if (own.length === 0) continue;

    const lastOwn = history.lastIndexOf(own[own.length - 1]);
    const geometry =
      [...history.slice(0, lastOwn + 1)].reverse().find((c) => c.geometry)?.geometry ?? undefined;
    const placed = own.some((c) => c.change === "PLACED");

    // Where the message left the feature: gone, or on the map. Taking it away and bringing it back
    // within the same message cancels out.
    let removed = false;
    let removedHere = false;
    let restoredHere = false;
    for (const c of own) {
      if (c.change === "REMOVED") {
        removed = true;
        removedHere = true;
      } else if (c.change === "RESTORED") {
        removed = false;
        restoredHere = true;
      }
    }

    if (removed) {
      if (placed) continue;

      const removedAt = history.reduce(
        (found, c, i) => (c.change === "REMOVED" && c.messageId === messageId ? i : found),
        -1,
      );
      const before = history.slice(0, removedAt).reverse();
      halos.set(featureId, {
        kind: "removed",
        geometry,
        lastGeometry: before.find((c) => c.geometry)?.geometry ?? undefined,
        lastProperties: before.find((c) => c.properties)?.properties ?? undefined,
      });
      continue;
    }

    // Restored by this message after it removed it itself: nothing changed.
    if (removedHere && restoredHere && !placed && own.every(isRemoveOrRestore)) continue;

    halos.set(featureId, {
      kind: placed || (restoredHere && !removedHere) ? "added" : "modified",
      geometry,
    });
  }

  return halos;
}
