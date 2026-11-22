import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import bbox from "@turf/bbox";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { useCallback, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { type MapRef, Popup, useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import { FeatureForm, type FeatureFormProps, featureTitle } from "./FeatureForm";

export type { PendingFeatureActions } from "./FeatureForm";

type FeatureLabelPopupProps = FeatureFormProps;

interface PopupAnchor {
  lngLat: [number, number];
  anchor: "bottom" | "left";
}

/**
 * Returns position and anchor direction for the popup.
 *
 * Points: tip points at the symbol from below (popup appears above).
 * Lines/Polygons: tip points left at the mid-right edge of the bounding box,
 * popup body extends to the right — stays clear of the feature and never clips the top.
 */
function popupAnchorFor(feature: Feature<Geometry, GeoJsonProperties>, map?: MapRef): PopupAnchor {
  if (feature.geometry.type === "Point") {
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    return { lngLat: [lng, lat], anchor: "bottom" };
  }

  if (map) {
    const coordinates = "coordinates" in feature.geometry ? feature.geometry.coordinates : [];
    const points: [number, number][] = [];
    const collectPoints = (value: unknown): void => {
      if (
        Array.isArray(value) &&
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
      ) {
        points.push(value as [number, number]);
        return;
      }
      if (Array.isArray(value)) value.forEach(collectPoints);
    };
    collectPoints(coordinates);

    if (points.length > 0) {
      const projected = points.map((point) => map.project(point));
      const rightmostIndex = projected.reduce(
        (index, point, candidateIndex) => (point.x > projected[index].x ? candidateIndex : index),
        0,
      );
      const anchor = points[rightmostIndex];
      return { lngLat: anchor, anchor: "left" };
    }
  }

  const [, minLat, maxLng, maxLat] = bbox(feature);
  return { lngLat: [maxLng, (minLat + maxLat) / 2], anchor: "left" };
}

export function FeatureLabelPopup({
  selectedFeature,
  onUpdate,
  pending,
  changeTime,
}: FeatureLabelPopupProps) {
  const { t, i18n } = useTranslation();
  const { current: map } = useMap();
  const { dispatch } = useContext(LayerContext);

  const close = useCallback(() => {
    dispatch({ type: "DESELECT_FEATURE", payload: null });
  }, [dispatch]);

  const title = featureTitle(selectedFeature, i18n.resolvedLanguage ?? i18n.language);

  const {
    lngLat: [lng, lat],
    anchor,
  } = popupAnchorFor(selectedFeature, map ?? undefined);
  const isPoint = selectedFeature.geometry.type === "Point";
  useEffect(() => {
    if (!map) return;
    if (isPoint) {
      // The point can be inside the viewport while its popup still clips at an edge.
      // Measure the rendered popup and pan only as far as needed, without changing zoom.
      const frame = requestAnimationFrame(() => {
        const mapRect = map.getContainer().getBoundingClientRect();
        const popup = map.getContainer().querySelector<HTMLElement>("[data-popup='feature-label']");
        if (!popup) return;

        const popupRect = popup.getBoundingClientRect();
        const edgePadding = 16;
        let offsetX = 0;
        let offsetY = 0;
        if (popupRect.left < mapRect.left + edgePadding) {
          offsetX = mapRect.left + edgePadding - popupRect.left;
        } else if (popupRect.right > mapRect.right - edgePadding) {
          offsetX = mapRect.right - edgePadding - popupRect.right;
        }
        if (popupRect.top < mapRect.top + edgePadding) {
          offsetY = mapRect.top + edgePadding - popupRect.top;
        } else if (popupRect.bottom > mapRect.bottom - edgePadding) {
          offsetY = mapRect.bottom - edgePadding - popupRect.bottom;
        }

        if (offsetX !== 0 || offsetY !== 0) {
          // panBy moves map content opposite to the correction needed for the popup.
          map.panBy([-offsetX, -offsetY], { duration: 300 });
        }
      });
      return () => cancelAnimationFrame(frame);
    } else {
      // Popup appears to the right of the mid-right bbox edge (anchor="left").
      const areaPadding = { top: 60, right: 340, bottom: 60, left: 60 };
      const POPUP_WIDTH = 320; // px — approximate popup body width
      const [minLng, minLat, maxLng, maxLat] = bbox(selectedFeature);
      const featurePoints: [number, number][] = [];
      const collectPoints = (value: unknown): void => {
        if (
          Array.isArray(value) &&
          value.length >= 2 &&
          typeof value[0] === "number" &&
          typeof value[1] === "number"
        ) {
          featurePoints.push(value as [number, number]);
          return;
        }
        if (Array.isArray(value)) value.forEach(collectPoints);
      };
      if ("coordinates" in selectedFeature.geometry) {
        collectPoints(selectedFeature.geometry.coordinates);
      }
      const projectedFeature = featurePoints.map((point) => map.project(point));
      const mapWidth = map.getContainer().clientWidth;
      const mapHeight = map.getContainer().clientHeight;
      const featureVisible = projectedFeature.some(
        (point) => point.x >= 0 && point.x <= mapWidth && point.y >= 0 && point.y <= mapHeight,
      );
      // Project the popup anchor and check there is room for the popup body
      const anchorPx = map.project([lng, lat]);
      const hasPopupRoom = anchorPx.x + POPUP_WIDTH <= map.getContainer().clientWidth;
      if (!featureVisible || !hasPopupRoom) {
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          {
            padding: areaPadding,
            bearing: map.getBearing(),
            pitch: map.getPitch(),
          },
        );
      }
    }
  }, [map, isPoint, lng, lat, selectedFeature]);

  return (
    <Popup
      longitude={lng}
      latitude={lat}
      closeButton={false}
      closeOnClick={false}
      closeOnMove={false}
      maxWidth="none"
      focusAfterOpen
      anchor={anchor}
      offset={30}
      data-popup="feature-label"
    >
      <div className="min-w-[220px] p-3">
        <div className="mb-3 flex items-center justify-between">
          {title ? <p className="text-sm font-bold">{title}</p> : <span />}
          <button
            type="button"
            className="ml-2 shrink-0 p-1 leading-none text-gray-400 hover:text-gray-600"
            aria-label={t("close")}
            onClick={close}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <FeatureForm
          selectedFeature={selectedFeature}
          onUpdate={onUpdate}
          pending={pending}
          changeTime={changeTime}
        />
      </div>
    </Popup>
  );
}
