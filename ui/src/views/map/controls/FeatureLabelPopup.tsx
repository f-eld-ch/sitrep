import { faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getIcon } from "@f-eld-ch/babs-core";
import bbox from "@turf/bbox";
import { categoryOf, resolveIconId } from "components/babs/iconResolver";
import { fieldsFor, type LabelField } from "components/babs/labelSchema";
import { LineTypes, ZoneTypes } from "components/babs/lineAndZoneTypes";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { isUndefined, omitBy } from "lodash";
import { useCallback, useContext, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popup, useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";

const isEmptyValue = (v: unknown): boolean => isUndefined(v) || v === "";

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
    return meta.labels[lang] ?? meta.labels["de"];
  } catch {
    return undefined;
  }
}

interface FeatureLabelPopupProps {
  selectedFeature: Feature<Geometry, GeoJsonProperties>;
  onUpdate: (e: { features: Feature<Geometry, GeoJsonProperties>[]; action: string }) => void;
}

/** Returns [longitude, latitude] for the popup anchor based on geometry type. */
function anchorFor(feature: Feature<Geometry, GeoJsonProperties>): [number, number] {
  if (feature.geometry.type === "Point") {
    const [lng, lat] = feature.geometry.coordinates as [number, number];
    return [lng, lat];
  }
  const [minLng, minLat, maxLng, maxLat] = bbox(feature);
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

export function FeatureLabelPopup({ selectedFeature, onUpdate }: FeatureLabelPopupProps) {
  const { t, i18n } = useTranslation();
  const { current: map } = useMap();
  const { dispatch } = useContext(LayerContext);
  const baseId = useId();

  const iconValue = selectedFeature.properties?.icon as string | undefined;
  const category = categoryOf(iconValue);
  const resolvedIconId = resolveIconId(iconValue);
  const fields = fieldsFor(category, resolvedIconId);

  const valuesFromFeature = () =>
    Object.fromEntries(fields.map((f) => [f.key, selectedFeature.properties?.[f.key] ?? ""]));

  const [values, setValues] = useState<Record<string, string>>(valuesFromFeature);
  const [rotationLock, setRotationLock] = useState<boolean>(
    !isUndefined(selectedFeature?.properties?.iconRotation),
  );

  const [syncedFeature, setSyncedFeature] = useState(selectedFeature);
  if (selectedFeature !== syncedFeature) {
    setSyncedFeature(selectedFeature);
    setValues(valuesFromFeature());
    setRotationLock(!isUndefined(selectedFeature?.properties?.iconRotation));
  }

  const close = useCallback(() => {
    dispatch({ type: "DESELECT_FEATURE", payload: null });
  }, [dispatch]);

  const commit = useCallback(() => {
    const properties: GeoJsonProperties = omitBy(
      { ...selectedFeature.properties, ...values },
      isEmptyValue,
    );
    onUpdate({ features: [{ ...selectedFeature, properties }], action: "featureDetail" });
  }, [onUpdate, selectedFeature, values]);

  const saveAndClose = useCallback(() => {
    commit();
    close();
  }, [commit, close]);

  const onRotateClick = (lock: boolean) => {
    if (!map) return;
    setRotationLock(lock);
    const properties: GeoJsonProperties = omitBy(
      {
        ...selectedFeature.properties,
        ...values,
        iconRotation: lock ? map.getBearing() : undefined,
      },
      isEmptyValue,
    );
    onUpdate({ features: [{ ...selectedFeature, properties }], action: "featureDetail" });
  };

  const lang = i18n.resolvedLanguage ?? i18n.language;

  const popupTitle = (): string => {
    const geoType = selectedFeature.geometry.type;
    if (geoType === "Point") {
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

  const fieldPlaceholder = (field: LabelField): string => fieldLabel(field);

  const [lng, lat] = anchorFor(selectedFeature);
  const isPoint = selectedFeature.geometry.type === "Point";

  return (
    <Popup
      longitude={lng}
      latitude={lat}
      closeButton={false}
      closeOnClick={false}
      closeOnMove={false}
      maxWidth="none"
      focusAfterOpen
      anchor="bottom"
      offset={30}
      className="feature-label-popup"
    >
      <div className="p-3" style={{ minWidth: "220px" }}>
        {title && (
          <p className="title is-6 mb-3">{title}</p>
        )}
        {fields.map((field) => {
          const inputId = `${baseId}-${field.key}`;
          const label = fieldLabel(field);
          const placeholder = fieldPlaceholder(field);
          return (
            <div key={field.key} className="field mb-2">
              <label className="label is-small mb-1" htmlFor={inputId}>
                {label}
              </label>
              <div className="control">
                <input
                  id={inputId}
                  className="input is-small"
                  type="text"
                  placeholder={placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveAndClose();
                    if (e.key === "Escape") close();
                  }}
                />
              </div>
            </div>
          );
        })}
        {isPoint && (
          <div className="field mb-2">
            <div className="control">
              <button
                type="button"
                className="button is-small is-fullwidth is-light"
                title={rotationLock ? t("mapview.unlock") : t("mapview.lock")}
                onClick={() => onRotateClick(!rotationLock)}
              >
                <span className="icon is-small">
                  <FontAwesomeIcon icon={rotationLock ? faLock : faLockOpen} />
                </span>
                <span>{rotationLock ? t("mapview.unlock") : t("mapview.lock")}</span>
              </button>
            </div>
          </div>
        )}
        <div className="field">
          <div className="buttons is-justify-content-space-between mb-0">
            <button
              type="button"
              className="button is-primary is-small"
              onClick={saveAndClose}
            >
              {t("save")}
            </button>
            <button
              type="button"
              className="button is-small"
              onClick={close}
            >
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    </Popup>
  );
}
