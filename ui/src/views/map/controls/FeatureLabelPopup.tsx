import { getIcon } from "@f-eld-ch/babs-core";
import { KEMLER_CODES } from "@f-eld-ch/babs-core/kemler-codes";
import { faArrowsRotate, faLock, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import bbox from "@turf/bbox";
import { categoryOf, resolveIconId } from "components/babs/iconResolver";
import { fieldsFor, type LabelField, rotationAllowed } from "components/babs/labelSchema";
import { LineTypes, ZoneTypes } from "components/babs/lineAndZoneTypes";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import dayjs from "dayjs";
import { isUndefined, omitBy } from "lodash";
import { Button } from "components/ui";
import { useCallback, useContext, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { type MapRef, Popup, useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";

const isEmptyValue = (v: unknown): boolean => isUndefined(v) || v === "";
const UN_SIGN_ICON = "2109a";
const UN_SIGN_TITLE = "2109b";
const UN_SIGN_FIELDS = {
  kemler: "kemler",
  unNumber: "unNumber",
  substance: "stoffbezeichnung",
} as const;

const unSignIcon = (kemler: string): string => (kemler ? `un:${kemler}` : UN_SIGN_ICON);

/** MapLibre uses a fixed set of BCP 47 subtags for BABS language resolution. */
const BABS_LANG_MAP: Record<string, string> = {
  de: "de",
  fr: "fr",
  it: "it",
  en: "de", // BABS catalogue has no English artwork; fall back to German
};

/** Returns the BABS catalogue's localized name for the stored icon value, if any. */
function iconLabel(iconValue: string | undefined, language: string): string | undefined {
  const id = resolveIconId(iconValue);
  if (!id) return undefined;
  try {
    const meta = getIcon(id);
    const lang = BABS_LANG_MAP[language] ?? "de";
    return (meta.labels as Record<string, string>)[lang] ?? meta.labels["de"];
  } catch {
    return undefined;
  }
}

/** What the popup needs to save or drop a feature that only exists locally so far. */
export interface PendingFeatureActions {
  saving: boolean;
  /** Message of the last failed save, if any. */
  error?: string;
  /** The earliest time the feature can be given (the incident's start). */
  earliest?: Date;
  /** Create the feature on the server with these properties; `effectiveAt` is undefined for "now". */
  onSave: (properties: GeoJsonProperties, effectiveAt: Date | undefined) => void;
  onDiscard: () => void;
}

interface FeatureLabelPopupProps {
  selectedFeature: Feature<Geometry, GeoJsonProperties>;
  onUpdate: (e: { features: Feature<Geometry, GeoJsonProperties>[]; action: string }) => void;
  /** Set while the feature has not been saved yet: the popup then asks for the time and saves it. */
  pending?: PendingFeatureActions;
}

/** Value for a datetime-local input, in the browser's local time. */
const toLocalInput = (d: Date) => dayjs(d).format("YYYY-MM-DDTHH:mm");

/** The wall clock; read when the popup opens, never during render. */
const currentTime = () => Date.now();

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

export function FeatureLabelPopup({ selectedFeature, onUpdate, pending }: FeatureLabelPopupProps) {
  const { t, i18n } = useTranslation();
  const { current: map } = useMap();
  const { dispatch } = useContext(LayerContext);
  const baseId = useId();

  const iconValue = selectedFeature.properties?.icon as string | undefined;
  const category = categoryOf(iconValue);
  const resolvedIconId = resolveIconId(iconValue);
  const isUnSign = resolvedIconId === UN_SIGN_ICON || iconValue?.startsWith("un:");
  const fields = fieldsFor(category, resolvedIconId);
  const canRotate =
    selectedFeature.geometry.type === "Point" &&
    rotationAllowed(category, resolvedIconId, iconValue);

  const valuesFromFeature = () =>
    isUnSign
      ? {
          [UN_SIGN_FIELDS.kemler]: iconValue?.startsWith("un:") ? iconValue.slice(3) : "",
          [UN_SIGN_FIELDS.unNumber]: selectedFeature.properties?.name ?? "",
          [UN_SIGN_FIELDS.substance]: selectedFeature.properties?.stoffbezeichnung ?? "",
        }
      : Object.fromEntries(fields.map((f) => [f.key, selectedFeature.properties?.[f.key] ?? ""]));

  const [values, setValues] = useState<Record<string, string>>(valuesFromFeature);
  const [rotation, setRotation] = useState<number>(selectedFeature?.properties?.iconRotation ?? 0);
  const [rotationFixed, setRotationFixed] = useState<boolean>(
    canRotate && !isUndefined(selectedFeature?.properties?.iconRotation),
  );

  const [syncedFeature, setSyncedFeature] = useState(selectedFeature);
  if (selectedFeature !== syncedFeature) {
    setSyncedFeature(selectedFeature);
    setValues(valuesFromFeature());
    setRotation(selectedFeature?.properties?.iconRotation ?? 0);
    setRotationFixed(canRotate && !isUndefined(selectedFeature?.properties?.iconRotation));
  }

  const close = useCallback(() => {
    dispatch({ type: "DESELECT_FEATURE", payload: null });
  }, [dispatch]);

  const buildProperties = useCallback((): GeoJsonProperties => {
    return omitBy(
      isUnSign
        ? {
            ...selectedFeature.properties,
            icon: unSignIcon(values[UN_SIGN_FIELDS.kemler]),
            name: values[UN_SIGN_FIELDS.unNumber],
            stoffbezeichnung: values[UN_SIGN_FIELDS.substance],
            nameLeft: undefined,
            nameRight: undefined,
            iconRotation: canRotate ? selectedFeature.properties?.iconRotation : undefined,
          }
        : {
            ...selectedFeature.properties,
            ...values,
            iconRotation: canRotate ? selectedFeature.properties?.iconRotation : undefined,
          },
      isEmptyValue,
    );
  }, [canRotate, isUnSign, selectedFeature, values]);

  const commit = useCallback(() => {
    onUpdate({
      features: [{ ...selectedFeature, properties: buildProperties() }],
      action: "featureDetail",
    });
  }, [buildProperties, onUpdate, selectedFeature]);

  // The time a new feature takes effect at: now unless the user picks another one.
  const [openedAt] = useState(() => currentTime());
  const [effectiveInput, setEffectiveInput] = useState(() => toLocalInput(new Date(openedAt)));
  const effectiveTouched = effectiveInput !== toLocalInput(new Date(openedAt));

  const saveAndClose = useCallback(() => {
    if (pending) {
      const picked = new Date(effectiveInput);
      pending.onSave(
        buildProperties(),
        effectiveTouched && !Number.isNaN(picked.getTime()) ? picked : undefined,
      );

      return;
    }

    commit();
    close();
  }, [buildProperties, close, commit, effectiveInput, effectiveTouched, pending]);

  const onReverseDirection = useCallback(() => {
    if (selectedFeature.geometry.type !== "LineString") return;
    const coords = [...selectedFeature.geometry.coordinates];
    coords.reverse();
    const reversed: Feature<Geometry, GeoJsonProperties> = {
      ...selectedFeature,
      geometry: { ...selectedFeature.geometry, coordinates: coords },
    };
    onUpdate({ features: [reversed], action: "reverseDirection" });
  }, [onUpdate, selectedFeature]);

  const onRotationChange = (value: number) => {
    setRotation(value);
    const properties: GeoJsonProperties = omitBy(
      isUnSign
        ? {
            ...selectedFeature.properties,
            icon: unSignIcon(values[UN_SIGN_FIELDS.kemler]),
            name: values[UN_SIGN_FIELDS.unNumber],
            stoffbezeichnung: values[UN_SIGN_FIELDS.substance],
            nameLeft: undefined,
            nameRight: undefined,
            iconRotation: value,
          }
        : {
            ...selectedFeature.properties,
            ...values,
            iconRotation: value,
          },
      isEmptyValue,
    );
    onUpdate({
      features: [{ ...selectedFeature, properties }],
      action: "featureDetail",
    });
  };

  const onRotationFix = () => {
    if (!map) return;
    setRotationFixed(true);
    onRotationChange(map.getBearing());
  };

  const onRotationUnlock = () => {
    setRotationFixed(false);
    setRotation(0);
    const properties: GeoJsonProperties = omitBy(
      {
        ...selectedFeature.properties,
        ...values,
        iconRotation: undefined,
      },
      isEmptyValue,
    );
    onUpdate({
      features: [{ ...selectedFeature, properties }],
      action: "featureDetail",
    });
  };

  const lang = i18n.resolvedLanguage ?? i18n.language;

  const popupTitle = (): string => {
    const geoType = selectedFeature.geometry.type;
    if (geoType === "Point") {
      if (isUnSign) return iconLabel(UN_SIGN_TITLE, lang) ?? "";
      return iconLabel(iconValue, lang) ?? "";
    }
    if (geoType === "Polygon") {
      const zoneType = selectedFeature.properties?.zoneType as string | undefined;
      const zone = zoneType ? ZoneTypes[zoneType] : undefined;
      return (zone?.thumbnail ? iconLabel(zone.thumbnail, lang) : undefined) ?? zoneType ?? "";
    }
    if (geoType === "LineString") {
      const lineType = selectedFeature.properties?.lineType as string | undefined;
      const line = lineType ? LineTypes[lineType] : undefined;
      return (line?.thumbnail ? iconLabel(line.thumbnail, lang) : undefined) ?? lineType ?? "";
    }
    return "";
  };

  const title = popupTitle();

  /**
   * For single-field layouts the icon name is already in the popup title, so the input
   * label shows the descriptive placeholder text instead of repeating it.
   * For multi-field layouts (Formation, Fahrzeuge) the specific position labels are shown.
   */
  const fieldLabel = (field: LabelField): string => {
    if (fields.length === 1) {
      return field.placeholderKey ? t(field.placeholderKey) : t(field.labelKey);
    }
    return t(field.labelKey);
  };

  const popupFields = isUnSign
    ? [
        { key: UN_SIGN_FIELDS.kemler, label: t("mapview.labels.kemler") },
        {
          key: UN_SIGN_FIELDS.unNumber,
          label: t("mapview.labels.stoffnummer"),
        },
        {
          key: UN_SIGN_FIELDS.substance,
          label: t("mapview.labels.stoffbezeichnung"),
        },
      ]
    : fields.map((field) => ({ key: field.key, label: fieldLabel(field) }));

  const {
    lngLat: [lng, lat],
    anchor,
  } = popupAnchorFor(selectedFeature, map ?? undefined);
  const isPoint = selectedFeature.geometry.type === "Point";
  const isLine = selectedFeature.geometry.type === "LineString";
  const isDirectionalLine =
    isLine && LineTypes[selectedFeature.properties?.lineType as string]?.directional === true;

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
        {popupFields.map((field) => {
          const inputId = `${baseId}-${field.key}`;
          const isKemler = field.key === UN_SIGN_FIELDS.kemler;
          const isUnNumber = field.key === UN_SIGN_FIELDS.unNumber;
          return (
            <div key={field.key} className="mb-2">
              <label className="mb-1 block text-xs font-semibold text-gray-800" htmlFor={inputId}>
                {field.label}
              </label>
              <div>
                {isKemler ? (
                  <select
                    id={inputId}
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                  >
                    <option value="">{t("mapview.labels.kemlerPlaceholder")}</option>
                    {KEMLER_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={inputId}
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
                    type="text"
                    inputMode={isUnNumber ? "numeric" : undefined}
                    maxLength={isUnNumber ? 4 : undefined}
                    placeholder={
                      isUnNumber ? t("mapview.labels.stoffnummerPlaceholder") : undefined
                    }
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveAndClose();
                      if (e.key === "Escape") close();
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
        {canRotate && (
          <div className="mb-2">
            {rotationFixed ? (
              <>
                <label
                  className="mb-1 block text-xs font-semibold text-gray-800"
                  htmlFor={`${baseId}-rotation`}
                >
                  <span className="mr-1">
                    <FontAwesomeIcon icon={faArrowsRotate} />
                  </span>
                  {t("mapview.rotation")} <span className="text-gray-500">({rotation}°)</span>
                </label>
                <div>
                  <input
                    id={`${baseId}-rotation`}
                    className="w-full"
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={rotation}
                    aria-label={t("mapview.rotation")}
                    onChange={(e) => onRotationChange(Number(e.target.value))}
                  />
                </div>
                <Button
                  variant="light"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={onRotationUnlock}
                >
                  <span>
                    <FontAwesomeIcon icon={faLock} />
                  </span>
                  <span>{t("mapview.unlock")}</span>
                </Button>
              </>
            ) : (
              <div>
                <Button variant="light" size="sm" className="w-full" onClick={onRotationFix}>
                  <span>
                    <FontAwesomeIcon icon={faLock} />
                  </span>
                  <span>{t("mapview.lock")}</span>
                </Button>
              </div>
            )}
          </div>
        )}
        {isDirectionalLine && (
          <div className="mb-2">
            <div>
              <Button variant="light" size="sm" className="w-full" onClick={onReverseDirection}>
                <span>
                  <FontAwesomeIcon icon={faArrowsRotate} />
                </span>
                <span>{t("mapview.rotate")}</span>
              </Button>
            </div>
          </div>
        )}
        {pending && (
          <div className="mb-2">
            <label
              className="mb-1 block text-xs font-semibold text-gray-800"
              htmlFor={`${baseId}-effective`}
            >
              {t("mapview.pending.time")}
            </label>
            <input
              id={`${baseId}-effective`}
              type="datetime-local"
              className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
              min={pending.earliest ? toLocalInput(pending.earliest) : undefined}
              max={toLocalInput(new Date(openedAt))}
              value={effectiveInput}
              onChange={(e) => setEffectiveInput(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-gray-500">{t("mapview.pending.hint")}</p>
          </div>
        )}
        {pending?.error && <p className="mb-2 text-xs text-red-600">{pending.error}</p>}
        <div className="space-y-2">
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            disabled={pending?.saving}
            onClick={saveAndClose}
          >
            {t("save")}
          </Button>
          {pending && (
            <Button
              variant="light"
              size="sm"
              className="w-full"
              disabled={pending.saving}
              onClick={pending.onDiscard}
            >
              {t("mapview.pending.discard")}
            </Button>
          )}
        </div>
      </div>
    </Popup>
  );
}
