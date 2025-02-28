import React, { useContext } from "react";
import { LayerContext, WMSLayer } from "../LayerContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash, faTrash, faHexagonNodesBolt, faDrawPolygon } from "@fortawesome/free-solid-svg-icons";
import { Layer } from "types/layer";
import classNames from "classnames";

const ActiveLayersControl: React.FC = () => {
    const { state, dispatch } = useContext(LayerContext);

    const handleVisibilityToggle = (layerName: string, isVisible: boolean) => {
        dispatch({ type: "TOGGLE_LAYER_VISIBILITY", payload: { layerName, isVisible } });
    };

    const handleWMSOpacityChange = (layerName: string, opacity: number) => {
        dispatch({ type: "UPDATE_WMS_LAYER_OPACITY", payload: { layerName, opacity } });
    };

    const handleLayerClick = (layerId: string) => {
        dispatch({ type: "SET_ACTIVE_LAYER", payload: { layerId } });
    };

    const handleDeleteLayer = (layerName: string) => {
        dispatch({ type: "REMOVE_WMS_LAYER", payload: { layerName } });
    };

    return (
        <div className="active-layers-control is-size-7">
            {state.layers.map((layer: Layer) => (
                <div key={layer.id} className={classNames({ "panel-block": true, "is-align-items-flex-start": true, "is-justify-content-space-between": true, "is-active": state.activeLayer === layer.name })}>
                    <div className="mr-3 is-align-items-flex-start is-align-content-center">
                        <span className="panel-icon" style={{ verticalAlign: "center" }}>
                            <FontAwesomeIcon icon={faDrawPolygon} size="lg" />
                        </span>
                        <a onClick={() => handleLayerClick(layer.id)}>{layer.name}</a>
                    </div>
                </div>

            ))}
            {state.wmsLayers.map((layer: WMSLayer) => (
                <div key={layer.name} className="panel-block is-align-items-flex-start is-justify-content-space-between">
                    <div className="mr-3 is-align-items-flex-start is-align-content-center">
                        <span className="panel-icon" style={{ verticalAlign: "center" }}>
                            <FontAwesomeIcon icon={faHexagonNodesBolt} size="lg" />
                        </span>
                        <span>{layer.title}</span>
                    </div>
                    <div className="is-align-items-flex-end">
                        <button onClick={() => handleVisibilityToggle(layer.name, !layer.isVisible)} style={{ marginRight: "10px" }}>
                            <FontAwesomeIcon icon={layer.isVisible ? faEye : faEyeSlash} />
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={layer.opacity}
                            onChange={(e) => handleWMSOpacityChange(layer.name, parseFloat(e.target.value))}
                            style={{ marginRight: "10px" }}
                        />
                        <button onClick={() => handleDeleteLayer(layer.name)}>
                            <FontAwesomeIcon icon={faTrash} />
                        </button>
                    </div>
                </div>
            ))
            }
        </div >
    );
};

export default ActiveLayersControl;
