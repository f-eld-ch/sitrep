
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import center from '@turf/center';

import { feature as turfFeature, Geometry } from '@turf/helpers';
import DefaultMaker from 'assets/marker.svg';
import { AllIcons, LinePatterns, ZonePatterns } from 'components/BabsIcons';
import { Feature, FeatureCollection } from 'geojson';
import { unionBy } from 'lodash';
import isEmpty from 'lodash/isEmpty';
import pullAllBy from 'lodash/pullAllBy';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FullscreenControl, Map, MapRef, NavigationControl, ScaleControl } from 'react-map-gl';
import { useParams } from 'react-router-dom';
import Notification from 'utils/Notification';
import useLocalStorage from 'utils/useLocalStorage';
import './control-panel.css';
import DrawControl from './controls/DrawControl';
import ExportControl from './controls/ExportControl';
import FeatureDetailControlPanel from './controls/FeatureDetailControl';
import StyleSwitcherControl from './controls/StyleSwitcherControl';
import FeatureDetail from './FeatureDetails';
import style from './style';

const modes = {
    ...MapboxDraw.modes,
    // 'draw_point': BabsPointMode
};


function MapComponent() {
    const [draw, setDraw] = useState<MapboxDraw>();
    const [selectedFeature, setSelectedFeature] = useState<string | number | undefined>();
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
            setSelectedFeature(features[0].id);
            mapRef && mapRef.current && mapRef.current.flyTo({ center: [centerPoint.geometry.coordinates[0], centerPoint.geometry.coordinates[1]], essential: true })
        }
        else {
            setSelectedFeature(undefined);
        }
    }, [setSelectedFeature, mapRef]);

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

        Object.values(AllIcons).forEach(icon => {
            let customIcon = new Image(48, 48);
            customIcon.onload = () => mapRef && mapRef.current && !mapRef.current.hasImage(icon.name) && mapRef.current.addImage(icon.name, customIcon)
            customIcon.src = icon.src;
        });
        setIsMapLoaded(true);
        mapRef && mapRef.current && mapRef.current.on('styleimagemissing', function (e) {
            const id = e.id; // id of the missing image
            console.log("missing image", id);
            Object.values(Object.assign({}, AllIcons, LinePatterns, ZonePatterns)).filter(icon => id === icon.name).forEach(icon => {
                let customIcon = new Image(icon.size, icon.size);
                customIcon.onload = () => mapRef && mapRef.current && !mapRef.current.hasImage(icon.name) && mapRef.current.addImage(icon.name, customIcon)
                customIcon.src = icon.src;
            });
        });
    }, [setIsMapLoaded, mapRef]);

    return (
        <>
            <h3 className="title is-size-3 is-capitalized">Lage</h3>
            <Notification timeout={5000} type={"warning"}>
                <p>Das Lagebild wird nicht mit dem Server synchronisiert, aber lokal gespeichert.</p>
            </Notification>
            <div className='container-flex'>
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
                        },
                    ]} options={{ eventListeners: { onChange: () => { onMapLoad(); return true } } }} />
                    <ScaleControl unit={"metric"} position={'bottom-left'} />
                    <ExportControl />
                    <FeatureDetailControlPanel feature={features.features.filter(f => f.id === selectedFeature).shift()}>
                        <FeatureDetail onUpdate={onUpdate} feature={features.features.filter(f => f.id === selectedFeature).shift()} />
                    </FeatureDetailControlPanel>
                </Map>
            </div>
        </>
    );
}

const MemoMap = memo(MapComponent);

export { MemoMap as Map };
