import {
  type BabsCategory,
  type BabsIconId,
  type BabsIconMeta,
  getGroup,
  getIcon,
  listCategories,
  listIcons,
} from "@f-eld-ch/babs-core";
import { BabsIcon, BabsIconProvider, useBabsLang } from "@f-eld-ch/babs-react";
import { faFileText } from "@fortawesome/free-regular-svg-icons";
import { faChevronLeft, faHeading } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { isPickableCategory, isPickableIcon } from "components/babs/excludedIcons";
import { aliasFor } from "components/babs/iconResolver";
import { rotationAllowed, unsupportedLabelKeys } from "components/babs/labelSchema";
import {
  byColor,
  ColorForCategory,
  LineTypes,
  type SelectableType,
  ZoneTypes,
} from "components/babs/lineAndZoneTypes";
import {
  CATEGORY_DRILL_DOWN,
  CATEGORY_ICON,
  type DrillDownEntry,
  PICKER_GAP,
  PICKER_ICON_CLASS,
  PICKER_ICON_SIZE,
} from "components/babs/pickerConfig";
import { useBabsIcons } from "components/babs/useBabsIcons";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { first, isUndefined, omitBy } from "lodash";
import { memo, useCallback, useContext, useState } from "react";
import { FeatureLabelPopup } from "./FeatureLabelPopup";

const isEmptyValue = (v: unknown): boolean => isUndefined(v) || v === "";

import { useTranslation } from "react-i18next";
import { useMap } from "react-map-gl/maplibre";
import { fireDrawEvent } from "../drawEvents";
import { LayerContext } from "../LayerContext";
import { layerToFeatureCollection } from "api";
import "./BabsIconController.scss";

const iconControllerFlexboxStyleRow = {
  display: "flex",
  flexFlow: "row wrap",
  gap: `${PICKER_GAP}px`,
  flexGrow: 2,
  flexShrink: 4,
  flexBasis: 0,
  justifyContent: "flex-end",
  alignSelf: "baseline",
};

const iconControllerFlexboxStyleColumn = {
  display: "flex",
  flexFlow: "column wrap",
  gap: `${PICKER_GAP}px`,
  flexGrow: 2,
  flexShrink: 4,
  flexBasis: 0,
  justifyContent: "flex-end",
  alignSelf: "baseline",
};

const iconControllerStyle = {
  width: "80%",
  marginTop: "160px",
};

const IconController = memo((props: BabsIconControllerProps) => {
  const { selectedFeature, onUpdate } = props;

  if (selectedFeature === undefined) {
    return;
  }

  if (selectedFeature.geometry.type !== "Point") {
    return;
  }

  return (
    <div className="maplibregl-ctrl-top-right" style={iconControllerStyle}>
      {CATEGORIES.map((category) => (
        <IconCategoryMenu
          key={category.number}
          category={category}
          onUpdate={onUpdate}
          feature={selectedFeature}
        />
      ))}
    </div>
  );
});

/**
 * Categories offered by the picker, resolved once. Replaces the hand-maintained
 * `IconGroups`, so a catalogue addition appears without touching this repo — minus the
 * categories the picker does not own (see EXCLUDED_CATEGORIES).
 */
const CATEGORIES: readonly BabsCategory[] = listCategories().filter((category) =>
  isPickableCategory(category.number),
);

/** Whether an icon should be offered in the picker at all. */
const pickable = (meta: BabsIconMeta): boolean => isPickableIcon(meta.id);

/**
 * One collapsible category of icons.
 *
 * Collapsed it shows the category's configured icon. Expanded it lists the category's
 * icons — except for categories with a `CATEGORY_DRILL_DOWN` entry, which show a set of
 * selector icons first (for Formationen, the partner symbols) and only then that
 * selection's group.
 */
function IconCategoryMenu(props: CategoryMenuProps) {
  const { category, onUpdate, feature } = props;
  // lang/label come from BabsIconProvider, so they are already BABS-resolved ("en" -> de).
  const { lang, label: iconLabel } = useBabsLang();
  const catalogueReady = useBabsIcons();
  const [expanded, setExpanded] = useState(false);
  const [openEntry, setOpenEntry] = useState<DrillDownEntry | null>(null);

  const drillDown = CATEGORY_DRILL_DOWN[category.number];

  /**
   * With a selection open, that group's icons led by the selector itself — so the plain
   * partner symbol stays placeable rather than being consumed as navigation. Otherwise
   * the whole category.
   */
  const icons = (() => {
    if (!openEntry) return listIcons({ category: category.number }).filter(pickable);
    const group = listIcons({ group: openEntry.group }).filter(pickable);
    const selector = getIcon(openEntry.selector);
    const alreadyInGroup = group.some((meta) => meta.id === selector.id);
    return alreadyInGroup || !pickable(selector) ? group : [selector, ...group];
  })();

  const collapse = useCallback(() => {
    setExpanded(false);
    setOpenEntry(null);
  }, []);

  const onClickIcon = useCallback(
    (id: BabsIconId) => {
      const properties: GeoJsonProperties = Object.assign({}, feature.properties, {
        // The readable alias, not the numeric id: keeps persisted data greppable, and the
        // style's match expression resolves it to a sprite key at render time. `iconType`
        // used to be written here as an exact duplicate of `icon` and was read nowhere,
        // so it is no longer set.
        icon: aliasFor(id),
        color: ColorForCategory[category.number],
        iconRotation: rotationAllowed(category.number, id)
          ? feature.properties?.iconRotation
          : undefined,
        // Undefined so `omitBy` strips them: the new icon may annotate in fewer positions
        // than the old one, and a leftover label would keep being drawn.
        ...Object.fromEntries(
          unsupportedLabelKeys(category.number, id).map((key) => [key, undefined]),
        ),
      });
      onUpdate({
        features: [{ ...feature, properties: omitBy(properties, isEmptyValue) }],
        action: "featureDetail",
      });
      collapse();
    },
    [feature, category.number, onUpdate, collapse],
  );

  // Hold off until the catalogue is registered, so the grid does not flash placeholders.
  if (!catalogueReady) {
    return null;
  }

  const categoryLabel = category.labels[lang];

  // First level of a drill-down category: the selector icons (for Formationen, 47xx).
  if (expanded && drillDown && openEntry === null) {
    return (
      <div className="maplibregl-ctrl maplibregl-ctrl-group" style={iconControllerFlexboxStyleRow}>
        <BackButton title={categoryLabel} onClick={collapse} />
        {drillDown.map((entry) => {
          // The group's name, not the selector icon's: "Polizei" reads better than "P".
          const label = getGroup(entry.group).labels[lang];
          return (
            <button
              type="button"
              key={entry.selector}
              title={label}
              aria-label={label}
              onClick={() => setOpenEntry(entry)}
            >
              <BabsIcon
                icon={entry.selector}
                size={PICKER_ICON_SIZE}
                title={label}
                fallback={null}
                className={PICKER_ICON_CLASS}
              />
            </button>
          );
        })}
      </div>
    );
  }

  if (expanded) {
    return (
      <div className="maplibregl-ctrl maplibregl-ctrl-group" style={iconControllerFlexboxStyleRow}>
        {/* Back to the group list for a drill-down category, otherwise straight to collapsed. */}
        <BackButton
          title={categoryLabel}
          onClick={drillDown ? () => setOpenEntry(null) : collapse}
        />
        {icons.map((meta) => {
          const label = iconLabel(meta.id);
          return (
            <button type="button" key={meta.id} title={label} onClick={() => onClickIcon(meta.id)}>
              <BabsIcon
                icon={meta.id}
                size={PICKER_ICON_SIZE}
                title={label}
                fallback={null}
                className={PICKER_ICON_CLASS}
              />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="maplibregl-ctrl maplibregl-ctrl-group"
      style={{ marginTop: "5px", marginBottom: "0px", flexFlow: "column wrap" }}
    >
      <button
        type="button"
        title={categoryLabel}
        aria-label={categoryLabel}
        onClick={() => setExpanded(true)}
      >
        <BabsIcon
          icon={CATEGORY_ICON[category.number]}
          size={PICKER_ICON_SIZE}
          title={categoryLabel}
          fallback={null}
          className={PICKER_ICON_CLASS}
        />
      </button>
    </div>
  );
}

/**
 * Leaves the current picker level.
 *
 * Without it an expanded category is a dead end: the only way back used to be to place an
 * icon, which matters more now that a drill-down category has two levels to unwind.
 */
function BackButton({ title, onClick }: { title: string; onClick: () => void }) {
  const { t } = useTranslation();
  const label = t("mapview.back");
  return (
    <button type="button" title={`${label} — ${title}`} aria-label={label} onClick={onClick}>
      <FontAwesomeIcon icon={faChevronLeft} className={PICKER_ICON_CLASS} />
    </button>
  );
}

const LineController = memo((props: BabsIconControllerProps) => {
  const { selectedFeature, onUpdate } = props;
  const { label: iconLabel } = useBabsLang();
  const catalogueReady = useBabsIcons();

  const onClickIcon = useCallback(
    (i: SelectableType) => {
      if (selectedFeature === undefined) {
        return;
      }

      const properties: GeoJsonProperties = omitBy(
        { ...selectedFeature.properties, lineType: i.name, color: i.color },
        isEmptyValue,
      );
      onUpdate({
        features: [{ ...selectedFeature, properties }],
        action: "featureDetail",
      });
    },
    [onUpdate, selectedFeature],
  );

  if (selectedFeature === undefined) {
    return;
  }

  if (selectedFeature.geometry.type !== "LineString" || !catalogueReady) {
    return;
  }

  return (
    <div className="maplibregl-ctrl-top-right" style={iconControllerStyle}>
      <div
        className="maplibregl-ctrl maplibregl-ctrl-group"
        style={iconControllerFlexboxStyleColumn}
      >
        {byColor(LineTypes).map((l) => (
          <button
            type="button"
            key={l.name}
            title={iconLabel(l.thumbnail)}
            onClick={() => onClickIcon(l)}
          >
            <BabsIcon
              icon={l.thumbnail}
              size={PICKER_ICON_SIZE}
              title={iconLabel(l.thumbnail)}
              fallback={null}
              className={PICKER_ICON_CLASS}
            />
          </button>
        ))}
      </div>
    </div>
  );
});

const ZoneController = memo((props: BabsIconControllerProps) => {
  const { selectedFeature, onUpdate } = props;
  // Zone names come from the catalogue; nothing here needs a repo translation.
  const { label: iconLabel } = useBabsLang();
  const catalogueReady = useBabsIcons();

  const onClickIcon = useCallback(
    (i: SelectableType) => {
      if (selectedFeature !== undefined) {
        const properties: GeoJsonProperties = omitBy(
          { ...selectedFeature.properties, zoneType: i.name, color: i.color },
          isEmptyValue,
        );
        onUpdate({
          features: [{ ...selectedFeature, properties }],
          action: "featureDetail",
        });
      }
    },
    [onUpdate, selectedFeature],
  );

  if (selectedFeature === undefined) {
    return;
  }

  if (
    (selectedFeature.geometry.type !== "Polygon" &&
      selectedFeature.geometry.type !== "MultiPolygon") ||
    !catalogueReady
  ) {
    return;
  }

  return (
    <div className="maplibregl-ctrl-top-right" style={iconControllerStyle}>
      <div
        className="maplibregl-ctrl maplibregl-ctrl-group"
        style={iconControllerFlexboxStyleColumn}
      >
        {byColor(ZoneTypes).map((l) => (
          <button
            type="button"
            key={l.name}
            title={iconLabel(l.thumbnail)}
            onClick={() => onClickIcon(l)}
          >
            <BabsIcon
              icon={l.thumbnail}
              size={PICKER_ICON_SIZE}
              title={iconLabel(l.thumbnail)}
              fallback={null}
              className={PICKER_ICON_CLASS}
            />
          </button>
        ))}
      </div>
    </div>
  );
});

/**
 * `SelectableTypes`, `Colors`, `ZoneTypes`, `LineTypes` and the per-group colour table
 * now live in components/babs/lineAndZoneTypes.ts, keyed on catalogue ids and category
 * numbers rather than on this repo's German group names.
 */

interface CategoryMenuProps {
  category: BabsCategory;
  feature: Feature<Geometry, GeoJsonProperties>;
  onUpdate: (e: { features: Feature<Geometry, GeoJsonProperties>[]; action: string }) => void;
}

interface BabsIconControllerProps {
  selectedFeature: Feature<Geometry, GeoJsonProperties> | undefined;
  onUpdate: (e: { features: Feature<Geometry, GeoJsonProperties>[]; action: string }) => void;
}

/** Returns true only when the feature already has its type property set. */
function hasTypeSelected(feature: Feature<Geometry, GeoJsonProperties>): boolean {
  const props = feature.properties;
  if (feature.geometry.type === "Point") return Boolean(props?.icon);
  if (feature.geometry.type === "LineString") return Boolean(props?.lineType);
  if (feature.geometry.type === "Polygon") return Boolean(props?.zoneType);
  return false;
}

const BabsIconController = () => {
  const { state } = useContext(LayerContext);
  const { i18n } = useTranslation();
  const layer = first(
    state.layers.filter((l) => l.layer.id === state.activeLayer).map((l) => l.layer),
  );
  const { current: map } = useMap();

  const featureCollection = layerToFeatureCollection(layer);
  const selectedFeature = first(
    featureCollection.features.filter((f) => f.id === state.selectedFeature),
  );

  const onUpdate = useCallback(
    (e: { features: Feature<Geometry, GeoJsonProperties>[]; action?: string }) => {
      const updatedFeatures: Feature[] = e.features;
      // Route the edit back through the draw control's own update path, so feature
      // changes made here persist by exactly the same mechanism as direct edits.
      fireDrawEvent(map?.getMap(), "draw.update", {
        features: updatedFeatures,
        action: e.action,
        target: map,
      });
    },
    [map],
  );

  return (
    <>
      {selectedFeature !== undefined && hasTypeSelected(selectedFeature) && (
        <FeatureLabelPopup selectedFeature={selectedFeature} onUpdate={onUpdate} />
      )}
      {/*
       * Supplies the resolved language to <BabsIcon>, which is what selects the
       * language-specific artwork (51 of the 257 icons have it) and backs
       * useBabsLang().label.
       *
       * Scoped here rather than app-wide: these three controllers are the only consumers
       * in the codebase. It is context only — no artwork is loaded by mounting it; the
       * catalogue is imported lazily by useBabsIcons when a picker first renders.
       */}
      <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
        <IconController selectedFeature={selectedFeature} onUpdate={onUpdate} />
        <LineController selectedFeature={selectedFeature} onUpdate={onUpdate} />
        <ZoneController selectedFeature={selectedFeature} onUpdate={onUpdate} />
      </BabsIconProvider>
    </>
  );
};

const FeatureDetailControlPanel = memo((props: BabsIconControllerProps) => {
  const { selectedFeature, onUpdate } = props;
  const [enteredText, setEnteredText] = useState<string>(selectedFeature?.properties?.name);
  const [active, setActive] = useState<boolean>(false);
  const { t } = useTranslation();
  const onInput = useCallback(
    (name: string) => {
      if (selectedFeature !== undefined) {
        const properties: GeoJsonProperties = omitBy(
          { ...selectedFeature.properties, name },
          isEmptyValue,
        );
        onUpdate({
          features: [{ ...selectedFeature, properties }],
          action: "featureDetail",
        });
      }

      setEnteredText("");
      setActive(!active);
    },
    [onUpdate, selectedFeature, active],
  );

  // Adjusted during render, for the same reason as the rotation lock above.
  const [syncedFeature, setSyncedFeature] = useState(selectedFeature);
  if (selectedFeature !== syncedFeature) {
    setSyncedFeature(selectedFeature);
    setEnteredText(selectedFeature?.properties?.name || "");
    if (selectedFeature === undefined) {
      setActive(false);
    }
  }

  if (selectedFeature === undefined) {
    return null;
  }

  // no labels for line strings
  if (
    selectedFeature.geometry.type === "LineString" ||
    selectedFeature.geometry.type === "MultiLineString"
  ) {
    return;
  }

  const btnClass = classNames({
    "maplibregl-ctrl-icon": true,
    active: active,
    "is-hidden": active,
  });

  if (!active) {
    return (
      <div className="maplibregl-ctrl-top-right has-text-black" style={{ marginRight: "45px" }}>
        <div className="maplibregl-ctrl maplibregl-ctrl-group">
          <button type="button" className={btnClass} onClick={() => setActive(!active)}>
            <FontAwesomeIcon icon={faHeading} size="lg" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="maplibregl-ctrl maplibregl-ctrl-top-right control-panel">
      <h5 className="title is-5">{t("name")}</h5>
      <div className="control has-icons-left has-icons-right mb-1">
        <input
          className="input is-small"
          type="text"
          placeholder={t("name")}
          onChange={(e) => {
            setEnteredText(e.target.value);
          }}
          value={enteredText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onInput(enteredText);
            }
          }}
        />
        <span className="icon is-small is-left">
          <FontAwesomeIcon icon={faFileText} />
        </span>
      </div>
      <button
        type="button"
        className="button is-primary is-small"
        onClick={() => onInput(enteredText)}
      >
        {t("save")}
      </button>
    </div>
  );
});

export default BabsIconController;

export {
  BabsIconController,
  FeatureDetailControlPanel,
  IconController,
  LineController,
  ZoneController,
};
