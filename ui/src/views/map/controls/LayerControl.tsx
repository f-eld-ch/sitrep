import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useCallback, useEffect, useState } from "react";
import "./LayerControl.scss";
import { Layer } from 'types/layer';
import { activeLayerVar } from 'cache';
import classNames from 'classnames';
import { useReactiveVar } from '@apollo/client';

function LayerPanel(props: { layers: Layer[] }) {
    const [active, setActive] = useState<boolean>(false);
    const activeLayer = useReactiveVar(activeLayerVar);

    const [activeLayerState, setActiveLayerState] = useState<string>(activeLayer);

    const { layers } = props;

    const btnClass = classNames({
        'maplibregl-ctrl-icon': true,
        'active': active,
        'is-hidden': active,
    });

    const switcherClass = classNames({
        'maplibregl-layer-list': true,
        'maplibregl-ctrl-icon': true,
        'is-hidden': !active,
        'mr-50': true,
    })

    const onClick = useCallback((l: Layer) => {
        setActive(false);
        setActiveLayerState(l.id);
    }, [setActive]);

    useEffect(() => {
        activeLayerVar(activeLayerState);
    }, [activeLayerState])

    return (
        <div className="maplibregl-ctrl-bottom-right mapboxgl-ctrl-bottom-right" style={{ paddingBottom: "65px" }}>
            <div className='mapboxgl-ctrl mapboxgl-ctrl-group' >
                <button type="button" className={btnClass} onClick={() => setActive(!active)}><FontAwesomeIcon icon={faLayerGroup} size="lg" /></button>
                <div className={switcherClass}>
                    {layers.map((l) => { return <button type="button" className={classNames({ "button": true, "active": activeLayer === l.id })} key={l.id} onClick={() => onClick(l)}>{l.name}</button> })}
                </div >
            </div>
        </div >
    );
}

export default React.memo(LayerPanel);