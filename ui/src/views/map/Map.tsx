
import { useReactiveVar } from '@apollo/client';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import bbox from "@turf/bbox";
import DefaultMaker from 'assets/marker.svg';
import { AllIcons, LinePatterns, ZonePatterns } from 'components/BabsIcons';
import EnrichedLayerFeatures from 'components/map/EnrichedLayerFeatures';
import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import hat from 'hat';
import { isEqual, unionBy } from 'lodash';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { FullscreenControl, Map, MapProvider, MapRef, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import { useParams } from 'react-router-dom';
import Notification from 'utils/Notification';
import useLocalStorage from 'utils/useLocalStorage';
import './control-panel.css';
import { BabsIconController } from './controls/BabsIconController';
import DrawControl from './controls/DrawControl';
import ExportControl from './controls/ExportControl';
import { StyleController, selectedStyle } from './controls/StyleController';
import { drawStyle } from './style';


const modes = {
    ...MapboxDraw.modes,
    // 'draw_point': BabsPointMode
};


function MapComponent() {
    const [draw, setDraw] = useState<MapboxDraw>();
    const [selectedFeature, setSelectedFeature] = useState<string | number | undefined>();
    const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

    const mapRef = useRef<MapRef>(null);

    const mapStyle = useReactiveVar(selectedStyle);

    const { incidentId } = useParams();
    const [features, setFeatures] = useLocalStorage<FeatureCollection>(`map-incident-${incidentId}`, { "type": "FeatureCollection", "features": [], });
    const [viewState, setViewState] = useState({
        latitude: 46.87148,
        longitude: 8.62994,
        zoom: 5,
        bearing: 0,
    });

    const onCreate = useCallback((e: any) => {
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const createdFeatures: Feature[] = e.features;
            createdFeatures.forEach(f => {
                if (f.properties) {
                    f.properties['createdAt'] = new Date();
                    newFeatureCollection.features.push(f);
                }
            })
            newFeatureCollection.features = unionBy(newFeatureCollection.features, curFeatureCollection.features, 'id');
            return newFeatureCollection;
        });
    }, [setFeatures]);

    const onUpdate = useCallback((e: any) => {
        console.log("[onUpdate]", e)

        setFeatures(curFeatureCollection => {
            // an update creates a deleted feature with the old properties and adds a new one with the new properties
            const newFeatureCollection = { ...curFeatureCollection };
            newFeatureCollection.features = []

            const updatedFeatures: Feature[] = e.features;
            const modifiedFeatures: Feature[] = [];
            updatedFeatures.forEach(f => {
                if (f.properties) {

                    // fetch the old element
                    let cur: Feature | undefined = curFeatureCollection.features.find(c => c.id === f.id)
                    // make sure the old element is not identical to the current
                    if (cur && isEqual(cur, f) && isEqual(cur?.properties, f?.properties)) {
                        return;
                    }

                    // if we found the old one and it got changed, close it
                    if (cur && cur.properties) {
                        cur.properties['deletedAt'] = new Date();
                        modifiedFeatures.push(cur);
                    }

                    // generate a new ID and 
                    f.id = hat();
                    f.properties['createdAt'] = new Date();
                    f.properties['achestorID'] = cur?.id;
                    modifiedFeatures.push(f);
                }
            });
            newFeatureCollection.features = [...curFeatureCollection.features, ...modifiedFeatures];

            return newFeatureCollection;
        });
        setSelectedFeature(undefined);
        draw?.changeMode("simple_select")
    }, [setFeatures, setSelectedFeature, draw]);

    const onDelete = useCallback((e: any) => {
        console.log("[onDelete]", e);

        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const deletedFeatures: Feature[] = e.features;
            deletedFeatures.forEach(f => {
                if (f.properties) {
                    // fetch the old element and close it
                    let cur: Feature | undefined = curFeatureCollection.features.find(c => c.id === f.id)
                    if (cur && cur.properties) {
                        cur.properties['deletedAt'] = new Date();
                        newFeatureCollection.features.push(f);
                    }
                }
            });
            newFeatureCollection.features = unionBy(newFeatureCollection.features, curFeatureCollection.features, 'id');

            return newFeatureCollection;
        });
        setSelectedFeature(undefined);
        draw?.changeMode("simple_select")
    }, [setFeatures, setSelectedFeature, draw]);

    const onSelectionChange = useCallback((e: { features: Feature<Geometry, GeoJsonProperties>[]; }) => {
        console.log("[onSelectionChange]", e)
        const features: Feature[] = e.features;
        if (features.length >= 1) {
            const feature = features[0];
            // always work on the parent feature
            if (feature.properties?.parent) {
                setSelectedFeature(feature.properties.parent);
                draw?.changeMode('simple_select', { featureIds: [feature.properties.parent] })
                return
            }
            setSelectedFeature(feature.id);
        }
        else {
            setSelectedFeature(undefined);
            draw?.changeMode("simple_select")
        }
    }, [setSelectedFeature, draw]);

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
                customIcon.src = icon.src;
                customIcon.onload = () => mapRef && mapRef.current && !mapRef.current.hasImage(icon.name) && mapRef.current.addImage(icon.name, customIcon)
            });
        });

        // set the right bounds of the map based on the feature collection
        let filteredFC: FeatureCollection = { "type": "FeatureCollection", "features": [] };
        filteredFC.features = Object.assign([], features.features.filter(f => f.properties?.deletedAt === undefined))
        if (filteredFC.features.length > 0) {
            let bboxArray = bbox(filteredFC);
            mapRef && mapRef.current && mapRef.current.fitBounds(
                [[bboxArray[0], bboxArray[1]], [bboxArray[2], bboxArray[3]]],
                {
                    animate: true,
                    padding: { top: 30, bottom: 30, left: 30, right: 30, }
                }
            );
        }

    }, [setIsMapLoaded, mapRef, features]);


    useEffect(() => {
        let filteredFC: FeatureCollection = { "type": "FeatureCollection", "features": [] };
        filteredFC.features = Object.assign([], features.features.filter(f => f.properties?.deletedAt === undefined))
        isMapLoaded && draw && draw.set(filteredFC);
        console.log("update map", filteredFC)
    }, [features, isMapLoaded, draw]);

    return (
        <>
            <h3 className="title is-size-3 is-capitalized">Lage</h3>
            <Notification timeout={5000} type={"warning"}>
                <p>Das Lagebild wird nicht mit dem Server synchronisiert, aber lokal gespeichert.</p>
            </Notification>
            <div className='mapbox container-flex'>
                <MapProvider>
                    <Map
                        ref={mapRef}
                        mapLib={maplibregl}
                        onLoad={onMapLoad}
                        attributionControl={true}
                        minZoom={8}
                        maxZoom={19}
                        {...viewState}
                        onMove={e => setViewState(e.viewState)}
                        mapStyle={mapStyle.uri}
                    >
                        <FullscreenControl position={'top-left'} />
                        <NavigationControl position={'top-left'} visualizePitch={true} />
                        {/* <Source id="wms-geo" type="raster" tiles={[`https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&LAYERS=ch.bfs.gebaeude_wohnungs_register&LANG=de&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&STYLES=&BBOX={bbox-epsg-3857}`]} tileSize={256} >
                        <Layer type='raster' />
                    </Source> */}
                        <DrawControl
                            position="top-right"
                            setDraw={setDraw}
                            displayControlsDefault={false}
                            styles={drawStyle}
                            controls={{
                                polygon: true,
                                trash: true,
                                point: true,
                                line_string: true,
                                combine_features: false,
                                uncombine_features: false,
                            }}
                            boxSelect={false}
                            clickBuffer={10}
                            defaultMode="simple_select"
                            modes={modes}
                            onCreate={onCreate}
                            onUpdate={onUpdate}
                            onDelete={onDelete}
                            // onCombine={onCombine}
                            onSelectionChange={onSelectionChange}
                            userProperties={true}
                        />
                        {/* <LayerControl /> */}
                        <BabsIconController selectedFeature={features.features.filter(f => f.id === selectedFeature).shift()} onUpdate={onUpdate} />
                        <EnrichedLayerFeatures featureCollection={features} selectedFeature={selectedFeature} />

                        {/* <StyleSwitcherControl position={'bottom-right'} styles={[
                        {
                            title: "Basiskarte",
                            uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json"
                        },
                        {
                            title: "Satellit",
                            uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte-imagery.vt/style.json"
                        },
                    ]} options={{ eventListeners: { onChange: () => { onMapLoad(); return true } } }} />*/}
                        <StyleController />
                        <ScaleControl unit={"metric"} position={'bottom-left'} />
                        <ExportControl />
                        {/* <FeatureDetailControl feature={features.features.filter(f => f.id === selectedFeature).shift()}>
                        <FeatureDetail onUpdate={onUpdate} feature={features.features.filter(f => f.id === selectedFeature).shift()} />
                    </FeatureDetailControl> */}
                    </Map>
                </MapProvider>
            </div>
        </>
    );
}

const MemoMap = memo(MapComponent);

export { MemoMap as Map };
