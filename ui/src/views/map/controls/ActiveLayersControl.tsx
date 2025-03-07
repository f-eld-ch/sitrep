import {
  faDrawPolygon,
  faEdit,
  faEye,
  faEyeSlash,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import type React from "react";
import { useContext, useState } from "react";
import { useMutation } from "@apollo/client";
import type { Layer } from "types/layer";
import { type DrawingLayerState, LayerContext } from "../LayerContext";
import { AddLayer, GetLayers } from "../graphql";
import { useParams } from "react-router";

const ActiveLayersControl: React.FC = () => {
  const { state, dispatch } = useContext(LayerContext);
  const [showAddLayer, setShowAddLayer] = useState<boolean>(false);
  const [layerName, setLayerName] = useState<string>("");
  const [addLayer] = useMutation(AddLayer);
  const { incidentId } = useParams();

  const handleLayerClick = (layerId: string) => {
    dispatch({ type: "SET_ACTIVE_LAYER", payload: { layerId } });
  };

  const handleAddLayer = (layerName: string) => {
    if (layerName.trim() === "") return;
    addLayer({
      variables: { incidentId, name: layerName },
      refetchQueries: [
        { query: GetLayers, variables: { incidentId: incidentId } },
      ],
      onError: (error) => {
        console.error("Error adding feature:", error);
      },
      optimisticResponse: (id: any) => {
        return {
          __typename: "Mutation",
          insertFeaturesOne: {
            __typename: "Layer",
            id: id,
            createdAt: new Date(),
            updatedAt: null,
            deletedAt: null,
          },
        };
      },
    });
    setLayerName("");
    setShowAddLayer(false);
  };

  const handleVisibilityToggle = (layerId: string, isVisible: boolean) => {
    dispatch({
      type: "TOGGLE_LAYER_VISIBILITY",
      payload: { layerName: layerId, isVisible },
    });
  };

  return (
    <div className="active-layers-control is-size-7">
      {state.layers.map((s: DrawingLayerState) => (
        <div
          key={s.layer.id}
          className={classNames({
            "panel-block": true,
            "is-align-items-flex-start": true,
            "is-justify-content-space-between": true,
            "is-active": state.activeLayer === s.layer.id,
          })}
        >
          <div className="mr-3 is-align-items-flex-start is-align-content-center">
            <span className="panel-icon" style={{ verticalAlign: "center" }}>
              <FontAwesomeIcon icon={state.activeLayer === s.layer.id ? faEdit : faDrawPolygon} size="lg" />
            </span>
            {/* biome-ignore lint/a11y/useValidAnchor: not needed */}
            <a onClick={() => handleLayerClick(s.layer.id)}>{s.layer.name}</a>
          </div>
          <div className="is-align-items-flex-end is-flex-shrink-0">
            <button
              className="mr-2 is-align-self-center"
              type="button"
              onClick={() =>
                handleVisibilityToggle(s.layer.id, !s.isVisible)
              }
            >
              <FontAwesomeIcon icon={s.isVisible ? faEye : faEyeSlash} />
            </button>
          </div>
        </div>
      ))}
      {!showAddLayer && (
        <div className="panel-block is-align-items-flex-start is-justify-content-space-between is-flex-direction-column is-size-7">
          <button
            type="button"
            className="button is-small is-rounded"
            onClick={() => setShowAddLayer(true)}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2" />
            Add Layer
          </button>
        </div>
      )}
      {showAddLayer && (
        <div className="panel-block is-align-items-flex-start is-justify-content-space-between is-flex-direction-column is-size-7">
          <input
            type="text"
            placeholder="Enter layer name"
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            className="input is-small mb-2"
          />
          <button
            type="submit"
            className="button is-primary is-small"
            onClick={() => handleAddLayer(layerName)}
          >
            Add Layer
          </button>
        </div>
      )}
    </div>
  );
};

export default ActiveLayersControl;