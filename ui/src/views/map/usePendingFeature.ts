import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useAddFeature } from "api";
import { IncidentContext } from "utils";
import { LayerContext } from "./LayerContext";
import { MapTimeContext } from "./MapTimeContext";
import { markCreatedForMessage } from "./pending";
import type { PendingFeatureActions } from "./controls/FeatureForm";

/**
 * Saving and discarding of a feature that has been drawn, on the free map or for a message, but
 * only exists locally.
 * Undefined when the given feature is not such a pending feature.
 *
 * Saving creates the feature on the server in one request: on the free map optionally with the
 * time it should take effect at, for a message with the message's time. It then drops the local copy and closes the panel, as saving a saved feature does.
 * Discarding drops the local copy.
 */
export function usePendingFeature(
  featureId: string | undefined,
): PendingFeatureActions | undefined {
  const { t } = useTranslation();
  const { state, dispatch } = useContext(LayerContext);
  const { incidentId } = useParams();
  const { asOf, drawingMessage } = useContext(MapTimeContext);
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
        // Drawing for a message takes the message's time, which the server derives from the id.
        change: drawingMessage
          ? { messageId: drawingMessage.id }
          : effectiveAt
            ? { effectiveAt }
            : undefined,
        asOf,
      })
        .then(({ featureId: savedId }) => {
          if (drawingMessage) markCreatedForMessage(savedId);
          dispatch({ type: "REMOVE_PENDING_FEATURE", payload: { id: pending.id } });
          dispatch({ type: "DESELECT_FEATURE", payload: null });
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
