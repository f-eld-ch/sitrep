import { faLayerGroup } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useState } from "react";
import "./LayerControl.scss";

import { } from 'components/BabsIcons';

function LayerPanel() {
    const [active, setActive] = useState<string>()
    const [visble, setVisible] = useState<string>()

    return (
        <div className="maplibregl-ctrl-bottom-right mapboxgl-ctrl-bottom-right">
            <div className='mapboxgl-ctrl mapboxgl-ctrl-group'>
                <button type="button" className='maplibregl-ctrl-icon'><FontAwesomeIcon icon={faLayerGroup} size="xl" /></button>
            </div>
        </div >
    );
}

export default React.memo(LayerPanel);