import GFS from 'assets/babs/Gemeindefuehrungsorgan.svg';
import KFO from 'assets/babs/KantonalesFuehrungsorgan.svg';

import MapboxDraw from '@mapbox/mapbox-gl-draw';
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { Feature } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { memo, useCallback, useMemo, useState } from 'react';
import { FullscreenControl, Map, Marker, NavigationControl, ScaleControl } from 'react-map-gl';
import DrawControl from './DrawControl';
import MapIcons from './MapIcons';

const modes = {
    ...MapboxDraw.modes,
};

export function MapComponent() {
    const [features, setFeatures] = useState<Record<string, Feature>>({ "0976882431873bcfda97359f59130c9d": { "id": "0976882431873bcfda97359f59130c9d", "type": "Feature", "properties": {}, "geometry": { "coordinates": [[[8.607680963550678, 46.89578989058219], [8.61184215415031, 46.87566509030461], [8.617468181800191, 46.868745215725966], [8.62580765757292, 46.86330503277219], [8.634872083387009, 46.86679101862971], [8.635447501666128, 46.86819710450147], [8.635911147888134, 46.869240607253786], [8.635724862309237, 46.870022460074644], [8.644109400305268, 46.87869760610951], [8.643636645639916, 46.88026030880803], [8.643832261331404, 46.88169440033174], [8.641183516418895, 46.8828195980282], [8.637974077997344, 46.88327073806448], [8.635823690747458, 46.88529114356109], [8.625019157712586, 46.89371511074398], [8.614934990165153, 46.90042062680402], [8.613948249417774, 46.89955987746683], [8.607680963550678, 46.89578989058219]]], "type": "Polygon" } }, "a00dc8d7b2614aa9a7cef2fcf7eeaecb": { "id": "a00dc8d7b2614aa9a7cef2fcf7eeaecb", "type": "Feature", "properties": {}, "geometry": { "coordinates": [8.643350717398818, 46.86109743093846], "type": "Point" } } }
    );

    const onUpdate = useCallback(e => {
        setFeatures(currFeatures => {
            const newFeatures = { ...currFeatures };
            for (const f of e.features) {
                newFeatures[f.id] = f;
            }
            return newFeatures;
        });
    }, []);

    const onDelete = useCallback(e => {
        setFeatures(currFeatures => {
            const newFeatures = { ...currFeatures };
            for (const f of e.features) {
                delete newFeatures[f.id];
            }
            return newFeatures;
        });
    }, []);

    const onCombine = useCallback(e => {
        setFeatures(currFeatures => {
            const newFeatures = { ...currFeatures };
            for (const f of e.deletedFeatures) {
                delete newFeatures[f.id];
            }
            for (const f of e.createdFeatures) {
                newFeatures[f.id] = f;
            }
            return newFeatures;
        });
    }, []);

    const [symbols] = useState([{
        id: 1,
        coordinates: [46.88061, 8.64463],
        icon: KFO,
    },
    {
        id: 2,
        coordinates: [46.88074, 8.61234],
        icon: GFS,
    },
    {
        id: 3,
        coordinates: [46.86240, 8.62903],
        icon: GFS,
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

    return (
        <>
            <h3 className="title is-size-3 is-capitalized">Lage</h3>
            <Map
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
                    displayControlsDefault={false}
                    controls={{
                        polygon: true,
                        trash: true,
                        point: true,
                        line_string: true,
                        combine_features: false,
                        uncombine_features: false,
                    }}
                    initialFeatures={features}
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
                <MapIcons />
                <ScaleControl unit={"metric"} position={'bottom-left'} />
                {markers}
            </Map>
            <div>{JSON.stringify(features)}</div>
        </>
    );
}

export default memo(MapComponent);