import MapboxDraw from '@mapbox/mapbox-gl-draw';
import ABCDekontaminationsstelle from 'assets/babs/ABCDekontaminationsstelle.svg';
import AbsperrungEinsatzraum from 'assets/babs/AbsperrungEinsatzraum.svg';
import KantonalesFuehrungsorgan from 'assets/babs/KantonalesFuehrungsorgan.svg';
import { FeatureCollection } from 'geojson';

import { memo, useEffect } from "react";
import { useMap } from "react-map-gl";

export const BabsIcons = {
    ABCDekontaminationsstelle: {
        src: ABCDekontaminationsstelle,
        name: 'ABCDekontaminationsstelle'
    },
    AbsperrungEinsatzraum: {
        src: AbsperrungEinsatzraum,
        name: 'AbsperrungEinsatzraum'
    },
    KantonalesFuehrungsorgan: {
        src: KantonalesFuehrungsorgan,
        name: 'KantonalesFuehrungsorgan'
    }
};

type MapIconProps = {
    initialFeatures?: FeatureCollection;
    draw: MapboxDraw | undefined;
}

function MapIcons(props: MapIconProps) {

    const map = useMap();
    const { initialFeatures, draw } = props;

    useEffect(() => {
        map && map.current && map.current.on('load', function () {
            Object.values(BabsIcons).forEach(icon => {
                let customIcon = new Image(48, 48);
                customIcon.onload = () => map && map.current && !map.current.hasImage(icon.name) && map.current.addImage(icon.name, customIcon)
                customIcon.src = icon.src;
            });
            console.log("loading initial features", initialFeatures);
            initialFeatures && draw && draw.set(initialFeatures);
        });
    }, [map, initialFeatures, draw]);

    return null;
}


export default memo(MapIcons);