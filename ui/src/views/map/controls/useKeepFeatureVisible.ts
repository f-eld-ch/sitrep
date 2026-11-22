import bbox from "@turf/bbox";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";

const MARGIN = 24;
const PANEL_FALLBACK_WIDTH = 300;

function positions(value: unknown, into: [number, number][] = []): [number, number][] {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    into.push([value[0], value[1]]);
  } else if (Array.isArray(value)) {
    value.forEach((item) => positions(item, into));
  }

  return into;
}

/**
 * Keeps the selected feature in view and out from under the feature panel, which covers the
 * right-hand side of the map. A point is panned just far enough; a line or area is fitted into
 * the space left of the panel when none of it is visible there.
 */
export function useKeepFeatureVisible(feature: Feature<Geometry, GeoJsonProperties> | undefined) {
  const { current: map } = useMap();
  const latest = useRef(feature);
  useEffect(() => {
    latest.current = feature;
  });
  // By content: the feature object is rebuilt whenever the map re-renders.
  const key = useMemo(
    () => (feature ? JSON.stringify([feature.id, feature.geometry]) : undefined),
    [feature],
  );

  useEffect(() => {
    const target = latest.current;
    if (!map || !target || key === undefined) return;

    const frame = requestAnimationFrame(() => {
      const container = map.getContainer();
      const mapRect = container.getBoundingClientRect();
      const panel = container.querySelector<HTMLElement>("[data-feature-panel]");
      const panelRect = panel?.getBoundingClientRect();
      const panelWidth = panelRect?.width ?? PANEL_FALLBACK_WIDTH;

      const left = MARGIN;
      const top = MARGIN;
      const right = (panelRect ? panelRect.left - mapRect.left : mapRect.width) - MARGIN;
      const bottom = mapRect.height - MARGIN;

      const points = "coordinates" in target.geometry ? positions(target.geometry.coordinates) : [];
      if (points.length === 0) return;
      const projected = points.map((point) => map.project(point));

      if (target.geometry.type === "Point") {
        const [p] = projected;
        const dx = p.x < left ? p.x - left : p.x > right ? p.x - right : 0;
        const dy = p.y < top ? p.y - top : p.y > bottom ? p.y - bottom : 0;
        if (dx !== 0 || dy !== 0) map.panBy([dx, dy], { duration: 300 });
        return;
      }

      const visible = projected.some(
        (p) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom,
      );
      if (!visible) {
        const [minLng, minLat, maxLng, maxLat] = bbox(target);
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          {
            padding: { top: 60, bottom: 60, left: 60, right: panelWidth + 60 },
            bearing: map.getBearing(),
            pitch: map.getPitch(),
          },
        );
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [map, key]);
}
