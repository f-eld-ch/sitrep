
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import center from '@turf/center';
import { feature as turfFeature, Geometry } from '@turf/helpers';
import DefaultMaker from 'assets/marker.svg';
import { BabsIcons } from 'components/BabsIcons';
import { Feature, FeatureCollection, GeoJsonProperties } from 'geojson';
import isEmpty from 'lodash/isEmpty';
import omitBy from 'lodash/omitBy';
import uniqBy from 'lodash/uniqBy';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CirclePicker } from 'react-color';
import { FullscreenControl, Map, MapRef, NavigationControl, Popup, PopupProps, ScaleControl } from 'react-map-gl';
import { useParams } from 'react-router-dom';
import useLocalStorage from 'utils/useLocalStorage';
import DrawControl from './DrawControl';
import BabsPointMode from './DrawModes/BabsPointMode';
import MapIcons from './MapIcons';
import style from './style';
import StyleSwitcherControl from './StyleSwitcherControl';

const modes = {
    ...MapboxDraw.modes,
    'draw_point': BabsPointMode
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

    const mapRef = useRef<MapRef>();

    const { incidentId } = useParams();
    // const [features, setFeatures] = useState<FeatureCollection>({ "type": "FeatureCollection", "features": [{ "id": "2b32999701a0c620d0f9259203ed63dd", "type": "Feature", "properties": { "icon": "AbsperrungVerkehrswege", "iconRotation": 45, }, "geometry": { "coordinates": [8.649638746498567, 46.87569952044984], "type": "Point" } }, { "id": "775e8f6bc028342da6049bcdf17ee089", "type": "Feature", "properties": { "icon": "Teilzerstoerung" }, "geometry": { "coordinates": [8.644308154993183, 46.86835026495743], "type": "Point" } }, { "id": "c008144cc88dbc8f2ccd88a700887d97", "type": "Feature", "properties": { "color": "#0055ff", "name": "KFS" }, "geometry": { "coordinates": [[[8.611160260763086, 46.89719418852033], [8.598904579366092, 46.88044272494358], [8.63760673114416, 46.847659384329376], [8.654162651627615, 46.86015763763265], [8.626641121474307, 46.88749661041737], [8.611160260763086, 46.89719418852033]]], "type": "Polygon" } }] });
    const [features, setFeatures] = useLocalStorage<FeatureCollection>(`map-incident-${incidentId}`, { "type": "FeatureCollection", "features": [] });
    // const [features, setFeatures] = useState<FeatureCollection>({ "type": "FeatureCollection", "features": [] });

    const onUpdate = useCallback(e => {
        setFeatures(curFeatureCollection => {

            const newFeatureCollection = { ...curFeatureCollection };
            const features: Feature[] = e.features;
            for (const f of features) {
                newFeatureCollection.features.unshift(f);
            }
            newFeatureCollection.features = uniqBy(newFeatureCollection.features, 'id');
            return newFeatureCollection;
        });
    }, [setFeatures]);

    const onDelete = useCallback(e => {
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const features: Feature[] = e.features;

            for (const f of features) {
                newFeatureCollection.features = curFeatureCollection.features.filter((e) => e.id !== f.id);
            }
            return newFeatureCollection;
        });
    }, [setFeatures]);

    const onCombine = useCallback(e => {
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const createdFeatures: Feature[] = e.createdFeatures;
            const deletedFeatures: Feature[] = e.deletedFeatures;

            for (const f of deletedFeatures) {
                newFeatureCollection.features = curFeatureCollection.features.filter((e) => e.id !== f.id);
            }
            for (const f of createdFeatures) {
                newFeatureCollection.features?.unshift(f);
            }
            newFeatureCollection.features = uniqBy(newFeatureCollection.features, 'id');
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

    }, [setIsMapLoaded, mapRef]);

    return (
        <>
            <h3 className="title is-size-3 is-capitalized">Lage</h3>
            <Map
                onLoad={onMapLoad}
                mapLib={maplibregl}
                attributionControl={true}
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                style={{ minHeight: "85vh" }}
                mapStyle={"https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json"}
            >
                <StyleSwitcherControl position={'bottom-right'} styles={[
                    {
                        title: "Basiskarte",
                        uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json"
                    },
                    {
                        title: "Satellit",
                        uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte-imagery.vt/style.json"
                    }
                ]} />
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
                <MapIcons />
                <ScaleControl unit={"metric"} position={'bottom-left'} />
                {selectedFeature &&
                    <Popup {...popupProps}>
                        <FeatureDetail onUpdate={onUpdate} feature={features.features.filter(f => f.id === selectedFeature).shift()} bearing={viewState.bearing} />
                    </Popup>
                }
            </Map>
            {/* <div>{JSON.stringify(features)}</div> */}
        </>
    );
}

function FeatureDetail(props: { onUpdate: (e: any) => void, feature: Feature | undefined, bearing: number }) {
    const { feature, onUpdate, bearing } = props;
    const [iconFixed, setIconFixed] = useState<boolean>(feature && feature.properties && (feature.properties.iconRotation));
    const [name, setName] = useState<string>((feature && feature.properties && feature.properties.name) || "");
    const [icon, setIcon] = useState<string>((feature && feature.properties && feature.properties.icon) || "");
    const [color, setColor] = useState<string>((feature && feature.properties && feature.properties.color) || "");

    useEffect(() => {
        if (feature !== undefined) {
            let properties: GeoJsonProperties = Object.assign({}, feature.properties, {
                "icon": icon,
                "color": color,
                "name": name,
            });
            feature.properties = omitBy(properties, isEmpty);
            onUpdate({ features: [feature] });

        }
    }, [onUpdate, feature, name, iconFixed, color, icon]);

    const onIconFixed = useCallback((e) => {
        setIconFixed(e.checked);
        if (feature !== undefined) {
            let properties: GeoJsonProperties = Object.assign({}, feature.properties, {
                "iconRotation": bearing,
            });
            if (iconFixed) {
                delete properties["iconRotation"];
            }
            feature.properties = properties;
            onUpdate({ features: [feature] });
        }
    }, [onUpdate, feature, iconFixed, setIconFixed, bearing]);

    return (
        <div className='container'>
            <h3 className='title is-size-5'>Eigenschaften</h3>
            {feature && (feature.geometry.type === "Point" || feature.geometry.type === "LineString") ?
                <div className="field is-horizontal">
                    <div className="field-label is-normal">
                        <label className="label">Symbol</label>
                    </div>
                    <div className="field-body">
                        <div className="field is-expanded">
                            <div className="control">
                                <div className="select">
                                    <select onChange={e => setIcon(e.target.value)}>
                                        <option>Icon</option>

                                        {Object.values(BabsIcons).map((icon) => (
                                            <option key={icon.name} label={icon.description}>{icon.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        {feature && feature.geometry.type === "Point" &&
                            < label className="checkbox">
                                <input type="checkbox" onChange={onIconFixed} checked={iconFixed} />
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
            {
                feature && feature.geometry.type !== "Point" && <CirclePicker colors={["#ff2b00", "#0055ff", "#000000"]} onChangeComplete={(color) => setColor(color.hex)} />
            }
        </div >
    )
}

export default memo(MapComponent);