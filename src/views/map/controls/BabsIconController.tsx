import { makeVar } from "@apollo/client";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { BabsIcon, BabsIconType, IconGroups, LinePatterns, ZonePatterns } from "components/BabsIcons";
import { Feature, GeoJsonProperties, Geometry } from "geojson";
import { isEmpty, isUndefined, omitBy } from "lodash";
import { memo, useCallback, useState } from "react";
import "./StyleController.scss";

const MapStyles: MapStyle[] = [
    {
        name: "Basiskarte",
        uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json"
    },
    {
        name: "Satellit",
        uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte-imagery.vt/style.json"
    },
]

export const selectedStyle = makeVar<MapStyle>(MapStyles[0]);


type MapStyle = {
    name: string,
    uri: string,
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
        <div className="maplibregl-ctrl-top-right mapboxgl-ctrl-top-right" style={{ width: "80%", marginTop: "130px", }}>
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
            <div className="maplibregl-ctrl maplibregl-ctrl-group" style={{ display: "flex", flexFlow: "row wrap", flexGrow: 2, flexShrink: 4, flexBasis: 0, justifyContent: 'flex-end', alignSelf: 'baseline' }}>
                {Object.values(iconGroup).map(
                    (icon) => (
                        <button key={icon.name} title={icon.description} onClick={() => onClickIcon(icon)} ><img src={icon.src} alt={icon.name} /></button>
                    )
                )}
            </div>
        )
    }
    return (
        <div className="maplibregl-ctrl maplibregl-ctrl-group" style={{ marginTop: '10px', marginBottom: '0px', flexFlow: "column wrap" }} >
            <button key={lastIcon.name} title={name} onClick={() => setActive(!active)}><img src={lastIcon.src} alt={icon.name} /></button>
        </ div>
    )
}


function LineController(props: BabsIconControllerProps) {
    const { selectedFeature, onUpdate } = props;

    const onClickIcon = useCallback((i: TypesType) => {
        if (selectedFeature !== undefined) {
            let properties: GeoJsonProperties = Object.assign({}, selectedFeature.properties, {
                "lineType": i.name,
                "color": i.color,
            });
            selectedFeature.properties = omitBy(properties, isUndefined || isEmpty);
            onUpdate({ features: [selectedFeature], action: "featureDetail" });
        }

    }, [onUpdate, selectedFeature])


    if (selectedFeature === undefined) {
        return <></>
    }

    if (selectedFeature.geometry.type !== 'LineString' && selectedFeature.geometry.type !== 'MultiLineString') {
        return <></>
    }


    return (
        <div className="maplibregl-ctrl-top-right mapboxgl-ctrl-top-right" style={{ width: "80%", marginTop: "130px", }}>
            <div className="maplibregl-ctrl maplibregl-ctrl-group" style={{ display: "flex", flexFlow: "row wrap", flexGrow: 2, flexShrink: 4, flexBasis: 0, justifyContent: 'flex-end', alignSelf: 'baseline' }}>

                {Object.values(LineTypes).map((t) =>
                    (<button key={t.name} title={t.description} onClick={() => onClickIcon(t)} ><img src={t.icon.src} alt={icon.name} /></button>)
                )}
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
        <div className="maplibregl-ctrl-top-right mapboxgl-ctrl-top-right" style={{ width: "80%", marginTop: "130px", }}>
            <div className="maplibregl-ctrl maplibregl-ctrl-group" style={{ display: "flex", flexFlow: "row wrap", flexGrow: 2, flexShrink: 4, flexBasis: 0, justifyContent: 'flex-end', alignSelf: 'baseline' }}>

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
        name: "Einsatzraum", description: "Einsatzraum", icon: ZonePatterns.PatternZerstoert, color: Colors.Blue
    },
    "Schadengebiet": {
        name: "Schadengebiet", description: "Schadengebiet", icon: ZonePatterns.PatternZerstoert, color: Colors.Red
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
        name: "Rutschgebiet", description: "Rutschgebiet", icon: LinePatterns.PatternLineRutschgebiet, color: Colors.Red,
    },
    "RutschgebietGespiegelt": {
        name: "RutschgebietGespiegelt", description: "Rutschgebiet (umgekehrt)", icon: LinePatterns.PatternLineRutschgebietGespiegelt, color: Colors.Red,
    },
    "begehbar": {
        name: "begehbar", description: "Strasse erschwert befahrbar / begehbar", icon: LinePatterns.PatternLineUnpassierbar, color: Colors.Red, // fixme
    },
    "schwerBegehbar": {
        name: "schwerBegehbar", description: "Strasse nicht befahrbar / schwer Begehbar", icon: LinePatterns.PatternLineUnpassierbar, color: Colors.Red, // fixme
    },
    "unpassierbar": {
        name: "unpassierbar", description: "Strasse unpassierbar / gesperrt", icon: LinePatterns.PatternLineUnpassierbar, color: Colors.Red,
    },
    "beabsichtigteErkundung": {
        name: "beabsichtigteErkundung", description: "Beabsichtigte Erkundung", color: Colors.Blue, icon: LinePatterns.PatternLineErkundung
    },
    "durchgeführteErkundung": {
        name: "durchgeführteErkundung", description: "Durchgeführte Erkundung", color: Colors.Blue, icon: LinePatterns.PatternLineErkundung // fixme
    },
    "beabsichtigteVerschiebung": {
        name: "beabsichtigteVerschiebung", description: "Beabsichtigte Verschiebung", color: Colors.Blue, icon: LinePatterns.PatternLineErkundung // fixme
    },
    "rettungsAchse": {
        name: "rettungsAchse", description: "Rettungs Achse", color: Colors.Blue, icon: LinePatterns.PatternLineRettungsachse
    },
    "durchgeführteVerschiebung": {
        name: "durchgeführteVerschiebung", description: "Durchgeführte Verschiebung", color: Colors.Blue, icon: LinePatterns.PatternLineErkundung // fixme
    },
    "beabsichtigterEinsatz": {
        name: "beabsichtigterEinsatz", description: "Beabsichtigter Einsatz", color: Colors.Blue, icon: LinePatterns.PatternLineErkundung // fixme
    },
    "durchgeführterEinsatz": {
        name: "durchgeführterEinsatz", description: "Durchgeführter Einsatz", color: Colors.Blue, icon: LinePatterns.PatternLineErkundung// fixme
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
            <IconController {...props} />
            <LineController {...props} />
            <ZoneController {...props} />
        </>
    )

}

const memoBabsIconController = memo(BabsIconController);
export default memoBabsIconController;

export {
    memoBabsIconController as BabsIconController, memoIconController as IconController,
    memoLineController as LineController,
    memoZoneController as ZoneController
};

