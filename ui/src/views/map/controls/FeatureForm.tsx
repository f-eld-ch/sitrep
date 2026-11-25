import { KEMLER_CODES } from "@f-eld-ch/babs-core/kemler-codes";
import { faArrowsRotate, faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { categoryOf, resolveIconId } from "components/babs/iconResolver";
import { fieldsFor, type LabelField, rotationAllowed } from "components/babs/labelSchema";
import { LineTypes } from "components/babs/lineAndZoneTypes";
import { defaultFlowAt } from "components/map/enrichment/flowArrow";
import {
  SLIDE_ARROW_DEFAULT_AT,
  SLIDE_ARROW_MAX_AT,
  SLIDE_ARROW_MIN_AT,
} from "components/map/enrichment/slideArrow";
import { EnrichLineStringMap, EnrichPolygonMap } from "components/map/enrichment/registry";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import dayjs from "dayjs";
import { isEqual, isUndefined, omitBy } from "lodash";
import { Button } from "components/ui";
import { useCallback, useContext, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import { hasType, registerSaveOfOpenFeature } from "../pending";

const isEmptyValue = (v: unknown): boolean => isUndefined(v) || v === "";
const UN_SIGN_ICON = "2109a";
const UN_SIGN_FIELDS = {
  kemler: "kemler",
  unNumber: "unNumber",
  substance: "stoffbezeichnung",
} as const;

const unSignIcon = (kemler: string): string => (kemler ? `un:${kemler}` : UN_SIGN_ICON);

/** What the form needs to save or drop a feature that only exists locally so far. */
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

export interface FeatureFormProps {
  selectedFeature: Feature<Geometry, GeoJsonProperties>;
  onUpdate: (e: {
    features: Feature<Geometry, GeoJsonProperties>[];
    action: string;
    /** When the change takes effect on the timeline; absent for "now". */
    effectiveAt?: Date;
    /** The user pressed save: everything drafted so far is sent now. */
    save?: boolean;
  }) => void;
  /** Set on a saved feature of the free map: the form then offers the time the change takes effect. */
  changeTime?: {
    earliest?: Date;
    /** When the feature was placed on the timeline: what the time field shows to begin with. */
    placedAt?: Date;
  };
  /** Set while the feature has not been saved yet: the form then asks for the time and saves it. */
  pending?: PendingFeatureActions;
  /** The time is not the user's to choose (a message's drawing takes the message's): no time field. */
  withoutTime?: boolean;
}

/** Value for a datetime-local input, in the browser's local time. */
const toLocalInput = (d: Date) => dayjs(d).format("YYYY-MM-DDTHH:mm");

/** The wall clock; read when the form opens, never during render. */
const currentTime = () => Date.now();

/**
 * The fields, rotation, direction, time and save buttons of a feature. Used by the popup and by
 * the unified panel; neither adds anything to how a feature is edited.
 */
export function FeatureForm({
  selectedFeature,
  onUpdate,
  pending,
  changeTime,
  withoutTime,
}: FeatureFormProps) {
  const { t } = useTranslation();
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

  const defaultArrowAt =
    selectedFeature.geometry.type === "Polygon"
      ? (defaultFlowAt(
          selectedFeature.geometry.coordinates[0] ?? [],
          EnrichPolygonMap[selectedFeature.properties?.zoneType as string]?.smooth === true,
        ) ?? 0)
      : SLIDE_ARROW_DEFAULT_AT;

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

  /** Where the arrow is: what is stored, else the default of its kind (see `defaultArrowAt`). */
  const arrowAtOf = (): number =>
    typeof selectedFeature.properties?.arrowAt === "number"
      ? selectedFeature.properties.arrowAt
      : defaultArrowAt;
  const [arrowAt, setArrowAt] = useState<number>(arrowAtOf);

  const [syncedFeature, setSyncedFeature] = useState(selectedFeature);
  // By content, not identity: the feature object is rebuilt whenever the map re-renders, and
  // that must not wipe what the user is typing. Only a real change to the feature resets the form.
  if (!isEqual(selectedFeature, syncedFeature)) {
    setSyncedFeature(selectedFeature);
    setValues(valuesFromFeature());
    setRotation(selectedFeature?.properties?.iconRotation ?? 0);
    setRotationFixed(canRotate && !isUndefined(selectedFeature?.properties?.iconRotation));
    setArrowAt(arrowAtOf());
  }

  // A new object is left through save or discard, never by closing: the panel is all there is.
  const close = useCallback(() => {
    if (pending) return;
    dispatch({ type: "DESELECT_FEATURE", payload: null });
  }, [dispatch, pending]);

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

  // The time a new feature, or a change to a saved one, takes effect at: now unless the user
  // picks another one. A saved feature shows the time it was placed at to begin with; leaving it
  // alone changes it now, as before, and picking another time dates the change then (or, before the
  // placement, moves the start of the feature back).
  const [openedAt] = useState(() => currentTime());
  const [startInput] = useState(() => toLocalInput(new Date(changeTime?.placedAt ?? openedAt)));
  const [effectiveInput, setEffectiveInput] = useState(startInput);
  const effectiveTouched = effectiveInput !== startInput;

  const commit = useCallback(() => {
    const picked = new Date(effectiveInput);

    onUpdate({
      features: [{ ...selectedFeature, properties: buildProperties() }],
      action: "featureDetail",
      save: true,
      effectiveAt:
        changeTime && effectiveTouched && !Number.isNaN(picked.getTime()) ? picked : undefined,
    });
  }, [buildProperties, changeTime, effectiveInput, effectiveTouched, onUpdate, selectedFeature]);

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

  // Leaving a new object that has its type saves it: the map asks for it.
  const savesOnLeave = pending !== undefined && hasType(selectedFeature);
  const saving = pending?.saving;
  useEffect(() => {
    if (!savesOnLeave) return;
    registerSaveOfOpenFeature(() => {
      if (!saving) saveAndClose();
    });

    return () => registerSaveOfOpenFeature(undefined);
  }, [savesOnLeave, saving, saveAndClose]);

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

  /** Moves the arrow along the line or outline; the default position is not stored. */
  const onArrowAtChange = (fraction: number) => {
    setArrowAt(fraction);
    const properties: GeoJsonProperties = omitBy(
      {
        ...selectedFeature.properties,
        ...values,
        arrowAt: Math.abs(fraction - defaultArrowAt) < 0.005 ? undefined : fraction,
      },
      isEmptyValue,
    );
    onUpdate({ features: [{ ...selectedFeature, properties }], action: "featureDetail" });
  };

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

  const isLine = selectedFeature.geometry.type === "LineString";
  const hasSlideArrow =
    selectedFeature.geometry.type === "LineString" &&
    EnrichLineStringMap[selectedFeature.properties?.lineType as string]?.slideArrow !== undefined;
  const zoneEnrichment =
    selectedFeature.geometry.type === "Polygon"
      ? EnrichPolygonMap[selectedFeature.properties?.zoneType as string]
      : undefined;
  const hasFlowArrow = zoneEnrichment?.flowArrow !== undefined;
  const isDirectionalLine =
    isLine && LineTypes[selectedFeature.properties?.lineType as string]?.directional === true;

  return (
    <div>
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
                  placeholder={isUnNumber ? t("mapview.labels.stoffnummerPlaceholder") : undefined}
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
              <Button variant="light" size="sm" className="mt-2 w-full" onClick={onRotationUnlock}>
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
      {(hasSlideArrow || hasFlowArrow) && (
        <div className="mb-2">
          <label
            className="mb-1 block text-xs font-semibold text-gray-800"
            htmlFor={`${baseId}-arrow-at`}
          >
            {t("mapview.arrowPosition")}{" "}
            <span className="text-gray-500">({Math.round(arrowAt * 100)} %)</span>
          </label>
          <input
            id={`${baseId}-arrow-at`}
            className="w-full"
            type="range"
            // A line has ends the arrow keeps clear of; an outline has none and goes round.
            min={hasSlideArrow ? SLIDE_ARROW_MIN_AT * 100 : 0}
            max={hasSlideArrow ? SLIDE_ARROW_MAX_AT * 100 : 100}
            step="1"
            value={Math.round(arrowAt * 100)}
            onChange={(e) => onArrowAtChange(Number(e.target.value) / 100)}
          />
        </div>
      )}
      {(pending || changeTime) && !withoutTime && (
        <div className="mb-2">
          <label
            className="mb-1 block text-xs font-semibold text-gray-800"
            htmlFor={`${baseId}-effective`}
          >
            {pending ? t("mapview.pending.time") : t("mapview.changeTime.label")}
          </label>
          <input
            id={`${baseId}-effective`}
            type="datetime-local"
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none"
            min={
              (pending ?? changeTime)?.earliest
                ? toLocalInput((pending ?? changeTime)!.earliest!)
                : undefined
            }
            max={toLocalInput(new Date(openedAt))}
            value={effectiveInput}
            onChange={(e) => setEffectiveInput(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-gray-500">
            {pending ? t("mapview.pending.hint") : t("mapview.changeTime.hint")}
          </p>
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
  );
}
