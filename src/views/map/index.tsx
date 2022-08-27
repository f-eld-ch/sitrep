
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { Feature, FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { FullscreenControl, Map, MapRef, Marker, NavigationControl, ScaleControl } from 'react-map-gl';
import DrawControl from './DrawControl';
import MapIcons, { BabsIcons } from './MapIcons';
import style from './style';

const modes = {
    ...MapboxDraw.modes,
};


export function MapComponent() {
    const [draw, setDraw] = useState<MapboxDraw>();
    const mapRef = useRef<MapRef>();

    const [features, setFeatures] = useState<FeatureCollection>({ "type": "FeatureCollection", "features": [{ "id": "775e8f6bc028342da6049bcdf17ee089", "type": "Feature", "properties": {}, "geometry": { "coordinates": [8.644308154993183, 46.86835026495743], "type": "Point" } }, { "id": "775e8f6bc028342da6049bcdf17ee089", "type": "Feature", "properties": {}, "geometry": { "coordinates": [8.636779598438778, 46.88505318042553], "type": "Point" } }, { "id": "beee8e1c04b4d5cc4ee175b129847389", "type": "Feature", "properties": {}, "geometry": { "coordinates": [[[8.604540756827362, 46.88790384354587], [8.611739113533702, 46.89034100033123], [8.615173191962015, 46.89052152605822], [8.616493991357515, 46.89029586880457], [8.618144990602701, 46.88844544351235], [8.623194670583871, 46.87836818856752], [8.62240219094656, 46.87723963716476], [8.620420991853337, 46.87642706545742], [8.614807594422444, 46.87647220865287], [8.608005477534704, 46.877329922150466], [8.605694078592592, 46.880760639041824], [8.602920399862057, 46.885048726685255], [8.601203360647872, 46.88784708326057], [8.599948601222138, 46.8865833274003], [8.601005240738544, 46.88780194963539], [8.604540756827362, 46.88790384354587]]], "type": "Polygon" } }, { "id": "beee8e1c04b4d5cc4ee175b129847389", "type": "Feature", "properties": {}, "geometry": { "coordinates": [[[8.604540756827362, 46.88790384354587], [8.611739113533702, 46.89034100033123], [8.615173191962015, 46.89052152605822], [8.616493991357515, 46.89029586880457], [8.618144990602701, 46.88844544351235], [8.623194670583871, 46.87836818856752], [8.62240219094656, 46.87723963716476], [8.620420991853337, 46.87642706545742], [8.614807594422444, 46.87647220865287], [8.608005477534704, 46.877329922150466], [8.605694078592592, 46.880760639041824], [8.602920399862057, 46.885048726685255], [8.601203360647872, 46.88784708326057], [8.601665640436266, 46.88671873192163], [8.601005240738544, 46.88780194963539], [8.604540756827362, 46.88790384354587]]], "type": "Polygon" } }, { "id": "beee8e1c04b4d5cc4ee175b129847389", "type": "Feature", "properties": {}, "geometry": { "coordinates": [[[8.604540756827362, 46.88790384354587], [8.611739113533702, 46.89034100033123], [8.615173191962015, 46.89052152605822], [8.616493991357515, 46.89029586880457], [8.618144990602701, 46.88844544351235], [8.623194670583871, 46.87836818856752], [8.62240219094656, 46.87723963716476], [8.620420991853337, 46.87642706545742], [8.614807594422444, 46.87647220865287], [8.608005477534704, 46.877329922150466], [8.605694078592592, 46.880760639041824], [8.602920399862057, 46.885048726685255], [8.601203360647872, 46.88784708326057], [8.601665640436266, 46.88671873192163], [8.601005240738544, 46.88780194963539], [8.604540756827362, 46.88790384354587]]], "type": "Polygon" } }, { "id": "beee8e1c04b4d5cc4ee175b129847389", "type": "Feature", "properties": {}, "geometry": { "coordinates": [[[8.604540756827362, 46.88790384354587], [8.611739113533702, 46.89034100033123], [8.615173191962015, 46.89052152605822], [8.616493991357515, 46.89029586880457], [8.618144990602701, 46.88844544351235], [8.623194670583871, 46.87836818856752], [8.62240219094656, 46.87723963716476], [8.620420991853337, 46.87642706545742], [8.614807594422444, 46.87647220865287], [8.608005477534704, 46.877329922150466], [8.605694078592592, 46.880760639041824], [8.602920399862057, 46.885048726685255], [8.601203360647872, 46.88784708326057], [8.601665640436266, 46.88671873192163], [8.601848055588391, 46.887680102391215], [8.604540756827362, 46.88790384354587]]], "type": "Polygon" } }, { "id": "beee8e1c04b4d5cc4ee175b129847389", "type": "Feature", "properties": {}, "geometry": { "coordinates": [[[8.604540756827362, 46.88790384354587], [8.611739113533702, 46.89034100033123], [8.615173191962015, 46.89052152605822], [8.616493991357515, 46.89029586880457], [8.618144990602701, 46.88844544351235], [8.623194670583871, 46.87836818856752], [8.62240219094656, 46.87723963716476], [8.620420991853337, 46.87642706545742], [8.614807594422444, 46.87647220865287], [8.608005477534704, 46.877329922150466], [8.605694078592592, 46.880760639041824], [8.602920399862057, 46.885048726685255], [8.601203360647872, 46.88784708326057], [8.601617016502672, 46.88775998179182], [8.601848055588391, 46.887680102391215], [8.604540756827362, 46.88790384354587]]], "type": "Polygon" } }, { "id": "beee8e1c04b4d5cc4ee175b129847389", "type": "Feature", "properties": {}, "geometry": { "coordinates": [[[8.604540756827362, 46.88790384354587], [8.611739113533702, 46.89034100033123], [8.615173191962015, 46.89052152605822], [8.616493991357515, 46.89029586880457], [8.618144990602701, 46.88844544351235], [8.623194670583871, 46.87836818856752], [8.62240219094656, 46.87723963716476], [8.620420991853337, 46.87642706545742], [8.614807594422444, 46.87647220865287], [8.608005477534704, 46.877329922150466], [8.605694078592592, 46.880760639041824], [8.602920399862057, 46.885048726685255], [8.601203360647872, 46.88784708326057], [8.601617016502672, 46.88775998179182], [8.601848055588391, 46.887680102391215], [8.604540756827362, 46.88790384354587]]], "type": "Polygon" } }, { "id": "beee8e1c04b4d5cc4ee175b129847389", "type": "Feature", "properties": {}, "geometry": { "coordinates": [[[8.604540756827362, 46.88790384354587], [8.611739113533702, 46.89034100033123], [8.615173191962015, 46.89052152605822], [8.616493991357515, 46.89029586880457], [8.618144990602701, 46.88844544351235], [8.623194670583871, 46.87836818856752], [8.62240219094656, 46.87723963716476], [8.620420991853337, 46.87642706545742], [8.614807594422444, 46.87647220865287], [8.608005477534704, 46.877329922150466], [8.605694078592592, 46.880760639041824], [8.602920399862057, 46.885048726685255], [8.601203360647872, 46.88784708326057], [8.60145493672394, 46.88775998179182], [8.601848055588391, 46.887680102391215], [8.604540756827362, 46.88790384354587]]], "type": "Polygon" } }] }
    );
    const onUpdate = useCallback(e => {
        console.log(e);
        setFeatures(curFeatureCollection => {
            const newFeatureCollection = { ...curFeatureCollection };
            const features: Feature[] = e.features;
            for (const f of features) {
                if (f.geometry.type === "Point") {
                    f.properties = Object.assign({}, f.properties, { "icon-name": BabsIcons.KantonalesFuehrungsorgan.name });
                    draw?.setFeatureProperty(f.id?.toString() || "", "icon-name", BabsIcons.KantonalesFuehrungsorgan.name)
                    console.log(draw?.getAll());
                }
                newFeatureCollection.features.push(f);
            }
            return newFeatureCollection;
        });
    }, [draw]);

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
                newFeatureCollection.features.push(f);
            }
            return newFeatureCollection;
        });
    }, []);

    const [symbols] = useState([{
        id: 1,
        coordinates: [46.88061, 8.64463],
        icon: BabsIcons.KantonalesFuehrungsorgan.src,
    },
    {
        id: 2,
        coordinates: [46.88074, 8.61234],
        icon: BabsIcons.KantonalesFuehrungsorgan.src,
    },
    {
        id: 3,
        coordinates: [46.86240, 8.62903],
        icon: BabsIcons.KantonalesFuehrungsorgan.src,
    },
    ]);

    const markers = useMemo(() => symbols.map(symbol => (
        <Marker key={symbol.id}
            latitude={symbol.coordinates[0]}
            longitude={symbol.coordinates[1]}
        >
            <img src={symbol.icon} alt="KFO" width={48} height={48} />

        </Marker>)
    ), [symbols]);

    const onMapLoad = useCallback(() => {
        mapRef && mapRef.current && mapRef.current.on("load", () => console.log("maploaded"))
    }, []);

    return (
        <>
            <h3 className="title is-size-3 is-capitalized">Lage</h3>
            <Map
                onLoad={onMapLoad}
                mapLib={maplibregl}
                attributionControl={true}
                initialViewState={{
                    latitude: 46.87148,
                    longitude: 8.62994,
                    zoom: 12,
                }}
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
                        combine_features: false,
                        uncombine_features: false,
                    }}
                    boxSelect={false}
                    clickBuffer={10}
                    defaultMode="draw_point"
                    modes={modes}
                    onCreate={onUpdate}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onCombine={onCombine}
                    userProperties={true}
                />
                <MapIcons draw={draw} initialFeatures={features} />
                <ScaleControl unit={"metric"} position={'bottom-left'} />
                {markers}
            </Map>
            {/* <div>{JSON.stringify(features)}</div> */}
        </>
    );
}

export default memo(MapComponent);