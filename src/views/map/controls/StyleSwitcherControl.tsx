import { MapboxStyleDefinition, MapboxStyleSwitcherControl, MapboxStyleSwitcherOptions } from "mapbox-gl-style-switcher";
import React from "react";
import { ControlPosition, useControl } from "react-map-gl";

import "mapbox-gl-style-switcher/styles.css";

export type StyleSwitcherControlProps = {
    /** Placement of the control relative to the map. */
    position?: ControlPosition;
    /** CSS style override, applied to the control's container */
    style?: React.CSSProperties;
    styles: MapboxStyleDefinition[];
    options?: MapboxStyleSwitcherOptions;
};

function StyleSwitcherControl(props: StyleSwitcherControlProps): null {
    const { styles, options } = props;
    useControl<MapboxStyleSwitcherControl>(
        ({ mapLib }) =>
            new MapboxStyleSwitcherControl(styles, options),
        { position: props.position }
    );

    return null;
}

export default StyleSwitcherControl;