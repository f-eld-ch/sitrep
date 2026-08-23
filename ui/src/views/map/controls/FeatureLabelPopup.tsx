import { faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getIcon } from "@f-eld-ch/babs-core";
import bbox from "@turf/bbox";
import { categoryOf, resolveIconId } from "components/babs/iconResolver";
import { fieldsFor, type LabelField } from "components/babs/labelSchema";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { isUndefined, omitBy } from "lodash";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popup, useMap } from "react-map-gl/maplibre";

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
  const baseId = useId();

  const iconValue = selectedFeature.properties?.icon as string | undefined;
  const category = categoryOf(iconValue);
  const resolvedIconId = resolveIconId(iconValue);
  const fields = fieldsFor(category, resolvedIconId);

  const initialValues = Object.fromEntries(
    fields.map((f) => [f.key, selectedFeature.properties?.[f.key] ?? ""]),
  );
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  const [rotationLock, setRotationLock] = useState<boolean>(
    !isUndefined(selectedFeature?.properties?.iconRotation),
  );

  const [syncedFeature, setSyncedFeature] = useState(selectedFeature);
  if (selectedFeature !== syncedFeature) {
    setSyncedFeature(selectedFeature);
    setValues(Object.fromEntries(fields.map((f) => [f.key, selectedFeature.properties?.[f.key] ?? ""])));
    setRotationLock(!isUndefined(selectedFeature?.properties?.iconRotation));
  }

  const commit = (overrides?: Record<string, string>) => {
    const merged = { ...values, ...overrides };
    const properties: GeoJsonProperties = omitBy(
      { ...selectedFeature.properties, ...merged },
      isEmptyValue,
    );
    onUpdate({ features: [{ ...selectedFeature, properties }], action: "featureDetail" });
  };

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

  /** Returns the display label for a field. The "name" field (the only slot for most icons)
   * shows the catalogue's own localized icon name rather than the generic "Name" translation. */
  const fieldLabel = (field: LabelField): string => {
    if (field.key === "name" && fields.length === 1) {
      const name = iconLabel(selectedFeature.properties?.icon, i18n.resolvedLanguage ?? i18n.language);
      if (name) return name;
    }
    return t(field.labelKey);
  };

  const fieldPlaceholder = (field: LabelField): string =>
    field.placeholderKey ? t(field.placeholderKey) : fieldLabel(field);

  const [lng, lat] = anchorFor(selectedFeature);
  const isPoint = selectedFeature.geometry.type === "Point";

  return (
    <Popup
      longitude={lng}
      latitude={lat}
      closeOnClick={false}
      closeOnMove={false}
      maxWidth="none"
      focusAfterOpen
      anchor="bottom"
      offset={30}
      className="feature-label-popup"
    >
      <div className="box p-3" style={{ minWidth: "200px" }}>
        {fields.map((field) => {
          const inputId = `${baseId}-${field.key}`;
          const label = fieldLabel(field);
          const placeholder = fieldPlaceholder(field);
          return (
            <div key={field.key} className="field">
              <label className="label is-small" htmlFor={inputId}>
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
                  onBlur={() => commit()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>
            </div>
          );
        })}
        {isPoint && (
          <div className="field">
            <div className="control">
              <button
                type="button"
                className="button is-small is-fullwidth"
                title={rotationLock ? t("mapview.unlock") : t("mapview.lock")}
                onClick={() => onRotateClick(!rotationLock)}
              >
                <span className="icon">
                  <FontAwesomeIcon icon={rotationLock ? faLock : faLockOpen} />
                </span>
                <span>{rotationLock ? t("mapview.unlock") : t("mapview.lock")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Popup>
  );
}
