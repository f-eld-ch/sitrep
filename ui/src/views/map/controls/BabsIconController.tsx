import { faFileText } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowsRotate,
  faHeading,
  faLock,
  faLockOpen,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import {
  type BabsIcon,
  type BabsIconType,
  IconGroups,
  LineTypesEinsatz,
  LineTypesSchaeden,
  ZonePatterns,
} from "components/BabsIcons";
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

      const properties: GeoJsonProperties = Object.assign(
        {},
        selectedFeature.properties,
        {
          iconRotation: rotationLock ? map.getBearing() : undefined,
        },
      );

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
    return <></>;
  }

  if (selectedFeature.geometry.type !== "Point") {
    return <></>;
  }

  if (map === undefined) {
    return <></>;
  }

  return (
    <div className="maplibregl-ctrl-top-right" style={iconControllerStyle}>
      {Object.keys(IconGroups).map((group) => (
        <IconGroupMenu
          key={group}
          name={group}
          iconGroup={IconGroups[group]}
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

function IconGroupMenu(props: GroupMenuProps) {
  const { iconGroup, onUpdate, feature, name } = props;
  const { t } = useTranslation();

  const lastIcon = Object.values(iconGroup).pop();
  const [active, setActive] = useState<boolean>(false);

  const onClickIcon = useCallback(
    (i: BabsIcon) => {
      const properties: GeoJsonProperties = Object.assign(
        {},
        feature.properties,
        {
          icon: i.name,
          iconType: i.name,
          color: ColorsForIconGroup[name],
        },
      );
      feature.properties = omitBy(properties, isUndefined || isEmpty);
      onUpdate({ features: [feature], action: "featureDetail" });
      setActive(!active);
    },
    [feature, name, onUpdate, active],
  );

  if (active || lastIcon === undefined) {
    return (
      <div
        className="maplibregl-ctrl maplibregl-ctrl-group"
        style={iconControllerFlexboxStyleRow}
      >
        {Object.values(iconGroup).map((icon) => (
          <button
            type="button"
            key={icon.name}
            title={t(`babs.icons.${icon.description}`)}
            onClick={() => onClickIcon(icon)}
          >
            <img src={icon.src} alt={t(`babs.icons.${icon.description}`)} />
          </button>
        ))}
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
        key={lastIcon.name}
        title={t(`babs.groups.${name}`)}
        onClick={() => setActive(!active)}
      >
        <img
          src={lastIcon.src}
          title={t(`babs.groups.${name}`)}
          alt={t(`babs.groups.${name}`)}
          aria-label={t(`babs.groups.${name}`)}
        />
      </button>
    </div>
  );
}

const LineController = memo((props: BabsIconControllerProps) => {
  const { selectedFeature, onUpdate } = props;
  const { t } = useTranslation();

  const onClickIcon = useCallback(
    (i: TypesType) => {
      if (selectedFeature === undefined) {
        return;
      }

      const properties: GeoJsonProperties = Object.assign(
        {},
        selectedFeature.properties,
        {
          lineType: i.name,
          color: i.color,
        },
      );
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
    return <></>;
  }

  if (selectedFeature.geometry.type !== "LineString") {
    return <></>;
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
            <img src={l.icon.src} alt={t(`babs.lines.${l.description}`)} />
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
    (i: TypesType) => {
      if (selectedFeature !== undefined) {
        const properties: GeoJsonProperties = Object.assign(
          {},
          selectedFeature.properties,
          {
            zoneType: i.name,
            color: i.color,
          },
        );
        selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);
        onUpdate({ features: [selectedFeature], action: "featureDetail" });
      }
    },
    [onUpdate, selectedFeature],
  );

  if (selectedFeature === undefined) {
    return <></>;
  }

  if (
    selectedFeature.geometry.type !== "Polygon" &&
    selectedFeature.geometry.type !== "MultiPolygon"
  ) {
    return <></>;
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
            <img src={l.icon.src} alt={t(`babs.zones.${l.description}`)} />
          </button>
        ))}
      </div>
    </div>
  );
});

type SelectableTypes = Record<string, TypesType>;

interface TypesType {
  name: string;
  description: string;
  icon: BabsIcon;
  color: string;
}

const Colors = {
  Red: "#ff0000",
  Blue: "#0000ff",
  Black: "#000000",
  Orange: "#F38D11",
};

type ColorsForIconGroupType = Record<string, string>;

const ColorsForIconGroup: ColorsForIconGroupType = {
  Schäden: Colors.Red,
  Schadenauswirkungen: Colors.Red,
  "Einrichtungen Im Einsatzraum": Colors.Blue,
  "Zivile Führungsstandorte": Colors.Blue,
  "Zivile Mittel": Colors.Blue,
  Fahrzeuge: Colors.Blue,
  "Bildhafte Signaturen (Gesellschaft)": Colors.Red,
  "Bildhafte Signaturen (Natur)": Colors.Red,
  "Bildhafte Signaturen (Technisch)": Colors.Red,
  Gefahren: Colors.Red,
};

const ZoneTypes: SelectableTypes = {
  Einsatzraum: {
    name: "Einsatzraum",
    description: "Einsatzraum",
    icon: ZonePatterns.Einsatzraum,
    color: Colors.Blue,
  },
  Schadengebiet: {
    name: "Schadengebiet",
    description: "Schadengebiet",
    icon: ZonePatterns.Schadengebiet,
    color: Colors.Red,
  },
  Brandzone: {
    name: "Brandzone",
    description: "Brandzone",
    icon: ZonePatterns.PatternBrandzone,
    color: Colors.Red,
  },
  Zerstoerung: {
    name: "Zerstoerung",
    description: "Zerstörte, unpassierbare Zone",
    icon: ZonePatterns.PatternZerstoert,
    color: Colors.Red,
  },
};

const LineTypes: SelectableTypes = {
  Rutschgebiet: {
    name: "Rutschgebiet",
    description: "Rutschgebiet",
    icon: LineTypesSchaeden.Rutschgebiet,
    color: Colors.Red,
  },
  begehbar: {
    name: "begehbar",
    description: "Strasse erschwert befahrbar / begehbar",
    icon: LineTypesSchaeden.Strerschwertbefahrbarbegehbar,
    color: Colors.Red, // fixme
  },
  schwerBegehbar: {
    name: "schwerBegehbar",
    description: "Strasse nicht befahrbar / schwer Begehbar",
    icon: LineTypesSchaeden.Strnichtbefahrbarschwerbegehbar,
    color: Colors.Red, // fixme
  },
  unpassierbar: {
    name: "unpassierbar",
    description: "Strasse unpassierbar / gesperrt",
    icon: LineTypesSchaeden.Strunpassierbargesperrt,
    color: Colors.Red,
  },
  beabsichtigteErkundung: {
    name: "beabsichtigteErkundung",
    description: "Beabsichtigte Erkundung",
    color: Colors.Blue,
    icon: LineTypesEinsatz.BeabsichtigteErkundung,
  },
  durchgeführteErkundung: {
    name: "durchgeführteErkundung",
    description: "Durchgeführte Erkundung",
    color: Colors.Blue,
    icon: LineTypesEinsatz.DurchgefuehrteErkundung, // fixme
  },
  beabsichtigteVerschiebung: {
    name: "beabsichtigteVerschiebung",
    description: "Beabsichtigte Verschiebung",
    color: Colors.Blue,
    icon: LineTypesEinsatz.BeabsichtigteVerschiebung, // fixme
  },
  durchgeführteVerschiebung: {
    name: "durchgeführteVerschiebung",
    description: "Durchgeführte Verschiebung",
    color: Colors.Blue,
    icon: LineTypesEinsatz.DurchgefuehrteVerschiebung, // fixme
  },
  beabsichtigterEinsatz: {
    name: "beabsichtigterEinsatz",
    description: "Beabsichtigter Einsatz",
    color: Colors.Blue,
    icon: LineTypesEinsatz.BeabsichtigterEinsatz, // fixme
  },
  durchgeführterEinsatz: {
    name: "durchgeführterEinsatz",
    description: "Durchgeführter Einsatz",
    color: Colors.Blue,
    icon: LineTypesEinsatz.DurchgefuehrterEinsatz, // fixme
  },
  rettungsAchse: {
    name: "rettungsAchse",
    description: "Rettungs Achse",
    color: Colors.Blue,
    icon: LineTypesEinsatz.RettungsAchse,
  },
};

interface GroupMenuProps {
  name: string;
  iconGroup: BabsIconType;
  feature: Feature<Geometry, GeoJsonProperties>;
  onUpdate: (e: {
    features: Feature<Geometry, GeoJsonProperties>[];
    action: string;
  }) => void;
}

interface BabsIconControllerProps {
  selectedFeature: Feature<Geometry, GeoJsonProperties> | undefined;
  onUpdate: (e: {
    features: Feature<Geometry, GeoJsonProperties>[];
    action: string;
  }) => void;
}

const BabsIconController = () => {
  const { state } = useContext(LayerContext);
  const layer = first(
    state.layers
      .filter((l) => l.layer.id === state.activeLayer)
      .map((l) => l.layer),
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
      map
        ?.getMap()
        .fire("draw.update", { features: updatedFeatures, target: map });
    },
    [map],
  );

  return (
    <>
      <FeatureDetailControlPanel
        selectedFeature={selectedFeature}
        onUpdate={onUpdate}
      />
      <IconController selectedFeature={selectedFeature} onUpdate={onUpdate} />
      <LineController selectedFeature={selectedFeature} onUpdate={onUpdate} />
      <ZoneController selectedFeature={selectedFeature} onUpdate={onUpdate} />
    </>
  );
};

const FeatureDetailControlPanel = memo((props: BabsIconControllerProps) => {
  const { selectedFeature, onUpdate } = props;
  const [enteredText, setEnteredText] = useState<string>(
    selectedFeature?.properties?.name,
  );
  const [active, setActive] = useState<boolean>(false);
  const { t } = useTranslation();
  const onInput = useCallback(
    (name: string) => {
      if (selectedFeature !== undefined) {
        const properties: GeoJsonProperties = Object.assign(
          {},
          selectedFeature.properties,
          {
            name: name,
          },
        );
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
    return <></>;
  }

  const btnClass = classNames({
    "maplibregl-ctrl-icon": true,
    active: active,
    "is-hidden": active,
  });

  if (!active) {
    return (
      <div
        className="maplibregl-ctrl-top-right has-text-black"
        style={{ marginRight: "45px" }}
      >
        <div className="maplibregl-ctrl maplibregl-ctrl-group">
          <button
            type="button"
            className={btnClass}
            onClick={() => setActive(!active)}
          >
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
