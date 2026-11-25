import { BabsIconProvider } from "@f-eld-ch/babs-react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { first } from "lodash";
import { useCallback, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMap } from "react-map-gl/maplibre";
import { fireDrawEvent } from "../drawEvents";
import { LayerContext } from "../LayerContext";
import { MapTimeContext } from "../MapTimeContext";
import { withPendingFeatures } from "../pending";
import { usePendingFeature } from "../usePendingFeature";
import { FeaturePanel } from "./FeaturePanel";

/**
 * The panel for the selected feature: what it is (symbol, line type or area type), its
 * description and, where it applies, the time. It sits under the draw controls.
 *
 * Changes made in the panel are kept as drafts and sent when the user saves (see
 * `draftFeaturesReducer`), so one edit is one update to the server.
 */
const BabsIconController = () => {
  const { state } = useContext(LayerContext);
  const { i18n } = useTranslation();
  const layer = useMemo(
    () => first(state.layers.filter((l) => l.layer.id === state.activeLayer).map((l) => l.layer)),
    [state.layers, state.activeLayer],
  );
  const { current: map } = useMap();

  // Saved features, with the changes not sent yet, plus the ones drawn on the free map that have
  // not been saved yet.
  const featureCollection = useMemo(
    () => withPendingFeatures(layer, state.pendingFeatures, state.draftFeatures),
    [layer, state.pendingFeatures, state.draftFeatures],
  );
  const selectedFeature = useMemo(
    () => first(featureCollection.features.filter((f) => f.id === state.selectedFeature)),
    [featureCollection, state.selectedFeature],
  );
  const pending = usePendingFeature(selectedFeature?.id?.toString());
  const { asOf, drawingMessage } = useContext(MapTimeContext);
  // A saved feature on the free map can be changed as of an earlier time; drawing for a message
  // always takes the message's time.
  const placedAt = state.layers
    .flatMap((l) => l.layer?.features ?? [])
    .find((f) => f?.id === selectedFeature?.id)?.placedAt;
  const changeTime =
    pending === undefined && drawingMessage === undefined && asOf === undefined
      ? { placedAt }
      : undefined;

  const onUpdate = useCallback(
    (e: {
      features: Feature<Geometry, GeoJsonProperties>[];
      action?: string;
      effectiveAt?: Date;
      /** The user pressed save: send what is drafted. */
      save?: boolean;
    }) => {
      const updatedFeatures: Feature[] = e.features;
      // Route the edit back through the draw control's own update path, so feature
      // changes made here persist by exactly the same mechanism as direct edits.
      fireDrawEvent(map?.getMap(), "draw.update", {
        features: updatedFeatures,
        action: e.action,
        effectiveAt: e.effectiveAt,
        // Everything but the save button only changes the draft.
        draft: !e.save,
        save: e.save,
        target: map,
      });
    },
    [map],
  );

  return (
    /*
     * Supplies the resolved language to <BabsIcon>, which is what selects the language-specific
     * artwork (51 of the 257 icons have it) and backs useBabsLang().label. It is context only:
     * no artwork is loaded by mounting it; the catalogue is imported lazily by useBabsIcons when
     * a picker first renders.
     */
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      {selectedFeature !== undefined && (
        <FeaturePanel
          selectedFeature={selectedFeature}
          onUpdate={onUpdate}
          pending={pending}
          changeTime={changeTime}
          withoutTime={drawingMessage !== undefined}
        />
      )}
    </BabsIconProvider>
  );
};

export default BabsIconController;

export { BabsIconController };
