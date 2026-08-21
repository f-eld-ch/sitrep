import { faFileText } from "@fortawesome/free-regular-svg-icons";
import { faArrowsRotate, faHeading, faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  type BabsCategory,
  type BabsIconId,
  type BabsIconMeta,
  getLabel,
  listCategories,
  listIcons,
} from "@f-eld-ch/babs-core";
import classNames from "classnames";
import { BabsSpriteIcon } from "components/babs/BabsSpriteIcon";
import { aliasFor } from "components/babs/iconResolver";
import { isPickableIcon } from "components/babs/excludedIcons";
import {
  ColorForCategory,
  LineTypes,
  type SelectableType,
  ZoneTypes,
} from "components/babs/lineAndZoneTypes";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { first, isEmpty, isUndefined, omitBy } from "lodash";
import { memo, useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMap } from "react-map-gl/maplibre";
import { LayerContext } from "../LayerContext";
import { LayerToFeatureCollection } from "../utils";
import "./BabsIconController.scss";

const iconControllerFlexboxStyleRow = {
  display: "flex",
  flexFlow: "row wrap",
  flexGrow: 2,
  flexShrink: 4,
  flexBasis: 0,
  justifyContent: "flex-end",
  alignSelf: "baseline",
};

const iconControllerFlexboxStyleColumn = {
  display: "flex",
  flexFlow: "column wrap",
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
  const { current: map } = useMap();
  const [rotationLock, setRotationLock] = useState<boolean>(
    !isUndefined(selectedFeature?.properties?.iconRotation),
  );
  const { t } = useTranslation();

  const onRotateClick = useCallback(
    (rotationLock: boolean) => {
      if (selectedFeature === undefined) {
        return;
      }

      if (map === undefined) {
        return;
      }

      const properties: GeoJsonProperties = Object.assign({}, selectedFeature.properties, {
        iconRotation: rotationLock ? map.getBearing() : undefined,
      });

      selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);

      onUpdate({ features: [selectedFeature], action: "featureDetail" });
    },
    [onUpdate, selectedFeature, map],
  );

  useEffect(() => {
    if (selectedFeature === undefined) {
      setRotationLock(false);
      return;
    }

    setRotationLock(selectedFeature.properties?.iconRotation !== undefined);
  }, [selectedFeature]);

  if (selectedFeature === undefined) {
    return;
  }

  if (selectedFeature.geometry.type !== "Point") {
    return;
  }

  if (map === undefined) {
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
      <div
        className="maplibregl-ctrl maplibregl-ctrl-group"
        style={{
          display: "flex",
          flexFlow: "column wrap",
          flexGrow: 2,
          flexShrink: 4,
          flexBasis: 0,
          justifyContent: "flex-end",
          alignSelf: "baseline",
          marginTop: "5px",
        }}
      >
        <button
          type="button"
          className="maplibregl-ctrl-icon"
          title={rotationLock ? t("mapview.unlock") : t("mapview.unlock")}
          onClick={() => {
            onRotateClick(!rotationLock);
          }}
        >
          {rotationLock ? (
            <FontAwesomeIcon icon={faLock} size="lg" />
          ) : (
            <FontAwesomeIcon icon={faLockOpen} size="lg" />
          )}
        </button>
      </div>
    </div>
  );
});

/**
 * Categories offered by the picker, resolved once. Replaces the hand-maintained
 * `IconGroups`, so a catalogue addition appears without touching this repo.
 */
const CATEGORIES: readonly BabsCategory[] = listCategories();

/** Icons offered for a category, minus the configured exclusions. */
const pickableIconsFor = (category: BabsCategory): readonly BabsIconMeta[] =>
  listIcons({ category: category.number }).filter((meta) => isPickableIcon(meta.id));

/**
 * One collapsible category of icons. Collapsed it shows a representative icon; expanded
 * it shows the whole category.
 */
function IconCategoryMenu(props: CategoryMenuProps) {
  const { category, onUpdate, feature } = props;
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const icons = pickableIconsFor(category);
  const representative = icons.at(-1);
  const [active, setActive] = useState<boolean>(false);

  const onClickIcon = useCallback(
    (id: BabsIconId) => {
      const properties: GeoJsonProperties = Object.assign({}, feature.properties, {
        // The readable alias, not the numeric id: keeps persisted data greppable, and the
        // style's match expression resolves it to a sprite key at render time. `iconType`
        // used to be written here as an exact duplicate of `icon` and was read nowhere,
        // so it is no longer set.
        icon: aliasFor(id),
        color: ColorForCategory[category.number],
      });
      feature.properties = omitBy(properties, isUndefined || isEmpty);
      onUpdate({ features: [feature], action: "featureDetail" });
      setActive(false);
    },
    [feature, category.number, onUpdate],
  );

  if (representative === undefined) {
    return null;
  }

  if (active) {
    return (
      <div className="maplibregl-ctrl maplibregl-ctrl-group" style={iconControllerFlexboxStyleRow}>
        {icons.map((meta) => {
          const label = getLabel(meta.id, lang);
          return (
            <button type="button" key={meta.id} title={label} onClick={() => onClickIcon(meta.id)}>
              <BabsSpriteIcon spriteKey={meta.id} title={label} lang={lang} />
            </button>
          );
        })}
      </div>
    );
  }

  const categoryLabel = category.labels[lang as keyof typeof category.labels] ?? category.labels.de;
  return (
    <div
      className="maplibregl-ctrl maplibregl-ctrl-group"
      style={{ marginTop: "5px", marginBottom: "0px", flexFlow: "column wrap" }}
    >
      <button
        type="button"
        title={categoryLabel}
        aria-label={categoryLabel}
        onClick={() => setActive(true)}
      >
        <BabsSpriteIcon spriteKey={representative.id} title={categoryLabel} lang={lang} />
      </button>
    </div>
  );
}

const LineController = memo((props: BabsIconControllerProps) => {
  const { selectedFeature, onUpdate } = props;
  const { t } = useTranslation();

  const onClickIcon = useCallback(
    (i: SelectableType) => {
      if (selectedFeature === undefined) {
        return;
      }

      const properties: GeoJsonProperties = Object.assign({}, selectedFeature.properties, {
        lineType: i.name,
        color: i.color,
      });
      selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);
      onUpdate({ features: [selectedFeature], action: "featureDetail" });
    },
    [onUpdate, selectedFeature],
  );

  const onRotateClick = useCallback(() => {
    if (selectedFeature === undefined) {
      return;
    }

    // reverse the coordinates
    if (selectedFeature.geometry.type === "LineString") {
      const feature = {
        type: selectedFeature.type,
        id: selectedFeature.id,
        properties: selectedFeature.properties,
        geometry: {
          type: selectedFeature.geometry.type,
          coordinates: [...selectedFeature.geometry.coordinates],
        },
      };
      feature.geometry.coordinates.reverse();
      onUpdate({ features: [feature], action: "featureDetail" });
    }
  }, [onUpdate, selectedFeature]);

  if (selectedFeature === undefined) {
    return;
  }

  if (selectedFeature.geometry.type !== "LineString") {
    return;
  }

  return (
    <div className="maplibregl-ctrl-top-right" style={iconControllerStyle}>
      <div
        className="maplibregl-ctrl maplibregl-ctrl-group"
        style={iconControllerFlexboxStyleColumn}
      >
        {Object.values(LineTypes).map((l) => (
          <button
            type="button"
            key={l.name}
            title={t(`babs.lines.${l.description}`)}
            onClick={() => onClickIcon(l)}
          >
            <BabsSpriteIcon spriteKey={l.thumbnail} title={t(`babs.lines.${l.description}`)} />
          </button>
        ))}
      </div>
      <div
        className="maplibregl-ctrl maplibregl-ctrl-group"
        style={{
          display: "flex",
          flexFlow: "column wrap",
          flexGrow: 2,
          flexShrink: 4,
          flexBasis: 0,
          justifyContent: "flex-end",
          alignSelf: "baseline",
          marginTop: "5px",
        }}
      >
        <button
          type="button"
          className="maplibregl-ctrl-icon has-text-dark"
          title={t("mapview.rotate")}
          onClick={() => onRotateClick()}
        >
          <FontAwesomeIcon icon={faArrowsRotate} size="lg" />
        </button>
      </div>
    </div>
  );
});

const ZoneController = memo((props: BabsIconControllerProps) => {
  const { selectedFeature, onUpdate } = props;
  const { t } = useTranslation();

  const onClickIcon = useCallback(
    (i: SelectableType) => {
      if (selectedFeature !== undefined) {
        const properties: GeoJsonProperties = Object.assign({}, selectedFeature.properties, {
          zoneType: i.name,
          color: i.color,
        });
        selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);
        onUpdate({ features: [selectedFeature], action: "featureDetail" });
      }
    },
    [onUpdate, selectedFeature],
  );

  if (selectedFeature === undefined) {
    return;
  }

  if (
    selectedFeature.geometry.type !== "Polygon" &&
    selectedFeature.geometry.type !== "MultiPolygon"
  ) {
    return;
  }

  return (
    <div className="maplibregl-ctrl-top-right" style={iconControllerStyle}>
      <div
        className="maplibregl-ctrl maplibregl-ctrl-group"
        style={iconControllerFlexboxStyleColumn}
      >
        {Object.values(ZoneTypes).map((l) => (
          <button
            type="button"
            key={l.name}
            title={t(`babs.zones.${l.description}`)}
            onClick={() => onClickIcon(l)}
          >
            <BabsSpriteIcon spriteKey={l.thumbnail} title={t(`babs.zones.${l.description}`)} />
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

const BabsIconController = () => {
  const { state } = useContext(LayerContext);
  const layer = first(
    state.layers.filter((l) => l.layer.id === state.activeLayer).map((l) => l.layer),
  );
  const { current: map } = useMap();

  const featureCollection = LayerToFeatureCollection(layer);
  const selectedFeature = first(
    featureCollection.features.filter((f) => f.id === state.selectedFeature),
  );

  const onUpdate = useCallback(
    (e: { features: Feature<Geometry, GeoJsonProperties>[] }) => {
      const updatedFeatures: Feature[] = e.features;
      // fire an map draw.update event
      map?.getMap().fire("draw.update", { features: updatedFeatures, target: map });
    },
    [map],
  );

  return (
    <>
      <FeatureDetailControlPanel selectedFeature={selectedFeature} onUpdate={onUpdate} />
      <IconController selectedFeature={selectedFeature} onUpdate={onUpdate} />
      <LineController selectedFeature={selectedFeature} onUpdate={onUpdate} />
      <ZoneController selectedFeature={selectedFeature} onUpdate={onUpdate} />
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
        const properties: GeoJsonProperties = Object.assign({}, selectedFeature.properties, {
          name: name,
        });
        selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);
        onUpdate({ features: [selectedFeature], action: "featureDetail" });
      }

      setEnteredText("");
      setActive(!active);
    },
    [onUpdate, selectedFeature, active],
  );

  useEffect(() => {
    if (selectedFeature === undefined) {
      setEnteredText("");
      setActive(false);
      return;
    }

    setEnteredText(selectedFeature.properties?.name || "");
  }, [selectedFeature]);

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
