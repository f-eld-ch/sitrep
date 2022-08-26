import ABCDekontaminationsstelle from 'assets/babs/ABCDekontaminationsstelle.svg';
import AbsperrungEinsatzraum from 'assets/babs/AbsperrungEinsatzraum.svg';
import KantonalesFuehrungsorgan from 'assets/babs/KantonalesFuehrungsorgan.svg';

import { memo, useEffect } from "react";
import { useMap } from "react-map-gl";

const BabsIcons = [
    {
        src: ABCDekontaminationsstelle,
        name: 'ABCDekontaminationsstelle'
    },
    {
        src: AbsperrungEinsatzraum,
        name: 'AbsperrungEinsatzraum'
    },
    {
        src: KantonalesFuehrungsorgan,
        name: 'KantonalesFuehrungsorgan'
    }
];

function MapIcons() {

    const map = useMap();


    useEffect(() => {
        map && map.current && map.current.on('load', function () {
            BabsIcons.forEach(icon => {
                console.log("loading icon", icon.name);
                let customIcon = new Image(24, 24);
                customIcon.onload = () => map && map.current && map.current.addImage(icon.name, customIcon)
                customIcon.src = icon.src;
            });
        });
    }, [map]);

    return null;
}


export default memo(MapIcons);