import { BabsIcon, useBabsLang } from "@f-eld-ch/babs-react";
import { clsx } from "clsx";
import { Button } from "components/ui";
import {
  byColor,
  LineTypes,
  type SelectableType,
  ZoneTypes,
} from "components/babs/lineAndZoneTypes";
import { PICKER_ICON_SIZE } from "components/babs/pickerConfig";
import { useBabsIcons } from "components/babs/useBabsIcons";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { isUndefined, omitBy } from "lodash";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FeatureForm, type FeatureFormProps } from "./FeatureForm";
import { PanelShell } from "./PanelShell";
import { SymbolPanel } from "./SymbolPanel";
import { useKeepFeatureVisible } from "./useKeepFeatureVisible";

type Shape = Feature<Geometry, GeoJsonProperties>;

const isEmptyValue = (v: unknown): boolean => isUndefined(v) || v === "";

/**
 * Everything about the selected feature in one place under the draw controls: what it is (its
 * symbol, line type or area type), its description and, where it applies, the time. It replaces
 * the symbol overlay and the popup, and works the same on the free map and the message map; the
 * message map passes no time, as the feature takes the message's.
 */
export function FeaturePanel({
  selectedFeature,
  onUpdate,
  pending,
  changeTime,
  withoutTime,
}: FeatureFormProps) {
  useKeepFeatureVisible(selectedFeature);

  const form = (
    <FeatureForm
      selectedFeature={selectedFeature}
      onUpdate={onUpdate}
      pending={pending}
      changeTime={changeTime}
      withoutTime={withoutTime}
    />
  );

  switch (selectedFeature.geometry.type) {
    case "Point":
      return (
        <SymbolPanel
          feature={selectedFeature}
          onUpdate={onUpdate}
          form={form}
          onDiscard={pending?.onDiscard}
        />
      );
    case "LineString":
      return (
        <TypePanel
          key={String(selectedFeature.id)}
          feature={selectedFeature}
          field="lineType"
          types={LineTypes}
          onUpdate={onUpdate}
          form={form}
          onDiscard={pending?.onDiscard}
        />
      );
    case "Polygon":
    case "MultiPolygon":
      return (
        <TypePanel
          key={String(selectedFeature.id)}
          feature={selectedFeature}
          field="zoneType"
          types={ZoneTypes}
          onUpdate={onUpdate}
          form={form}
          onDiscard={pending?.onDiscard}
        />
      );
    default:
      return null;
  }
}

/**
 * The type of a line or an area: the types with their names, not only their artwork, because
 * "gesperrt" and "Rutschgebiet" are told apart by the name. Once chosen, the panel shows the
 * type and the form; "Ändern" brings the choice back.
 */
function TypePanel({
  feature,
  field,
  types,
  onUpdate,
  form,
  onDiscard,
}: {
  feature: Shape;
  field: "lineType" | "zoneType";
  types: Record<string, SelectableType>;
  onUpdate: FeatureFormProps["onUpdate"];
  form: React.ReactNode;
  onDiscard: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const { label: iconLabel } = useBabsLang();
  const catalogueReady = useBabsIcons();

  const current = feature.properties?.[field] as string | undefined;
  // A type this version does not list (an older one, say) is still a type: the form stays
  // reachable, and the list is behind "Ändern".
  const hasType = Boolean(current);
  const known = current ? types[current] : undefined;
  const [changing, setChanging] = useState(!hasType);

  if (!catalogueReady) return null;

  const choose = (type: SelectableType) => {
    const properties: GeoJsonProperties = omitBy(
      { ...feature.properties, [field]: type.name, color: type.color },
      isEmptyValue,
    );
    onUpdate({ features: [{ ...feature, properties }], action: "featureDetail" });
    setChanging(false);
  };

  if (hasType && !changing) {
    return (
      <PanelShell testId="type-panel">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {known && (
                <BabsIcon
                  icon={known.thumbnail}
                  size={PICKER_ICON_SIZE}
                  title=""
                  fallback={null}
                  className="block shrink-0"
                />
              )}
              <span className="min-w-0 flex-1 text-sm font-semibold wrap-break-word">
                {known ? iconLabel(known.thumbnail) : current}
              </span>
              <Button variant="light" size="sm" onClick={() => setChanging(true)}>
                {t("mapview.iconPicker.change")}
              </Button>
            </div>
          </div>
          <div>{form}</div>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell testId="type-panel">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-px">
            {byColor(types).map((type) => (
              <li key={type.name}>
                <button
                  type="button"
                  aria-pressed={type.name === current}
                  className={clsx(
                    "flex min-h-[40px] w-full items-center gap-2 rounded px-2 py-1 text-left text-xs",
                    type.name === current
                      ? "bg-primary/15 ring-1 ring-primary"
                      : "hover:bg-gray-100",
                  )}
                  onClick={() => choose(type)}
                >
                  <BabsIcon
                    icon={type.thumbnail}
                    size={PICKER_ICON_SIZE}
                    title=""
                    fallback={null}
                    className="block shrink-0"
                  />
                  <span>{iconLabel(type.thumbnail)}</span>
                </button>
              </li>
            ))}
          </ul>
          {hasType && (
            <Button variant="light" size="sm" onClick={() => setChanging(false)}>
              {t("cancel")}
            </Button>
          )}
          {!hasType && onDiscard && (
            <Button variant="light" size="sm" onClick={onDiscard}>
              {t("mapview.pending.discard")}
            </Button>
          )}
        </div>
        {/* Kept, not shown, while the types are looked at. */}
        {hasType && <div hidden>{form}</div>}
      </div>
    </PanelShell>
  );
}
