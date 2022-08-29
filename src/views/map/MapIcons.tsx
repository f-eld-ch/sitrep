import { BabsIcons } from 'components/BabsIcons';

import DefaultMaker from 'assets/marker.svg';
import { memo, useEffect } from "react";
import { useMap } from "react-map-gl";

type MapIconProps = {
    // initialFeatures?: FeatureCollection;
    // draw: MapboxDraw | undefined;
}

function MapIcons(props: MapIconProps) {

    const map = useMap();
    // const { initialFeatures, draw } = props;

    useEffect(() => {
        map && map.current && map.current.on('load', function () {
            // Add the default marker
            let defaultMarker = new Image(32, 32);
            defaultMarker.onload = () => map && map.current && !map.current.hasImage('default_marker') && map.current.addImage('default_marker', defaultMarker);
            defaultMarker.src = DefaultMaker;

            // add all BabsIcons
            Object.values(BabsIcons).forEach(icon => {
                let customIcon = new Image(icon.size, icon.size);
                customIcon.onload = () => map && map.current && !map.current.hasImage(icon.name) && map.current.addImage(icon.name, customIcon)
                customIcon.src = icon.src;
            });
        });
    }, [map]);

    return null;
}


export default memo(MapIcons);