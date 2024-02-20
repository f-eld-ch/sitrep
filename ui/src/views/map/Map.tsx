
import { useMutation, useQuery, useReactiveVar } from '@apollo/client';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import DefaultMaker from 'assets/marker.svg';
import { AllIcons, LinePatterns, ZonePatterns } from 'components/BabsIcons';
import EnrichedLayerFeatures, { EnrichedSymbolSource } from 'components/map/EnrichedLayerFeatures';
import { Feature, FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Dispatch, SetStateAction, memo, useCallback, useEffect, useRef, useState } from 'react';
import { FullscreenControl, Map, MapProvider, MapRef, NavigationControl, ScaleControl, Source, useMap } from 'react-map-gl/maplibre';
import { useParams } from 'react-router-dom';
import Notification from 'utils/Notification';
import './control-panel.css';
import { BabsIconController } from './controls/BabsIconController';
import DrawControl from './controls/DrawControl';
import ExportControl from './controls/ExportControl';
import { StyleController, selectedStyle } from './controls/StyleController';
import { displayStyle, drawStyle } from './style';
import { AddFeatureToLayer, DeleteFeature, GetLayers, ModifyFeature } from './graphql';
import { AddFeatureVars, DeleteFeatureVars, GetLayersData, GetLayersVars, Layer, ModifyFeatureVars } from 'types/layer';
import { } from 'utils';
import { CleanFeature, FilterActiveFeatures, LayerToFeatureCollection } from './utils';
import { first } from 'lodash';
import { activeLayerVar } from 'cache';
import bbox from "@turf/bbox";
import LayerControl from './controls/LayerControl';
import { Layer as MapLayer } from 'react-map-gl';

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
            const id = e.id;
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
                    </Map>
                </MapProvider>
            </div >
        </>
    );
}

function Layers() {
    const { incidentId } = useParams();
    const { data, loading } = useQuery<GetLayersData, GetLayersVars>(GetLayers, {
        variables: { incidentId: incidentId || "" },
        pollInterval: 1000,
        fetchPolicy: "cache-first",
    });

    // setting active to first layer if none is active
    if (data && data.layers?.length > 0 && data?.layers.filter(l => l.isActive).length === 0) {
        let firstLayer = first(data.layers)?.id
        activeLayerVar(firstLayer)
    }

    return (
        <>
            {loading || !data ? <></> : <LayerControl layers={data.layers} />}

            {/* Active Layer */}
            <MemoActiveLayer layer={first(data?.layers.filter(l => l.isActive))} />

            {/* Inactive Layers */}
            <InactiveLayers layers={data?.layers.filter(l => !l.isActive) || []} />
        </>
    )
}
const MemoActiveLayer = memo(ActiveLayer);
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
        const createdFeatures: Feature[] = e.features;
        createdFeatures.forEach(f => {
            if (layer?.id === undefined) {
                return;
            }

            let feature = CleanFeature(f)
            addFeature({ variables: { layerId: layer.id, geometry: feature.geometry, id: feature.id, properties: feature.properties } })
        })
        setSelectedFeature(first(createdFeatures)?.id)
    }, [addFeature, layer, setSelectedFeature]);

    const onUpdate = useCallback((e: any) => {
        const updatedFeatures: Feature[] = e.features;
        setSelectedFeature(undefined);
        updatedFeatures.forEach(f => {
            let feature = CleanFeature(f)
            modifyFeature({ variables: { id: feature.id, geometry: feature.geometry, properties: feature.properties } })
        });
    }, [modifyFeature, setSelectedFeature]);

    const onDelete = useCallback((e: any) => {
        const deletedFeatures: Feature[] = e.features;
        deletedFeatures.forEach(f => {
            let feature = CleanFeature(f);
            deleteFeature({ variables: { id: feature.id, deletedAt: new Date() } })
        });
        setSelectedFeature(undefined);
    }, [deleteFeature, setSelectedFeature]);

    useEffect(() => {

        let fc = FilterActiveFeatures(featureCollection);
        if (initialized) {
            return
        }
        // only run this for the initialization as we don't want to continously 
        // change the map viewport on new features
        if (map !== undefined && fc.features.length > 0) {
            let bboxArray = bbox(fc);
            map.fitBounds(
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
            <MemoDraw featuresCollection={featureCollection} onCreate={onCreate} onDelete={onDelete} onUpdate={onUpdate} setSelectedFeature={setSelectedFeature} />
            {layer && layer.id ? <EnrichedLayerFeatures id={layer.id} featureCollection={featureCollection} selectedFeature={selectedFeature} /> : <></>}
            <BabsIconController selectedFeature={featureCollection.features.filter(f => f.id === selectedFeature).shift()} onUpdate={onUpdate} />
        </>
    )
}

const MemoDraw = memo(Draw);
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
        const features: Feature[] = e.features;
        if (features?.length > 0) {
            const feature = first(features);
            setSelectedFeature(feature?.id);
        }
        else {
            setSelectedFeature(undefined);
            draw && draw.changeMode("static");
        }
    }, [draw, setSelectedFeature]);

    const onCreateCallback = useCallback((e: any) => {
        onCreate(e);
        draw && draw.changeMode("static");
    }, [draw, onCreate]);

    const onUpdateCallback = useCallback((e: any) => {
        onUpdate(e);
        draw && draw.changeMode("static");
    }, [draw, onUpdate]);

    const onDeleteCallback = useCallback((e: any) => {
        onDelete(e);
        draw && draw.changeMode("static");
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
            <EnrichedSymbolSource id={id} featureCollection={featureCollection} />
            <Source key={id} id={id} type="geojson" data={featureCollection}>
                {
                    displayStyle.map(s => <MapLayer key={s.id} id={s.id + id} {...s} />)
                }
            </Source>
        </>
    )
}

const MemoMap = MapView;

export { MemoMap as Map };
