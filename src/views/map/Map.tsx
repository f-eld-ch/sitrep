
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

import DefaultMaker from 'assets/marker.svg';
import { AllIcons, LinePatterns, ZonePatterns } from 'components/BabsIcons';
import { Feature, FeatureCollection } from 'geojson';
import hat from 'hat';
import { isEqual, unionBy } from 'lodash';
import isEmpty from 'lodash/isEmpty';
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
    const [features, setFeatures] = useLocalStorage<FeatureCollection>(`map-incident-${incidentId}`, { "type": "FeatureCollection", "features": [], });
    // const [features, setFeatures] = useState<FeatureCollection>({ "type": "FeatureCollection", "features": [] });


    const onCreate = useCallback(e => {
        setFeatures(curFeatureCollection => {
            console.log("[update]: current features created", e)

            const newFeatureCollection = { ...curFeatureCollection };
            const createdFeatures: Feature[] = e.features;
            createdFeatures.forEach(f => {
                if (f.properties) {
                    f.properties['createdAt'] = new Date();
                    newFeatureCollection.features.push(f);
                }
            })

            console.log("Creating feature", createdFeatures)
            newFeatureCollection.features = unionBy(newFeatureCollection.features, curFeatureCollection.features, 'id');
            return newFeatureCollection;
        });
    }, [setFeatures]);

    const onUpdate = useCallback(e => {
        setFeatures(curFeatureCollection => {
            // an update creates a deleted feature with the old properties and adds a new one with the new properties
            const newFeatureCollection = { ...curFeatureCollection };
            newFeatureCollection.features = []

            const updatedFeatures: Feature[] = e.features;
            const modifiedFeatures: Feature[] = [];
            updatedFeatures.forEach(f => {
                console.log("[update]: current features updated", e)
                if (f.properties) {

                    // fetch the old element
                    let cur: Feature | undefined = curFeatureCollection.features.find(c => c.id === f.id)
                    // make sure the old element is not identical to the current
                    if (cur && isEqual(cur, f) && isEqual(cur?.properties, f?.properties)) {
                        console.log("[update]: current ", cur)
                        console.log("[update]: identical")
                        return;
                    }

                    // if we found the old one and it got changed, close it
                    if (cur && cur.properties) {
                        cur.properties['deletedAt'] = new Date();
                        console.log("[update] storing deleted feature", cur)
                        modifiedFeatures.push(cur);
                    }

                    // generate a new ID and 
                    f.id = hat();
                    f.properties['createdAt'] = new Date();
                    f.properties['achestorID'] = cur?.id;
                    console.log("[update] storing added feature", f)

                    modifiedFeatures.push(f);
                }
            });
            console.log("[update] modified features", modifiedFeatures)

            newFeatureCollection.features = [...curFeatureCollection.features, ...modifiedFeatures];
            console.log("[update] resulting feature collection", newFeatureCollection)

            return newFeatureCollection;
        });
    }, [setFeatures]);

    const onDelete = useCallback(e => {
        setFeatures(curFeatureCollection => {
            console.log("[delete]: current features updated", e)

            const newFeatureCollection = { ...curFeatureCollection };
            const deletedFeatures: Feature[] = e.features;
            deletedFeatures.forEach(f => {
                if (f.properties) {
                    // fetch the old element and close it
                    let cur: Feature | undefined = curFeatureCollection.features.find(c => c.id === f.id)
                    if (cur && cur.properties) {
                        cur.properties['deletedAt'] = new Date();
                        newFeatureCollection.features.push(cur);
                    }
                }
            });
            newFeatureCollection.features = unionBy(newFeatureCollection.features, curFeatureCollection.features, 'id');

            return newFeatureCollection;
        });
    }, [setFeatures]);

    const onCombine = useCallback(e => {
        console.log("onCombine", e);
        setFeatures(curFeatureCollection => {
            const createdFeatures: Feature[] = e.createdFeatures;
            const deletedFeatures: Feature[] = e.deletedFeatures;
            deletedFeatures.forEach(f => { if (f.properties) { f.properties['deletedAt'] = Date.now() } })
            createdFeatures.forEach(f => { if (f.properties) { f.properties['createdAt'] = Date.now() } })

            const newFeatureCollection = { ...curFeatureCollection };

            // newFeatureCollection.features = pullAllBy(curFeatureCollection.features, deletedFeatures, 'id');
            newFeatureCollection.features = unionBy(createdFeatures, newFeatureCollection.features, 'id');
            return newFeatureCollection;
        });
    }, [setFeatures]);


    const onSelectionChange = useCallback(e => {
        const features: Feature[] = e.features;
        if (features.length === 1) {
            setSelectedFeature(features[0].id);
        }
        else {
            setSelectedFeature(undefined);
        }
    }, [setSelectedFeature]);

    useEffect(() => {
        if (!mapRef || !isMapLoaded || !draw || !features || isEmpty(features.features)) {
            return;
        }

        console.log("current features", features)
        let filteredFC: FeatureCollection = { "type": "FeatureCollection", "features": [] };
        filteredFC.features = Object.assign([], features.features.filter(f => f.properties?.deletedAt === undefined))
        console.log("applied features", filteredFC)

        draw.set(filteredFC);
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
                    {/* <Source id="wms-geo" type="raster" tiles={[`https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&LAYERS=ch.bfs.gebaeude_wohnungs_register&LANG=de&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&STYLES=&BBOX={bbox-epsg-3857}`]} tileSize={256} >
                        <Layer type='raster' />
                    </Source> */}
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
                        onCreate={onCreate}
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
const layerStyle = {
    id: 'point',
    type: 'circle',
    paint: {
        'circle-radius': 10,
        'circle-color': '#007cbf'
    }
};
const MemoMap = memo(MapComponent);

export { MemoMap as Map };
