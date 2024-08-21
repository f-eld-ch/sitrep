import { makeVar, useReactiveVar } from "@apollo/client";
import { faMap } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from "classnames";
import React, { useCallback, useState } from "react";
import "./StyleController.scss";
import basisKarte from 'assets/map/styles/ch.swisstopo.leichte-basiskarte.vt.json?url';
import basisKarteImagery from 'assets/map/styles/ch.swisstopo.leichte-basiskarte-imagery.vt.json?url';

const MapStyles: MapStyle[] = [
    {
        name: "Basiskarte",
        uri: basisKarte,
    },
    {
        name: "Satellit",
        uri: basisKarteImagery,
    },
]

export const selectedStyle = makeVar<MapStyle>(MapStyles[0]);
export const activeLayer = makeVar<string>("");

type MapStyle = {
    name: string,
    uri: string,
}

function StyleController() {
    const [active, setActive] = useState<boolean>(false);

    const style = useReactiveVar(selectedStyle);

    const btnClass = classNames({
        'maplibregl-ctrl-icon': true,
        'active': active,
        'is-hidden': active,
    });

    const switcherClass = classNames({
        'maplibregl-style-list': true,
        'maplibregl-ctrl-icon': true,
        'is-hidden': !active,
    })

    const onClick = useCallback((u: MapStyle) => {
        console.log("selected map style", u)
        setActive(false);
        selectedStyle(u);
    }, [setActive]);

    return (
        <div className='maplibregl-ctrl maplibregl-ctrl-group' >
            <button type="button" className={btnClass} onClick={() => setActive(!active)}><FontAwesomeIcon icon={faMap} size="lg" /></button>
            <div className={switcherClass}>
                {MapStyles.map((s) => { return <button type="button" className={classNames({ "button": true, "active": style.name === s.name })} key={s.name} onClick={() => onClick(s)}>{s.name}</button> })}
            </div >
        </div>
    );
}

const memoController = React.memo(StyleController)

export { memoController as StyleController };
