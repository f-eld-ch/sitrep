
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import center from '@turf/center';
import { feature as turfFeature, Geometry } from '@turf/helpers';
import { Feature, FeatureCollection } from 'geojson';
import uniqBy from 'lodash/uniqBy';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Github from 'react-color/lib/components/github/Github';
import { FullscreenControl, Map, MapRef, NavigationControl, Popup, PopupProps, ScaleControl } from 'react-map-gl';
import BabsPointMode from './BabsPointMode';
import DrawControl from './DrawControl';
import MapIcons, { BabsIcons } from './MapIcons';
import style from './style';
import StyleSwitcherControl from './StyleSwitcherControl';

const modes = {
    ...MapboxDraw.modes,
    'draw_point': BabsPointMode
};


export function MapComponent() {
    const [draw, setDraw] = useState<MapboxDraw>();
    const [selectedFeature, setSelectedFeature] = useState<string | number | undefined>();
    const [popupProps, setPopupProps] = useState<PopupProps>({ offset: 20, anchor: 'bottom', latitude: 46.87148, longitude: 8.62994, closeOnMove: false, focusAfterOpen: true, maxWidth: '50vw', onClose: () => setSelectedFeature(undefined) });
    const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

    const [viewState, setViewState] = useState({
        latitude: 46.87148,
        longitude: 8.62994,
        zoom: 12,
    });

    const mapRef = useRef<MapRef>();

    const [features, setFeatures] = useState<FeatureCollection>({ "type": "FeatureCollection", "features": [{ "id": "775e8f6bc028342da6049bcdf17ee089", "type": "Feature", "properties": { "icon": "Teilzerstoerung" }, "geometry": { "coordinates": [8.644308154993183, 46.86835026495743], "type": "Point" } }, { "id": "c008144cc88dbc8f2ccd88a700887d97", "type": "Feature", "properties": { "icon": null, "name": "KFS" }, "geometry": { "coordinates": [[[8.611160260763086, 46.89719418852033], [8.598904579366092, 46.88044272494358], [8.63760673114416, 46.847659384329376], [8.654162651627615, 46.86015763763265], [8.626641121474307, 46.88749661041737], [8.611160260763086, 46.89719418852033]]], "type": "Polygon" } }] });

    const onUpdate = useCallback(e => {
        console.log(e);
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const features: Feature[] = e.features;
            for (const f of features) {
                newFeatureCollection.features.unshift(f);
                newFeatureCollection.features = uniqBy(newFeatureCollection.features, 'id');
            }
            return newFeatureCollection;
        });
    }, []);

    const onDelete = useCallback(e => {
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const features: Feature[] = e.features;

            for (const f of features) {
                newFeatureCollection.features = curFeatureCollection.features.filter((e) => e.id !== f.id);
            }
            return newFeatureCollection;
        });
    }, []);

    const onCombine = useCallback(e => {
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const createdFeatures: Feature[] = e.createdFeatures;
            const deletedFeatures: Feature[] = e.deletedFeatures;

            for (const f of deletedFeatures) {
                newFeatureCollection.features = curFeatureCollection.features.filter((e) => e.id !== f.id);
            }
            for (const f of createdFeatures) {
                newFeatureCollection.features.unshift(f);
                newFeatureCollection.features = uniqBy(newFeatureCollection.features, 'id');
            }
            return newFeatureCollection;
        });
    }, []);


    const onSelectionChange = useCallback(e => {
        console.log("onSelectionChange", e);
        const features: Feature[] = e.features;
        if (features.length === 1) {
            const centerPoint = center(turfFeature(features[0].geometry as Geometry));

            setPopupProps(curPopup => {
                const newPopupProps = { ...curPopup };
                console.log("showing popup at", centerPoint);
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
        if (!mapRef || !isMapLoaded || !draw) {
            return;
        }

        draw.set(features);
        console.log("setting features in Effect", features);
    }, [draw, mapRef, features, isMapLoaded]);

    const onMapLoad = useCallback(() => {
        Object.values(BabsIcons).forEach(icon => {
            console.log("adding Image", icon.name)
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
                        <FeatureDetail onUpdate={onUpdate} feature={features.features.filter(f => f.id === selectedFeature).shift()} />
                    </Popup>
                }
            </Map>
            <div>{JSON.stringify(features)}</div>
        </>
    );
}

function FeatureDetail(props: { onUpdate: (e: any) => void, feature: Feature | undefined }) {
    const { feature, onUpdate } = props;
    const setIcon = useCallback((e) => {
        if (feature !== undefined) {
            feature.properties = Object.assign({}, feature.properties, { "icon": e.target.value });
            onUpdate({ features: [feature] })
        }
    }, [onUpdate, feature]);

    const setName = useCallback((e) => {
        if (feature !== undefined) {
            feature.properties = Object.assign({}, feature.properties, { "name": e.target.value });
            onUpdate({ features: [feature] })
        }
    }, [onUpdate, feature]);

    const setColor = useCallback((color) => {
        if (feature !== undefined) {
            feature.properties = Object.assign({}, feature.properties, { "color": color.hex });
            onUpdate({ features: [feature] })
        }
    }, [onUpdate, feature]);

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
                                    <select onChange={setIcon}>
                                        <option>Icon</option>

                                        {Object.values(BabsIcons).map((icon) => (
                                            <option key={icon.name} label={icon.description}>{icon.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                : <></>}
            <div className="field is-horizontal">
                <div className="field-label is-normal">
                    <label className="label">Name</label>
                </div>
                <div className="field-body">
                    <div className="field is-expanded">
                        <div className="field">
                            <p className="control">
                                <input className="input" type="text" placeholder="Name" value={feature?.properties?.name} onChange={setName} />
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            {feature && feature.geometry.type !== "Point" && <Github colors={["#ff0000", "0000ff", "000000"]} onChangeComplete={setColor} />
            }
        </div >
    )
}

export default memo(MapComponent);