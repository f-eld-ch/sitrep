
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import bearing from '@turf/bearing';
import center from '@turf/center';

import { feature as turfFeature, Geometry, point } from '@turf/helpers';
import DefaultMaker from 'assets/marker.svg';
import { BabsIcon, BabsIcons, LinePatterns, ZonePatterns } from 'components/BabsIcons';
import { Feature, FeatureCollection, GeoJsonProperties, LineString } from 'geojson';
import { unionBy } from 'lodash';
import isEmpty from 'lodash/isEmpty';
import isUndefined from 'lodash/isUndefined';
import omitBy from 'lodash/omitBy';
import pullAllBy from 'lodash/pullAllBy';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CirclePicker } from 'react-color';
import { FullscreenControl, Map, MapRef, NavigationControl, Popup, PopupProps, ScaleControl, useMap } from 'react-map-gl';
import { useParams } from 'react-router-dom';
import useLocalStorage from 'utils/useLocalStorage';
import DrawControl from './controls/DrawControl';
import ExportControl from './controls/ExportControl';
import StyleSwitcherControl from './controls/StyleSwitcherControl';
import style from './style';

const modes = {
    ...MapboxDraw.modes,
    // 'draw_point': BabsPointMode
};


export function MapComponent() {
    const [draw, setDraw] = useState<MapboxDraw>();
    const [selectedFeature, setSelectedFeature] = useState<string | number | undefined>();
    const [popupProps, setPopupProps] = useState<PopupProps>({ offset: 20, latitude: 46.87148, longitude: 8.62994, closeOnMove: false, focusAfterOpen: true, maxWidth: '50vw', onClose: () => setSelectedFeature(undefined) });
    const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

    const [viewState, setViewState] = useState({
        latitude: 46.87148,
        longitude: 8.62994,
        zoom: 12,
        bearing: 0,
    });

    const mapRef = useRef<MapRef>(null);

    const { incidentId } = useParams();
    // const [features, setFeatures] = useState<FeatureCollection>({ "type": "FeatureCollection", "features": [{ "id": "2b32999701a0c620d0f9259203ed63dd", "type": "Feature", "properties": { "icon": "AbsperrungVerkehrswege", "iconRotation": 45, }, "geometry": { "coordinates": [8.649638746498567, 46.87569952044984], "type": "Point" } }, { "id": "775e8f6bc028342da6049bcdf17ee089", "type": "Feature", "properties": { "icon": "Teilzerstoerung" }, "geometry": { "coordinates": [8.644308154993183, 46.86835026495743], "type": "Point" } }, { "id": "c008144cc88dbc8f2ccd88a700887d97", "type": "Feature", "properties": { "color": "#0055ff", "name": "KFS" }, "geometry": { "coordinates": [[[8.611160260763086, 46.89719418852033], [8.598904579366092, 46.88044272494358], [8.63760673114416, 46.847659384329376], [8.654162651627615, 46.86015763763265], [8.626641121474307, 46.88749661041737], [8.611160260763086, 46.89719418852033]]], "type": "Polygon" } }] });
    const [features, setFeatures] = useLocalStorage<FeatureCollection>(`map-incident-${incidentId}`, { "type": "FeatureCollection", "features": [] });
    // const [features, setFeatures] = useState<FeatureCollection>({ "type": "FeatureCollection", "features": [] });

    const onUpdate = useCallback(e => {
        setFeatures(curFeatureCollection => {

            const newFeatureCollection = { ...curFeatureCollection };
            const features: Feature[] = e.features;
            newFeatureCollection.features = unionBy(features, curFeatureCollection.features, 'id');
            return newFeatureCollection;
        });
    }, [setFeatures]);

    const onDelete = useCallback(e => {
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const deletedFeatures: Feature[] = e.features;

            newFeatureCollection.features = pullAllBy(curFeatureCollection.features, deletedFeatures, 'id');

            return newFeatureCollection;
        });
    }, [setFeatures]);

    const onCombine = useCallback(e => {
        console.log("onCombine", e);
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const createdFeatures: Feature[] = e.createdFeatures;
            const deletedFeatures: Feature[] = e.deletedFeatures;

            newFeatureCollection.features = pullAllBy(curFeatureCollection.features, deletedFeatures, 'id');
            newFeatureCollection.features = unionBy(createdFeatures, newFeatureCollection.features, 'id');
            return newFeatureCollection;
        });
    }, [setFeatures]);


    const onSelectionChange = useCallback(e => {
        const features: Feature[] = e.features;
        if (features.length === 1) {
            const centerPoint = center(turfFeature(features[0].geometry as Geometry));

            setPopupProps(curPopup => {
                const newPopupProps = { ...curPopup };
                newPopupProps.latitude = centerPoint.geometry.coordinates[1];
                newPopupProps.longitude = centerPoint.geometry.coordinates[0];
                newPopupProps.focusAfterOpen = true;
                return newPopupProps;
            });
            setSelectedFeature(features[0].id);
            mapRef && mapRef.current && mapRef.current.flyTo({ center: [centerPoint.geometry.coordinates[0], centerPoint.geometry.coordinates[1]], essential: true })
        }
        else {
            setSelectedFeature(undefined);
        }
    }, [setPopupProps, setSelectedFeature, mapRef]);

    useEffect(() => {
        if (!mapRef || !isMapLoaded || !draw || !features || isEmpty(features.features)) {
            return;
        }
        draw.set(features);
    }, [draw, mapRef, features, isMapLoaded]);

    const onMapLoad = useCallback(() => {
        // Add the default marker
        let defaultMarker = new Image(32, 32);
        defaultMarker.onload = () => mapRef && mapRef.current && !mapRef.current.hasImage('default_marker') && mapRef.current.addImage('default_marker', defaultMarker);
        defaultMarker.src = DefaultMaker;

        Object.values(BabsIcons).forEach(icon => {
            let customIcon = new Image(48, 48);
            customIcon.onload = () => mapRef && mapRef.current && !mapRef.current.hasImage(icon.name) && mapRef.current.addImage(icon.name, customIcon)
            customIcon.src = icon.src;
        });
        setIsMapLoaded(true);
        mapRef && mapRef.current && mapRef.current.on('styleimagemissing', function (e) {
            const id = e.id; // id of the missing image
            console.log("missing image", id);
            Object.values(Object.assign({}, BabsIcons, LinePatterns, ZonePatterns)).filter(icon => id === icon.name).forEach(icon => {
                let customIcon = new Image(icon.size, icon.size);
                customIcon.onload = () => mapRef && mapRef.current && !mapRef.current.hasImage(icon.name) && mapRef.current.addImage(icon.name, customIcon)
                customIcon.src = icon.src;
            });
        });
    }, [setIsMapLoaded, mapRef]);

    return (
        <>
            <h3 className="title is-size-3 is-capitalized">Lage</h3>
            <Map
                ref={mapRef}
                mapLib={maplibregl}
                onLoad={onMapLoad}
                attributionControl={true}
                minZoom={8}
                maxZoom={19}
                {...viewState}
                onMove={e => setViewState(e.viewState)}
                style={{ minHeight: "85vh" }}
                mapStyle={"https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json"}
            >
                <FullscreenControl position={'top-left'} />
                <NavigationControl position={'top-left'} visualizePitch={true} />
                <DrawControl
                    position="top-right"
                    setDraw={setDraw}
                    displayControlsDefault={false}
                    styles={style}
                    controls={{
                        polygon: true,
                        trash: true,
                        point: true,
                        line_string: true,
                        combine_features: true,
                        uncombine_features: true,
                    }}
                    boxSelect={false}
                    clickBuffer={10}
                    defaultMode="simple_select"
                    modes={modes}
                    onCreate={onUpdate}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onCombine={onCombine}
                    onSelectionChange={onSelectionChange}
                    userProperties={true}
                />
                <StyleSwitcherControl position={'bottom-right'} styles={[
                    {
                        title: "Basiskarte",
                        uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json"
                    },
                    {
                        title: "Satellit",
                        uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte-imagery.vt/style.json"
                    }
                ]} options={{ eventListeners: { onChange: () => { onMapLoad(); return true } } }} />
                <ScaleControl unit={"metric"} position={'bottom-left'} />
                <ExportControl />

                {selectedFeature &&
                    <Popup {...popupProps}>
                        <FeatureDetail onUpdate={onUpdate} feature={features.features.filter(f => f.id === selectedFeature).shift()} />
                    </Popup>
                }
            </Map>
            <div>{JSON.stringify(features)}</div>
        </>
    );
}

const calculateIconRotationForLines = (feature: Feature<LineString>): number => {

    // get the first two points of the line to calculate the bearing
    let point1 = point(feature.geometry.coordinates[0])
    let point2 = point(feature.geometry.coordinates[1])

    return bearing(point1, point2) + 90;
}

function FeatureDetail(props: { onUpdate: (e: any) => void, feature: Feature | undefined }) {
    const map = useMap();
    const { feature, onUpdate } = props;
    const [iconRotation, setIconRotation] = useState<number | undefined>(feature && feature.properties && (feature.properties.iconRotation));
    const [name, setName] = useState<string | undefined>((feature && feature.properties && feature.properties.name));
    const [icon, setIcon] = useState<string | undefined>((feature && feature.properties && feature.properties.icon));
    const [color, setColor] = useState<string | undefined>((feature && feature.properties && feature.properties.color));
    const [kind, setKind] = useState<string | undefined>((feature && feature.properties && ((feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") ? feature.properties.lineType : feature.properties.zoneType)));

    useEffect(() => {
        if (feature !== undefined) {
            let properties: GeoJsonProperties = Object.assign({}, feature.properties, {
                "icon": icon,
                "color": color,
                "name": name,
                "lineType": feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString" ? kind : undefined,
                "zoneType": feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon" ? kind : undefined,
                "iconRotation": feature.geometry.type === "LineString" ? calculateIconRotationForLines(feature as Feature<LineString>) : iconRotation
            });
            feature.properties = omitBy(properties, isUndefined);
            onUpdate({ features: [feature] });

        }
    }, [onUpdate, feature, name, iconRotation, color, icon, kind]);

    let selectableTypes: typeof LineTypes | typeof ZoneTypes | undefined = undefined;

    if (feature?.geometry.type === "LineString" || feature?.geometry.type === "MultiLineString") {
        selectableTypes = LineTypes;
    }
    if (feature?.geometry.type === "Polygon" || feature?.geometry.type === "MultiPolygon") {
        selectableTypes = ZoneTypes;
    }

    return (
        <div className='container'>
            <h3 className='title is-size-5'>Eigenschaften</h3>
            {feature && feature.geometry.type === "Point" ?
                <div className="field is-horizontal">
                    <div className="field-label is-normal">
                        <label className="label">Symbol</label>
                    </div>
                    <div className="field-body">
                        <div className="field is-expanded">
                            <div className="control">
                                <div className="select">
                                    <select onChange={e => setIcon(e.target.value)} defaultValue={feature.properties?.icon}>
                                        {Object.values(BabsIcons).map((icon) => (
                                            <option key={icon.name} label={icon.description}>{icon.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        {feature && feature.geometry.type === "Point" &&
                            < label className="checkbox">
                                <input type="checkbox" onChange={e => e.target.checked ? setIconRotation(map.current?.getBearing()) : setIconRotation(undefined)} checked={iconRotation !== undefined} />
                                Fixiert
                            </label>}
                    </div>
                </div>
                : <></>
            }
            <div className="field is-horizontal">
                <div className="field-label is-normal">
                    <label className="label">Name</label>
                </div>
                <div className="field-body">
                    <div className="field is-expanded">
                        <div className="field">
                            <p className="control">
                                <input className="input" type="text" placeholder="Name" value={feature?.properties?.name} onChange={e => setName(e.target.value)} />
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            <CirclePicker colors={[Colors.Red, Colors.Blue, Colors.Black]} onChangeComplete={(color) => setColor(color.hex)} />
            <br />
            {
                feature && feature.geometry.type !== "Point" &&
                <div className="field is-horizontal">
                    <div className="field-label is-normal">
                        <label className="label">Typ</label>
                    </div>
                    <div className="field-body">
                        <div className="field is-expanded">
                            <div className="field">
                                <div className="control">
                                    <div className="select">
                                        <select onChange={e => {
                                            setKind(e.target.value);
                                            let t = selectableTypes && Object.values(selectableTypes).find(a => a.name === e.target.value);
                                            t && t.icon && setIcon(t.icon?.name);
                                        }}
                                            defaultValue={selectableTypes && Object.values(selectableTypes).find(e => e.name === kind)?.name}
                                        >
                                            <option label="Typ wählen" >{undefined}</option>
                                            {
                                                selectableTypes && Object.values(selectableTypes).filter(t => t.color === color).map((t: any) => (
                                                    <option key={t.name} label={t.description}>{t.name}</option>
                                                ))
                                            }
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            }
        </div >
    )
}

interface TypesType {
    name: string;
    description: string;
    color?: string;
    icon?: BabsIcon;
}

interface SelectableTypes { [key: string]: TypesType }

const Colors = {
    Red: "#ff0000",
    Blue: "#0000ff",
    Black: '#000000',
}

const ZoneTypes: SelectableTypes = {
    "Einsatzraum": { name: "Einsatzraum", description: "Einsatzraum", color: Colors.Blue },
    "Schadengebiet": { name: "Schadengebiet", description: "Schadengebiet", color: Colors.Red },
    "Brandzone": { name: "Brandzone", description: "Brandzone", color: Colors.Red },
    "Zerstoerung": {
        name: "Zerstoerung", description: "Zerstörte, unpassierbare Zone", color: Colors.Red
    },
};

const LineTypes: SelectableTypes = {
    "Rutschgebiet": {
        name: "Rutschgebiet", description: "Rutschgebiet", color: Colors.Red,
    },
    "RutschgebietGespiegelt": {
        name: "RutschgebietGespiegelt", description: "Rutschgebiet (ungekehrt)", color: Colors.Red,
    },
    "begehbar": {
        name: "begehbar", description: "Strasse erschwert befahrbar / begehbar", color: Colors.Red, icon: BabsIcons.Beschaedigung,
    },
    "schwerBegehbar": {
        name: "schwerBegehbar", description: "Strasse nicht befahrbar / schwer Begehbar", color: Colors.Red, icon: BabsIcons.Teilzerstoerung,
    },
    "unpassierbar": {
        name: "unpassierbar", description: "Strasse unpassierbar / gesperrt", color: Colors.Red, icon: BabsIcons.Totalzerstoerung,
    },
    "beabsichtigteErkundung": {
        name: "beabsichtigteErkundung", description: "Beabsichtigte Erkundung", color: Colors.Blue, icon: BabsIcons.Verschiebung,
    },
    "durchgeführteErkundung": {
        name: "durchgeführteErkundung", description: "Durchgeführte Erkundung", color: Colors.Blue, icon: BabsIcons.Verschiebung,
    },
    "beabsichtigteVerschiebung": {
        name: "beabsichtigteVerschiebung", description: "Beabsichtigte Verschiebung", color: Colors.Blue, icon: BabsIcons.Verschiebung,
    },
    "durchgeführteVerschiebung": {
        name: "durchgeführteVerschiebung", description: "Durchgeführte Verschiebung", color: Colors.Blue, icon: BabsIcons.Verschiebung,
    },
    "beabsichtigterEinsatz": {
        name: "beabsichtigterEinsatz", description: "Beabsichtigter Einsatz", color: Colors.Blue, icon: BabsIcons.Einsatz,
    },
    "durchgeführterEinsatz": {
        name: "durchgeführterEinsatz", description: "Durchgeführter Einsatz", color: Colors.Blue, icon: BabsIcons.Einsatz,
    },
};

export default memo(MapComponent);