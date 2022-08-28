import ABCDekontaminationsstelle from 'assets/babs/ABCDekontaminationsstelle.svg';
import AbsperrungEinsatzraum from 'assets/babs/AbsperrungEinsatzraum.svg';
import KantonalesFuehrungsorgan from 'assets/babs/KantonalesFuehrungsorgan.svg';
import Teilzerstoerung from 'assets/babs/Teilzerstoerung.svg';


import { memo, useEffect } from "react";
import { useMap } from "react-map-gl";

export const BabsIcons = {
    ABCDekontaminationsstelle: {
        name: 'ABCDekontaminationsstelle',
        description: "ABC Dekontaminationsstelle",
        src: ABCDekontaminationsstelle,
        size: 48,
    },
    AbsperrungEinsatzraum: {
        name: 'AbsperrungEinsatzraum',
        description: "Absperrung des Einsatzraums",
        src: AbsperrungEinsatzraum,
        size: 48,
    },
    KantonalesFuehrungsorgan: {
        name: 'KantonalesFuehrungsorgan',
        description: "Kantonales Führungsorgan",
        src: KantonalesFuehrungsorgan,
        size: 48,
    },
    Teilzerstoerung: {
        src: Teilzerstoerung,
        name: 'Teilzerstoerung',
        description: "Teilzerstörung",
        size: 32,
    }
};

type MapIconProps = {
    // initialFeatures?: FeatureCollection;
    // draw: MapboxDraw | undefined;
}

function MapIcons(props: MapIconProps) {

    const map = useMap();
    // const { initialFeatures, draw } = props;

    useEffect(() => {
        map && map.current && map.current.on('load', function () {
            Object.values(BabsIcons).forEach(icon => {
                console.log("adding Image", icon.name)
                let customIcon = new Image(icon.size, icon.size);
                customIcon.onload = () => map && map.current && !map.current.hasImage(icon.name) && map.current.addImage(icon.name, customIcon)
                customIcon.src = icon.src;
            });
        });
    }, [map]);

    return null;
}


export default memo(MapIcons);