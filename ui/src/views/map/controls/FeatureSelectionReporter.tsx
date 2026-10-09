import { throttle } from "lodash";
import { useContext, useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import { MapSelectionContext } from "../MapSelectionContext";
import { MapTimeContext } from "../MapTimeContext";
import { isPendingFeature } from "../pending";
import { pickFeature } from "./pickFeature";
import { SelectedFeatureHighlight } from "./SelectedFeatureHighlight";

/** How often the hover cursor looks at what is under the mouse. */
const HOVER_INTERVAL_MS = 60;

/**
 * Reports the feature the user clicked (on a passive layer) or selected (on the layer being
 * edited) to the host of the map, so it can react, for instance by showing the messages the
 * feature was drawn for. The selected feature gets a ring around it.
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
      // A small icon is hard to hit exactly: whatever is close enough counts.
      const hit = pickFeature(map, e.point, layers);
      const featureId = hit?.properties?.featureId;

      setClicked(typeof featureId === "string" ? featureId : undefined);
    };

    // What a click would select shows the pointing finger, as the layer being edited does (the draw
    // control sets that one), so the cursor does not depend on which layer a feature is on.
    const container = map.getCanvasContainer();
    const onMove = throttle((e: { point: { x: number; y: number } }) => {
      const layers = clickLayerIds.filter((id) => map.getLayer(id));
      container.style.cursor = pickFeature(map, e.point, layers) ? "pointer" : "";
    }, HOVER_INTERVAL_MS);

    map.on("click", onClick);
    map.on("mousemove", onMove);

    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      onMove.cancel();
      container.style.cursor = "";
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

  // A feature that has not been saved yet has no messages to look up.
  const selected = clicked ?? state.selectedFeature;
  const featureId =
    listening && !isPendingFeature(state.pendingFeatures, selected) ? selected : undefined;

  useEffect(() => {
    onSelect?.(featureId);
  }, [featureId, onSelect]);

  return <SelectedFeatureHighlight featureId={featureId} />;
}
