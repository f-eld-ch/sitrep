import { useContext, useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";

/** Set on the map's container while the draw buttons are hidden; Map.css does the hiding. */
export const DRAW_LOCKED_CLASS = "sitrep-draw-locked";

/**
 * Hides the draw buttons while an object that is drawn and not saved is selected, from the
 * moment it is drawn until it is saved, discarded or left.
 *
 * An unsaved object has its own panel with Save and Discard, so a second tool is not needed, and
 * picking one would abandon the object half made. The buttons cannot be changed once the draw
 * control exists, which is why this is a class on the map and a CSS rule.
 *
 * The same on the free map and on the message map, where an object drawn for a message is also
 * kept local until it is saved.
 */
export function DrawControlsLock() {
  const { state } = useContext(LayerContext);
  const { current: map } = useMap();
  // Only while the unsaved object is the selected one, so with its panel open: one that was left
  // behind (selected away from) has nothing on screen to save or discard.
  const locked = state.pendingFeatures.some((p) => p.id === state.selectedFeature);

  useEffect(() => {
    const container = map?.getContainer();
    if (!container) return;

    container.classList.toggle(DRAW_LOCKED_CLASS, locked);

    return () => container.classList.remove(DRAW_LOCKED_CLASS);
  }, [map, locked]);

  return null;
}
