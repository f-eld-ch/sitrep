
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import DefaultMaker from 'assets/marker.svg';
import { AllIcons, LinePatterns, ZonePatterns } from 'components/BabsIcons';
import EnrichedLayerFeatures from 'components/map/EnrichedLayerFeatures';
import { Feature, FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { FullscreenControl, Map, MapProvider, MapRef, NavigationControl, ScaleControl, Source, useMap } from 'react-map-gl/maplibre';
import { useParams } from 'react-router-dom';
import Notification from 'utils/Notification';
import './control-panel.css';
import { BabsIconController } from './controls/BabsIconController';
import DrawControl from './controls/DrawControl';
import ExportControl from './controls/ExportControl';
import { StyleController, selectedStyle } from './controls/StyleController';
import { drawStyle } from './style';
import { AddFeatureToLayer, DeleteFeature, GetLayers, ModifyFeature } from './graphql';
import { AddFeatureVars, DeleteFeatureVars, GetLayersData, GetLayersVars, Layer, ModifyFeatureVars } from 'types/layer';
import { } from 'utils';
import { CleanFeature, FilterActiveFeatures, LayerToFeatureCollection } from './utils';
import { first } from 'lodash';
import { activeLayerVar } from 'cache';
import bbox from "@turf/bbox";


const modes = {
    ...MapboxDraw.modes,
    // 'draw_point': BabsPointMode
};

function MapView() {
    const mapRef = useRef<MapRef>(null);
    const mapStyle = useReactiveVar(selectedStyle);
    const [viewState, setViewState] = useState({
        latitude: 46.87148,
        longitude: 8.62994,
        zoom: 5,
        bearing: 0,
    });

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
        mapRef && mapRef.current && mapRef.current.on('styleimagemissing', function (e) {
            const id = e.id; // id of the missing image
            console.log("missing image", id);
            Object.values(Object.assign({}, AllIcons, LinePatterns, ZonePatterns)).filter(icon => id === icon.name).forEach(icon => {
                let customIcon = new Image(icon.size, icon.size);
                customIcon.src = icon.src;
                customIcon.onload = () => mapRef && mapRef.current && !mapRef.current.hasImage(icon.name) && mapRef.current.addImage(icon.name, customIcon)
            });
        });

    }, [mapRef]);

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

                        {/* All Map Controls */}
                        <FullscreenControl position={'top-left'} />
                        <NavigationControl position={'top-left'} visualizePitch={true} />
                        <StyleController />
                        <ScaleControl unit={"metric"} position={'bottom-left'} />
                        <ExportControl />
                        {/* Layersprovider and Draw */}
                        <Layers />
                        {/* <LayerControl /> */}
                    </Map>
                </MapProvider>
            </div >
        </>
    );
}

function Layers() {
    const { incidentId } = useParams();
    const { data } = useQuery<GetLayersData, GetLayersVars>(GetLayers, {
        variables: { incidentId: incidentId || "" },
        pollInterval: 1000,
        fetchPolicy: "cache-first",
    });

    // setting active to first layer if none is active
    if (data && data.layers?.length > 0 && data?.layers.filter(l => l.isActive).length === 0) {
        let firstLayer = first(data.layers)?.id
        console.log("setting active layer", firstLayer)
        activeLayerVar(firstLayer)
    }

    return (
        <>
            {/* Active Layer */}
            <ActiveLayer layer={first(data?.layers.filter(l => l.isActive))} />

            {/* Inactive Layers */}
            <InactiveLayers layers={data?.layers.filter(l => !l.isActive) || []} />
        </>
    )
}

function ActiveLayer(props: { layer: Layer | undefined }) {
    const { layer } = props;
    const [initialized, setInitalized] = useState(false);
    const { current: map } = useMap();
    const { incidentId } = useParams();
    const featureCollection = LayerToFeatureCollection(layer);
    const [selectedFeature, setSelectedFeature] = useState<string | number | undefined>();
    const [addFeature] = useMutation<Feature, AddFeatureVars>(AddFeatureToLayer, {
        refetchQueries: [{ query: GetLayers, variables: { incidentId: incidentId } }]
    });
    const [modifyFeature] = useMutation<Feature, ModifyFeatureVars>(ModifyFeature, {
        refetchQueries: [{ query: GetLayers, variables: { incidentId: incidentId } }]
    });

    const [deleteFeature] = useMutation<Feature, DeleteFeatureVars>(DeleteFeature, {
        refetchQueries: [{ query: GetLayers, variables: { incidentId: incidentId } }]
    });

    const onCreate = useCallback((e: any) => {
        console.log("[onCreate]", e)
        const createdFeatures: Feature[] = e.features;
        createdFeatures.forEach(f => {
            if (layer?.id === undefined) {
                console.log("undefined layer, discarding edit")
                return;
            }

            let feature = CleanFeature(f)
            console.log("adding feature", feature)
            addFeature({ variables: { layerId: layer.id, geometry: feature.geometry, id: feature.id, properties: feature.properties } })
        })
        setSelectedFeature(first(createdFeatures)?.id)
    }, [addFeature, layer, setSelectedFeature]);

    const onUpdate = useCallback((e: any) => {
        const updatedFeatures: Feature[] = e.features;
        setSelectedFeature(undefined);
        updatedFeatures.forEach(f => {
            let feature = CleanFeature(f)
            console.log("modifying", feature)
            modifyFeature({ variables: { id: feature.id, geometry: feature.geometry, properties: feature.properties } })
        });
    }, [modifyFeature, setSelectedFeature]);

    const onDelete = useCallback((e: any) => {
        console.log("[onDelete]", e);
        const deletedFeatures: Feature[] = e.features;
        deletedFeatures.forEach(f => {
            let feature = CleanFeature(f);
            deleteFeature({ variables: { id: feature.id, deletedAt: new Date() } })
        });
        setSelectedFeature(undefined);
    }, [deleteFeature, setSelectedFeature]);

    useEffect(() => {

        let fc = FilterActiveFeatures(featureCollection);
        console.log("effect", map)
        if (initialized) {
            console.log("already initialized")
            return
        }
        // only run this for the initialization as we don't want to continously 
        // change the map viewport on new features
        if (map !== undefined && fc.features.length > 0) {
            let bboxArray = bbox(fc);

            console.log("setting map bounding box for features", bboxArray);
            map && map.fitBounds(
                [[bboxArray[0], bboxArray[1]], [bboxArray[2], bboxArray[3]]],
                {
                    animate: true,
                    padding: { top: 30, bottom: 30, left: 30, right: 30, }
                }
            );
            setInitalized(true);
        }
    }, [featureCollection, map, selectedFeature, initialized, setInitalized]);

    return (
        <>
            <Draw featuresCollection={featureCollection} onCreate={onCreate} onDelete={onDelete} onUpdate={onUpdate} setSelectedFeature={setSelectedFeature} />
            <EnrichedLayerFeatures featureCollection={featureCollection} selectedFeature={selectedFeature} />
            <BabsIconController selectedFeature={featureCollection.features.filter(f => f.id === selectedFeature).shift()} onUpdate={onUpdate} />
        </>
    )
}

function Draw(props:
    {
        onCreate: (e: any) => void,
        onDelete: (e: any) => void,
        onUpdate: (e: any) => void,
        setSelectedFeature: Dispatch<SetStateAction<string | number | undefined>>,
        featuresCollection: FeatureCollection
    }) {

    const [draw, setDraw] = useState<MapboxDraw>();
    const { onCreate, onUpdate, onDelete, setSelectedFeature, featuresCollection } = props;

    const onSelectionChange = useCallback((e: any) => {
        console.log("[onSelectionChange]", e)
        const features: Feature[] = e.features;
        if (features?.length > 0) {
            const feature = first(features);
            setSelectedFeature(feature?.id);
        }
        else {
            setSelectedFeature(undefined);
            draw && draw.changeMode("static") && console.log("changed mode to static");
        }
    }, [draw, setSelectedFeature]);

    const onCreateCallback = useCallback((e: any) => {
        onCreate(e);
        draw && draw.changeMode("static") && console.log("changed mode to static");
    }, [draw, onCreate]);

    const onUpdateCallback = useCallback((e: any) => {
        onUpdate(e);
        draw && draw.changeMode("static") && console.log("changed mode to static");
    }, [draw, onUpdate]);

    const onDeleteCallback = useCallback((e: any) => {
        onDelete(e);
        draw && draw.changeMode("static") && console.log("changed mode to static");
    }, [draw, onDelete]);

    useEffect(() => {
        draw && draw.set(FilterActiveFeatures(featuresCollection));
    }, [draw, featuresCollection]);

    return (
        <>
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
                onCreate={onCreateCallback}
                onUpdate={onUpdateCallback}
                onDelete={onDeleteCallback}
                // onCombine={onCombine}
                onSelectionChange={onSelectionChange}
                userProperties={true}
            />
        </>
    )

}

function InactiveLayers(props: { layers: Layer[] }) {
    const { layers } = props;

    return (
        <>
            {
                layers.map(l =>
                    <InactiveLayer key={l.id} id={l.id} featureCollection={FilterActiveFeatures(LayerToFeatureCollection(l))} />
                )
            }
        </>
    )
}
function InactiveLayer(props: { featureCollection: FeatureCollection, id: string }) {
    const { featureCollection, id } = props;

    return (
        <>
            <EnrichedLayerFeatures featureCollection={featureCollection} />
            <Source id={id} type="geojson" data={featureCollection} />
        </>
    )
}


// function MapComponent() {
//     const [features, setFeatures] = useState<FeatureCollection>(featureCollection([]));


//     const onCreate = useCallback((e: any) => {
//         setFeatures(curFeatureCollection => {
//             const newFeatureCollection = { ...curFeatureCollection };
//             const createdFeatures: Feature[] = e.features;
//             createdFeatures.forEach(f => {
//                 if (f.properties) {
//                     f.properties['createdAt'] = new Date();
//                     newFeatureCollection.features.push(f);
//                 }
//             })
//             newFeatureCollection.features = unionBy(newFeatureCollection.features, curFeatureCollection.features, 'id');
//             return newFeatureCollection;
//         });
//     }, [setFeatures]);

//     const onUpdate = useCallback((e: any) => {
//         console.log("[onUpdate]", e)

//         setFeatures(curFeatureCollection => {
//             // an update creates a deleted feature with the old properties and adds a new one with the new properties
//             const newFeatureCollection = { ...curFeatureCollection };
//             newFeatureCollection.features = []

//             const updatedFeatures: Feature[] = e.features;
//             const modifiedFeatures: Feature[] = [];
//             updatedFeatures.forEach(f => {
//                 if (f.properties) {

//                     // fetch the old element
//                     let cur: Feature | undefined = curFeatureCollection.features.find(c => c.id === f.id)
//                     // make sure the old element is not identical to the current
//                     if (cur && isEqual(cur, f) && isEqual(cur?.properties, f?.properties)) {
//                         return;
//                     }

//                     // if we found the old one and it got changed, close it
//                     if (cur && cur.properties) {
//                         cur.properties['deletedAt'] = new Date();
//                         modifiedFeatures.push(cur);
//                     }

//                     // generate a new ID and 
//                     f.id = hat();
//                     f.properties['createdAt'] = new Date();
//                     f.properties['achestorID'] = cur?.id;
//                     modifiedFeatures.push(f);
//                 }
//             });
//             newFeatureCollection.features = [...curFeatureCollection.features, ...modifiedFeatures];

//             return newFeatureCollection;
//         });
//         setSelectedFeature(undefined);
//         draw?.changeMode("simple_select")
//     }, [setFeatures, setSelectedFeature, draw]);

//     const onDelete = useCallback((e: any) => {
//         console.log("[onDelete]", e);

//         setFeatures(curFeatureCollection => {
//             const newFeatureCollection = { ...curFeatureCollection };
//             const deletedFeatures: Feature[] = e.features;
//             deletedFeatures.forEach(f => {
//                 if (f.properties) {
//                     // fetch the old element and close it
//                     let cur: Feature | undefined = curFeatureCollection.features.find(c => c.id === f.id)
//                     if (cur && cur.properties) {
//                         cur.properties['deletedAt'] = new Date();
//                         newFeatureCollection.features.push(f);
//                     }
//                 }
//             });
//             newFeatureCollection.features = unionBy(newFeatureCollection.features, curFeatureCollection.features, 'id');

//             return newFeatureCollection;
//         });
//         setSelectedFeature(undefined);
//         draw?.changeMode("simple_select")
//     }, [setFeatures, setSelectedFeature, draw]);

//     const onSelectionChange = useCallback((e: { features: Feature<Geometry, GeoJsonProperties>[]; }) => {
//         console.log("[onSelectionChange]", e)
//         const features: Feature[] = e.features;
//         if (features.length >= 1) {
//             const feature = features[0];
//             // always work on the parent feature
//             if (feature.properties?.parent) {
//                 setSelectedFeature(feature.properties.parent);
//                 draw?.changeMode('simple_select', { featureIds: [feature.properties.parent] })
//                 return
//             }
//             setSelectedFeature(feature.id);
//         }
//         else {
//             setSelectedFeature(undefined);
//             draw?.changeMode("simple_select")
//         }
//     }, [setSelectedFeature, draw]);


//     useEffect(() => {

//         isMapLoaded && draw && draw.set(filteredFC);
//         console.log("update map", filteredFC)
//     }, [features, isMapLoaded, draw]);

//     return (
//         <>
//             <h3 className="title is-size-3 is-capitalized">Lage</h3>
//             <Notification timeout={5000} type={"warning"}>
//                 <p>Das Lagebild wird nicht mit dem Server synchronisiert, aber lokal gespeichert.</p>
//             </Notification>
//             <div className='mapbox container-flex'>
//                 <MapProvider>
//                     <Map
//                         ref={mapRef}
//                         mapLib={maplibregl}
//                         onLoad={onMapLoad}
//                         attributionControl={true}
//                         minZoom={8}
//                         maxZoom={19}
//                         {...viewState}
//                         onMove={e => setViewState(e.viewState)}
//                         mapStyle={mapStyle.uri}
//                     >
//                         <FullscreenControl position={'top-left'} />
//                         <NavigationControl position={'top-left'} visualizePitch={true} />
//                         {/* <Source id="wms-geo" type="raster" tiles={[`https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&LAYERS=ch.bfs.gebaeude_wohnungs_register&LANG=de&WIDTH=256&HEIGHT=256&CRS=EPSG%3A3857&STYLES=&BBOX={bbox-epsg-3857}`]} tileSize={256} >
//                         <Layer type='raster' />
//                     </Source> */}
//                         <DrawControl
//                             position="top-right"
//                             setDraw={setDraw}
//                             displayControlsDefault={false}
//                             styles={drawStyle}
//                             controls={{
//                                 polygon: true,
//                                 trash: true,
//                                 point: true,
//                                 line_string: true,
//                                 combine_features: false,
//                                 uncombine_features: false,
//                             }}
//                             boxSelect={false}
//                             clickBuffer={10}
//                             defaultMode="simple_select"
//                             modes={modes}
//                             onCreate={onCreate}
//                             onUpdate={onUpdate}
//                             onDelete={onDelete}
//                             // onCombine={onCombine}
//                             onSelectionChange={onSelectionChange}
//                             userProperties={true}
//                         />
//                         {/* <LayerControl /> */}
//                         <BabsIconController selectedFeature={features.features.filter(f => f.id === selectedFeature).shift()} onUpdate={onUpdate} />
//                         <EnrichedLayerFeatures featureCollection={features} selectedFeature={selectedFeature} />


//                         {/* <StyleSwitcherControl position={'bottom-right'} styles={[
//                         {
//                             title: "Basiskarte",
//                             uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json"
//                         },
//                         {
//                             title: "Satellit",
//                             uri: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte-imagery.vt/style.json"
//                         },
//                     ]} options={{ eventListeners: { onChange: () => { onMapLoad(); return true } } }} />*/}
//                         <StyleController />
//                         <ScaleControl unit={"metric"} position={'bottom-left'} />
//                         <ExportControl />
//                         {/* <FeatureDetailControl feature={features.features.filter(f => f.id === selectedFeature).shift()}>
//                         <FeatureDetail onUpdate={onUpdate} feature={features.features.filter(f => f.id === selectedFeature).shift()} />
//                     </FeatureDetailControl> */}
//                     </Map>
//                 </MapProvider>
//             </div>
//         </>
//     );
// }

const MemoMap = MapView;

export { MemoMap as Map };
