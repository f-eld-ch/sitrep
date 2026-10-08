import { useContext, useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import { MapSelectionContext } from "../MapSelectionContext";
import { MapTimeContext } from "../MapTimeContext";

/**
 * Reports the feature the user clicked (on a passive layer) or selected (on the layer being
 * edited) to the host of the map, so it can react, for instance by showing the messages the
 * feature was drawn for. Renders nothing.
 *
 * Clicking empty map, pressing Escape, or the host changing `deselectToken` clears the
 * selection. The operator drawing for a message has no use for it and is not reported.
 *
 * `clickLayerIds` are the style layers a click on a passive layer can hit; the layer being
 * edited is drawn by mapbox-gl-draw, whose selection arrives as `selectedFeature`.
 */
export function FeatureSelectionReporter({ clickLayerIds }: { clickLayerIds: string[] }) {
  const { state, dispatch } = useContext(LayerContext);
  const { current: map } = useMap();
  const { drawingMessage } = useContext(MapTimeContext);
  const { onSelect, deselectToken } = useContext(MapSelectionContext);
  const [clicked, setClicked] = useState<string | undefined>();
  const listening = onSelect !== undefined && drawingMessage === undefined;

  useEffect(() => {
    if (!map || !listening) return;

    const onClick = (e: { point: { x: number; y: number } }) => {
      const layers = clickLayerIds.filter((id) => map.getLayer(id));
      const hit = layers.length
        ? map.queryRenderedFeatures([e.point.x, e.point.y], { layers })[0]
        : undefined;
      const featureId = hit?.properties?.featureId;

      setClicked(typeof featureId === "string" ? featureId : undefined);
    };

    map.on("click", onClick);

    return () => {
      map.off("click", onClick);
    };
  }, [map, listening, clickLayerIds]);

  const clear = () => {
    setClicked(undefined);
    dispatch({ type: "DESELECT_FEATURE", payload: null });
  };

  useEffect(() => {
    if (!listening) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setClicked(undefined);
        dispatch({ type: "DESELECT_FEATURE", payload: null });
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [listening, dispatch]);

  // The host cleared its filter: forget the selection too.
  useEffect(() => {
    if (deselectToken === undefined) return;

    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new token clears
  }, [deselectToken]);

  const featureId = listening ? (clicked ?? state.selectedFeature) : undefined;

  useEffect(() => {
    onSelect?.(featureId);
  }, [featureId, onSelect]);

  return null;
}
