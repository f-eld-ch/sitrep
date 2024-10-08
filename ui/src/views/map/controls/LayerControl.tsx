import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useCallback, useContext, useState } from "react";
import "./LayerControl.scss";
import { Layer } from "types/layer";
import classNames from "classnames";
import { LayerContext } from "../LayerContext";

function LayerPanel() {
  const [active, setActive] = useState<boolean>(false);
  const { state, dispatch } = useContext(LayerContext);

  const btnClass = classNames({
    "maplibregl-ctrl-icon": true,
    active: active,
    "is-hidden": active,
  });

  const switcherClass = classNames({
    "maplibregl-layer-list": true,
    "maplibregl-ctrl-icon": true,
    "is-hidden": !active,
    "mr-50": true,
  });

  const onClick = useCallback(
    (l: Layer) => {
      setActive(false);
      dispatch({ type: "SET_ACTIVE_LAYER", payload: { layerId: l.id } });
    },
    [dispatch],
  );

  return (
    <div className="maplibregl-ctrl maplibregl-ctrl-group">
      <button type="button" className={btnClass} onClick={() => setActive(!active)}>
        <FontAwesomeIcon icon={faLayerGroup} size="lg" />
      </button>
      <div className={switcherClass}>
        {state.layers.map((l) => {
          return (
            <button
              type="button"
              className={classNames({ button: true, active: state.activeLayer === l.id })}
              key={l.id}
              onClick={() => onClick(l)}
            >
              {l.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(LayerPanel);
