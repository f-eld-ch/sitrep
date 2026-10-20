import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useAddFeature } from "api";
import { IncidentContext } from "utils";
import { LayerContext } from "./LayerContext";
import { MapTimeContext } from "./MapTimeContext";
import type { PendingFeatureActions } from "./controls/FeatureLabelPopup";

/**
 * Saving and discarding of a feature that has been drawn on the free map but only exists locally.
 * Undefined when the given feature is not such a pending feature.
 *
 * Saving creates the feature on the server, optionally with the time it should take effect at,
 * and then selects the saved feature in place of the local copy. Discarding drops the local copy.
 */
export function usePendingFeature(
  featureId: string | undefined,
): PendingFeatureActions | undefined {
  const { t } = useTranslation();
  const { state, dispatch } = useContext(LayerContext);
  const { incidentId } = useParams();
  const { asOf } = useContext(MapTimeContext);
  const { state: incidentState } = useContext(IncidentContext);
  const [addFeature, addState] = useAddFeature();

  const pending = state.pendingFeatures.find((p) => p.id === featureId);
  if (!pending) return undefined;

  return {
    saving: addState.loading,
    error: addState.error ? t(`errors.${addState.error.code}`) : undefined,
    earliest: incidentState.incident?.createdAt,
    onSave: (properties, effectiveAt) => {
      void addFeature({
        layerId: pending.layerId,
        clientKey: pending.id,
        geometry: pending.geometry,
        properties,
        incidentId: incidentId ?? "",
        change: effectiveAt ? { effectiveAt } : undefined,
        asOf,
      })
        .then(({ featureId: savedId }) => {
          dispatch({ type: "REMOVE_PENDING_FEATURE", payload: { id: pending.id } });
          dispatch({ type: "SELECT_FEATURE", payload: { id: savedId } });
        })
        .catch(() => {
          // addState.error renders the message in the popup; the feature stays local.
        });
    },
    onDiscard: () => {
      dispatch({ type: "REMOVE_PENDING_FEATURE", payload: { id: pending.id } });
      dispatch({ type: "DESELECT_FEATURE", payload: null });
    },
  };
}
