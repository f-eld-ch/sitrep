import { useContext, useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import { useIconPickerV2 } from "../useIconPickerV2";

/** Set on the map's container while the draw buttons are hidden; Map.css does the hiding. */
export const DRAW_LOCKED_CLASS = "sitrep-draw-locked";

/**
 * Hides the draw buttons from the moment an object is drawn until it is saved or discarded.
 *
 * An unsaved object has its own panel with Save and Discard, so a second tool is not needed, and
 * picking one would abandon the object half made. The buttons cannot be changed once the draw
 * control exists, which is why this is a class on the map and a CSS rule.
 *
 * Only the free map has unsaved objects. On the message map every object is saved when it is
 * drawn, so nothing is ever pending there and the buttons stay, the bin included.
 */
export function DrawControlsLock() {
  const enabled = useIconPickerV2();
  const { state } = useContext(LayerContext);
  const { current: map } = useMap();
  const locked = enabled && state.pendingFeatures.length > 0;

  useEffect(() => {
    const container = map?.getContainer();
    if (!container) return;

    container.classList.toggle(DRAW_LOCKED_CLASS, locked);

    return () => container.classList.remove(DRAW_LOCKED_CLASS);
  }, [map, locked]);

  return null;
}
