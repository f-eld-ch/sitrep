import {
  MaplibreStyleDefinition,
  MaplibreStyleSwitcherControl,
  MaplibreStyleSwitcherOptions,
} from "./style-switcher";
import React from "react";
import { ControlPosition, useControl } from "@vis.gl/react-maplibre";

import "./style-switcher/styleSwitcher.scss";

export interface StyleSwitcherControlProps {
  /** Placement of the control relative to the map. */
  position?: ControlPosition;
  /** CSS style override, applied to the control's container */
  style?: React.CSSProperties;
  styles: MaplibreStyleDefinition[];
  options?: MaplibreStyleSwitcherOptions;
}

function StyleSwitcherControl(props: StyleSwitcherControlProps): null {
  const { styles, options } = props;
  useControl<MaplibreStyleSwitcherControl>(() => new MaplibreStyleSwitcherControl(styles, options), {
    position: props.position,
  });

  return null;
}

export default StyleSwitcherControl;
