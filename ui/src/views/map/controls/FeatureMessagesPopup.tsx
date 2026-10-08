import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popup, useMap } from "react-map-gl/maplibre";
import { useFeatureMessages } from "api";
import { LayerContext } from "../LayerContext";
import { FeatureMessagesList } from "./FeatureMessagesList";
import { popupAnchorFor } from "./popupAnchor";

/**
 * Shows the messages connected to a feature when it is clicked or selected. Free-drawn features
 * have none, in which case nothing is shown.
 *
 * `clickLayerIds` are the style layers a click on an inactive layer can hit; the active layer is
 * drawn by mapbox-gl-draw, whose selection arrives as `selectedFeature`.
 */
export function FeatureMessagesPopup({ clickLayerIds }: { clickLayerIds: string[] }) {
  const { t } = useTranslation();
  const { state } = useContext(LayerContext);
  const { current: map } = useMap();
  const [clicked, setClicked] = useState<
    { featureId: string; longitude: number; latitude: number } | undefined
  >();
  const [dismissed, setDismissed] = useState<string | undefined>();

  useEffect(() => {
    if (!map) return;

    const onClick = (e: {
      point: { x: number; y: number };
      lngLat: { lng: number; lat: number };
    }) => {
      const layers = clickLayerIds.filter((id) => map.getLayer(id));
      const hit = layers.length
        ? map.queryRenderedFeatures([e.point.x, e.point.y], { layers })[0]
        : undefined;
      const featureId = hit?.properties?.featureId;

      setDismissed(undefined);
      setClicked(
        typeof featureId === "string"
          ? { featureId, longitude: e.lngLat.lng, latitude: e.lngLat.lat }
          : undefined,
      );
    };

    map.on("click", onClick);

    return () => {
      map.off("click", onClick);
    };
  }, [map, clickLayerIds]);

  const featureId = clicked?.featureId ?? state.selectedFeature;
  const messages = useFeatureMessages(featureId);

  if (
    featureId === undefined ||
    featureId === dismissed ||
    messages.status !== "ready" ||
    messages.data.messages.length === 0
  ) {
    return null;
  }

  const position =
    clicked ??
    popupAnchorFor(
      state.layers.map((l) => l.layer),
      featureId,
    );
  if (!position) return null;

  return (
    <Popup
      longitude={position.longitude}
      latitude={position.latitude}
      closeButton={false}
      closeOnClick={false}
      closeOnMove={false}
      maxWidth="none"
      anchor="top"
      offset={clicked ? 12 : 24}
      data-popup="feature-messages"
    >
      <div className="max-w-[320px] min-w-[220px] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold">{t("featureMessages.title")}</p>
          <button
            type="button"
            className="ml-2 shrink-0 p-1 leading-none text-gray-400 hover:text-gray-600"
            aria-label={t("close")}
            onClick={() => {
              setClicked(undefined);
              setDismissed(featureId);
            }}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <FeatureMessagesList messages={messages.data.messages} />
      </div>
    </Popup>
  );
}
