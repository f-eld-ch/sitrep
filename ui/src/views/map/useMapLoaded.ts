import { useEffect, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

/**
 * Whether the map has finished loading (style and tiles).
 *
 * A component that mounts after the map's one and only `load` event (the draw controls are only
 * there while a layer can be drawn on) finds `map.loaded()` false whenever tiles are in flight, and
 * would wait for a `load` that never comes again. `idle` fires each time the map has settled, so
 * it is waited for as well.
 *
 * `map.loaded` is a method: testing it for truthiness is always true once the map exists. And
 * calling it in an effect is not enough either, as the effect then never runs again when the map
 * finishes loading later. This hook is reactive, and it stays true: `map.loaded()` drops back to
 * false whenever a style switch or a tile request is in flight, and effects that sync the drawing
 * must not run again for that.
 */
export function useMapLoaded(map: MapRef | undefined): boolean {
  const [loaded, setLoaded] = useState(() => map?.loaded() ?? false);

  useEffect(() => {
    if (map === undefined || loaded) return;

    // The map may have finished loading between the render and this effect.
    if (map.loaded()) {
      // oxlint-disable-next-line react/set-state-in-effect -- Synchronize with the map's state.
      setLoaded(true);
      return;
    }

    const onLoad = () => setLoaded(true);
    map.once("load", onLoad);
    map.once("idle", onLoad);

    return () => {
      map.off("load", onLoad);
      map.off("idle", onLoad);
    };
  }, [map, loaded]);

  return loaded;
}
