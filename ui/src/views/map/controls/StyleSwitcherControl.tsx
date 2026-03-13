import {
  type MapboxStyleDefinition,
  MapboxStyleSwitcherControl,
  type MapboxStyleSwitcherOptions,
} from "mapbox-gl-style-switcher";
import type React from "react";
import { type ControlPosition, useControl } from "react-map-gl/maplibre";

import "mapbox-gl-style-switcher/styles.css";

export interface StyleSwitcherControlProps {
  /** Placement of the control relative to the map. */
  position?: ControlPosition;
  /** CSS style override, applied to the control's container */
  style?: React.CSSProperties;
  styles: MapboxStyleDefinition[];
  options?: MapboxStyleSwitcherOptions;
}

function StyleSwitcherControl(props: StyleSwitcherControlProps): null {
  const { styles, options } = props;
  // @ts-expect-error - MapboxStyleSwitcherControl is has wrong types declared
  useControl<MapboxStyleSwitcherControl>(() => new MapboxStyleSwitcherControl(styles, options), {
    position: props.position,
  });

  return null;
}

export default StyleSwitcherControl;
