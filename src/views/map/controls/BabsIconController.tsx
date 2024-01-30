import { icon } from "@fortawesome/fontawesome-svg-core";
import { faFileText } from "@fortawesome/free-regular-svg-icons";
import { faArrowsRotate, faHeading } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { BabsIcon, BabsIconType, IconGroups, LineTypesEinsatz, LineTypesSchaeden, ZonePatterns } from "components/BabsIcons";
import { Feature, GeoJsonProperties, Geometry } from "geojson";
import { isEmpty, isUndefined, omitBy } from "lodash";
import { memo, useCallback, useEffect, useState } from "react";
import "./BabsIconController.scss";

const iconControllerFlexboxStyleRow = {
    display: "flex", flexFlow: "row wrap", flexGrow: 2, flexShrink: 4, flexBasis: 0, justifyContent: 'flex-end', alignSelf: 'baseline',
}

const iconControllerFlexboxStyleColumn = {
    display: "flex", flexFlow: "column wrap", flexGrow: 2, flexShrink: 4, flexBasis: 0, justifyContent: 'flex-end', alignSelf: 'baseline',
}


const iconControllerStyle = {
    width: "80%",
    marginTop: "160px",
}

function IconController(props: BabsIconControllerProps) {
    const { selectedFeature, onUpdate } = props;

    if (selectedFeature === undefined) {
        return <></>
    }

    if (selectedFeature.geometry.type !== "Point") {
        return <></>
    }

    return (
        <div className="maplibregl-ctrl-top-right mapboxgl-ctrl-top-right" style={iconControllerStyle}>
            {Object.keys(IconGroups).map((group) => <IconGroupMenu key={group} name={group} iconGroup={IconGroups[group]} onUpdate={onUpdate} feature={selectedFeature} />)}
        </div >
    );
}

function IconGroupMenu(props: GroupMenuProps) {
    const { iconGroup, onUpdate, feature, name } = props;

    const lastIcon = Object.values(iconGroup).pop();
    const [active, setActive] = useState<boolean>(false);

    const onClickIcon = useCallback((i: BabsIcon) => {
        let properties: GeoJsonProperties = Object.assign({}, feature.properties, {
            "icon": i.name,
            "iconType": i.name,
            // "iconRotation": feature.geometry.type === "LineString" ? calculateIconRotationForLines(feature as Feature<LineString>) : iconRotation
        });

        feature.properties = omitBy(properties, isUndefined || isEmpty);
        onUpdate({ features: [feature], action: "featureDetail" });
        setActive(!active);

    }, [setActive, active, onUpdate, feature])


    if (active || lastIcon === undefined) {
        return (
            <div className="maplibregl-ctrl maplibregl-ctrl-group" style={iconControllerFlexboxStyleRow}>
                {Object.values(iconGroup).map(
                    (icon) => (
                        <button key={icon.name} title={icon.description} onClick={() => onClickIcon(icon)} ><img src={icon.src} alt={icon.name} /></button>
                    )
                )}
            </div>
        )
    }
    return (
        <div className="maplibregl-ctrl maplibregl-ctrl-group" style={{ marginTop: '5px', marginBottom: '0px', flexFlow: "column wrap" }} >
            <button key={lastIcon.name} title={name} onClick={() => setActive(!active)}><img src={lastIcon.src} alt={icon.name} /></button>
        </ div>
    )
}


function LineController(props: BabsIconControllerProps) {
    const { selectedFeature, onUpdate } = props;

    const onClickIcon = useCallback((i: TypesType) => {
        if (selectedFeature === undefined) {
            return
        }

        let properties: GeoJsonProperties = Object.assign({}, selectedFeature.properties, {
            "lineType": i.name,
            "color": i.color,
        });
        selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);
        onUpdate({ features: [selectedFeature], action: "featureDetail" });

    }, [onUpdate, selectedFeature])

    const onRotateClick = useCallback(() => {
        if (selectedFeature === undefined) {
            return
        }

        // reverse the coordinates
        if (selectedFeature.geometry.type === 'LineString' || selectedFeature.geometry.type === 'MultiLineString') {
            selectedFeature.geometry.coordinates = selectedFeature.geometry.coordinates.reverse()
        }

        onUpdate({ features: [selectedFeature], action: "featureDetail" });

    }, [onUpdate, selectedFeature])

    if (selectedFeature === undefined) {
        return <></>
    }

    if (selectedFeature.geometry.type !== 'LineString' && selectedFeature.geometry.type !== 'MultiLineString') {
        return <></>
    }


    return (
        <div className="maplibregl-ctrl-top-right mapboxgl-ctrl-top-right" style={iconControllerStyle}>
            <div className="maplibregl-ctrl maplibregl-ctrl-group" style={iconControllerFlexboxStyleColumn}>
                {Object.values(LineTypes).map((t) =>
                    (<button key={t.name} title={t.description} onClick={() => onClickIcon(t)} ><img src={t.icon.src} alt={icon.name} /></button>)
                )}
            </div>
            <div className="maplibregl-ctrl maplibregl-ctrl-group" style={{ display: "flex", flexFlow: "column wrap", flexGrow: 2, flexShrink: 4, flexBasis: 0, justifyContent: 'flex-end', alignSelf: 'baseline', marginTop: "5px" }}>
                <button type="button" className='maplibregl-ctrl-icon' title="Richtung drehen" onClick={() => onRotateClick()}><FontAwesomeIcon icon={faArrowsRotate} size="lg" /></button>
            </div>

        </div >
    );
}



function ZoneController(props: BabsIconControllerProps) {
    const { selectedFeature, onUpdate } = props;

    const onClickIcon = useCallback((i: TypesType) => {
        if (selectedFeature !== undefined) {
            let properties: GeoJsonProperties = Object.assign({}, selectedFeature.properties, {
                "zoneType": i.name,
                "color": i.color,
            });
            selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);
            onUpdate({ features: [selectedFeature], action: "featureDetail" });
        }

    }, [onUpdate, selectedFeature])


    if (selectedFeature === undefined) {
        return <></>
    }

    if (selectedFeature.geometry.type !== 'Polygon' && selectedFeature.geometry.type !== 'MultiPolygon') {
        return <></>
    }


    return (
        <div className="maplibregl-ctrl-top-right mapboxgl-ctrl-top-right" style={iconControllerStyle}>
            <div className="maplibregl-ctrl maplibregl-ctrl-group" style={iconControllerFlexboxStyleColumn}>
                {Object.values(ZoneTypes).map((t) =>
                    (<button key={t.name} title={t.description} onClick={() => onClickIcon(t)} ><img src={t.icon.src} alt={icon.name} /></button>)
                )}
            </div>

        </div >
    );
}

interface SelectableTypes { [key: string]: TypesType }

interface TypesType {
    name: string;
    description: string;
    icon: BabsIcon;
    color: string;
}

const Colors = {
    Red: "#ff0000",
    Blue: "#0000ff",
    Black: '#000000',
}

const ZoneTypes: SelectableTypes = {
    "Einsatzraum": {
        name: "Einsatzraum", description: "Einsatzraum", icon: ZonePatterns.Einsatzraum, color: Colors.Blue
    },
    "Schadengebiet": {
        name: "Schadengebiet", description: "Schadengebiet", icon: ZonePatterns.Schadengebiet, color: Colors.Red
    },
    "Brandzone": {
        name: "Brandzone", description: "Brandzone", icon: ZonePatterns.PatternBrandzone, color: Colors.Red
    },
    "Zerstoerung": {
        name: "Zerstoerung", description: "Zerstörte, unpassierbare Zone", icon: ZonePatterns.PatternZerstoert, color: Colors.Red
    },
};

const LineTypes: SelectableTypes = {
    "Rutschgebiet": {
        name: "Rutschgebiet", description: "Rutschgebiet", icon: LineTypesSchaeden.Rutschgebiet, color: Colors.Red,
    },
    "begehbar": {
        name: "begehbar", description: "Strasse erschwert befahrbar / begehbar", icon: LineTypesSchaeden.Strerschwertbefahrbarbegehbar, color: Colors.Red, // fixme
    },
    "schwerBegehbar": {
        name: "schwerBegehbar", description: "Strasse nicht befahrbar / schwer Begehbar", icon: LineTypesSchaeden.Strnichtbefahrbarschwerbegehbar, color: Colors.Red, // fixme
    },
    "unpassierbar": {
        name: "unpassierbar", description: "Strasse unpassierbar / gesperrt", icon: LineTypesSchaeden.Strunpassierbargesperrt, color: Colors.Red,
    },
    "beabsichtigteErkundung": {
        name: "beabsichtigteErkundung", description: "Beabsichtigte Erkundung", color: Colors.Blue, icon: LineTypesEinsatz.BeabsichtigteErkundung
    },
    "durchgeführteErkundung": {
        name: "durchgeführteErkundung", description: "Durchgeführte Erkundung", color: Colors.Blue, icon: LineTypesEinsatz.DurchgefuehrteErkundung // fixme
    },
    "beabsichtigteVerschiebung": {
        name: "beabsichtigteVerschiebung", description: "Beabsichtigte Verschiebung", color: Colors.Blue, icon: LineTypesEinsatz.BeabsichtigteVerschiebung // fixme
    },
    "durchgeführteVerschiebung": {
        name: "durchgeführteVerschiebung", description: "Durchgeführte Verschiebung", color: Colors.Blue, icon: LineTypesEinsatz.DurchgefuehrteVerschiebung // fixme
    },
    "beabsichtigterEinsatz": {
        name: "beabsichtigterEinsatz", description: "Beabsichtigter Einsatz", color: Colors.Blue, icon: LineTypesEinsatz.BeabsichtigterEinsatz // fixme
    },
    "durchgeführterEinsatz": {
        name: "durchgeführterEinsatz", description: "Durchgeführter Einsatz", color: Colors.Blue, icon: LineTypesEinsatz.DurchgefuehrterEinsatz// fixme
    },
    "rettungsAchse": {
        name: "rettungsAchse", description: "Rettungs Achse", color: Colors.Blue, icon: LineTypesEinsatz.RettungsAchse
    },
};

const memoIconController = memo(IconController);
const memoLineController = memo(LineController);
const memoZoneController = memo(ZoneController);

interface GroupMenuProps {
    name: string
    iconGroup: BabsIconType
    feature: Feature<Geometry, GeoJsonProperties>
    onUpdate: (e: any) => void
}


interface BabsIconControllerProps {
    selectedFeature: Feature<Geometry, GeoJsonProperties> | undefined
    onUpdate: (e: any) => void
}

function BabsIconController(props: BabsIconControllerProps) {
    return (
        <>
            <FeatureDetailControlPanel {...props} />
            <IconController {...props} />
            <LineController {...props} />
            <ZoneController {...props} />
        </>
    )
}

function FeatureDetailControlPanel(props: BabsIconControllerProps) {
    const { selectedFeature, onUpdate } = props;
    const [enteredText, setEnteredText] = useState<string>(selectedFeature?.properties?.name);
    const [active, setActive] = useState<boolean>(false);

    const onInput = useCallback((name: string) => {
        if (selectedFeature !== undefined) {
            let properties: GeoJsonProperties = Object.assign({}, selectedFeature.properties, {
                "name": name,
            });
            selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);
            onUpdate({ features: [selectedFeature], action: "featureDetail" });
        }

        setEnteredText("");
        setActive(!active);

    }, [onUpdate, selectedFeature, setActive, active])

    useEffect(() => {
        if (selectedFeature === undefined) {
            setEnteredText("")
            setActive(false)
            return
        }

        setEnteredText(selectedFeature.properties?.name || "")
    }, [selectedFeature, setEnteredText, setActive])

    if (selectedFeature === undefined) {
        return null;
    }

    // no labels for line strings
    if (selectedFeature.geometry.type === 'LineString' || selectedFeature.geometry.type === 'MultiLineString') {
        return <></>
    }


    const btnClass = classNames({
        'maplibregl-ctrl-icon': true,
        'active': active,
        'is-hidden': active,
    });

    const switcherClass = classNames({
        'maplibregl-style-list': true,
        'maplibregl-ctrl-icon': true,
        'is-hidden': !active,
    })


    if (!active) {
        return (
            <div className="maplibregl-ctrl-top-right mapboxgl-ctrl-top-right" style={{ marginRight: "45px" }}>
                <div className='mapboxgl-ctrl mapboxgl-ctrl-group' >
                    <button type="button" className={btnClass} onClick={() => setActive(!active)}><FontAwesomeIcon icon={faHeading} size="lg" /></button>
                </div>
            </div >
        )
    }

    return (
        <div className="maplibregl-ctrl maplibregl-ctrl-top-right control-panel">
            <h5 className="title is-5">Name</h5>
            <div className="control has-icons-left has-icons-right">
                <input className="input is-small" type="email" placeholder="Signaturtext" onChange={(e) => {
                    e.preventDefault();
                    setEnteredText(e.target.value);
                }} value={enteredText} onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        onInput(enteredText);
                    }
                }} />
                <span className="icon is-small is-left">
                    <FontAwesomeIcon icon={faFileText} />
                </span>
            </div>
            <button className="button is-primary is-small" onClick={() => onInput(enteredText)}>Speichern</button>

        </div>
    );
}

const memoBabsIconController = memo(BabsIconController);
export default memoBabsIconController;

export {
    memoBabsIconController as BabsIconController, memoIconController as IconController,
    memoLineController as LineController,
    memoZoneController as ZoneController
};

