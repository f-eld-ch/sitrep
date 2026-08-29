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
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useAddLayer } from "api";
import { LayerContext } from "../LayerContext";

const ActiveLayersControl: React.FC = () => {
  const { state, dispatch } = useContext(LayerContext);
  const [showAddLayer, setShowAddLayer] = useState<boolean>(false);
  const [layerName, setLayerName] = useState<string>("");
  const [addLayer] = useAddLayer();
  const { incidentId } = useParams();
  const { t } = useTranslation();

  const handleLayerClick = (layerId: string) => {
    dispatch({ type: "SET_ACTIVE_LAYER", payload: { layerId } });
  };

  const handleAddLayer = (name: string) => {
    if (name.trim() === "" || !incidentId) return;
    void addLayer({ incidentId, name });
    setLayerName("");
    setShowAddLayer(false);
  };

  const handleVisibilityToggle = (layerId: string, isVisible: boolean) => {
    dispatch({
      type: "TOGGLE_LAYER_VISIBILITY",
      payload: { layerId: layerId, isVisible },
    });
  };

  return (
    <div className="active-layers-control is-size-7">
      {state.layers.map((s) => (
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
              <FontAwesomeIcon
                icon={state.activeLayer === s.layer.id ? faEdit : faDrawPolygon}
                size="lg"
              />
            </span>
            <button type="button" onClick={() => handleLayerClick(s.layer.id)}>
              {s.layer.name}
            </button>
          </div>
          {s.layer.id !== state.activeLayer && (
            <div className="is-align-items-flex-end is-flex-shrink-0">
              <button
                className="mr-2 is-align-self-center"
                type="button"
                onClick={() => handleVisibilityToggle(s.layer.id, !s.isVisible)}
              >
                <FontAwesomeIcon icon={s.isVisible ? faEye : faEyeSlash} />
              </button>
              <button
                className="mr-2 is-align-self-center"
                type="button"
                onClick={() => handleLayerClick(s.layer.id)}
              >
                <FontAwesomeIcon icon={faEdit} />
              </button>
            </div>
          )}
        </div>
      ))}
      {!showAddLayer && (
        <div className="panel-block is-align-items-flex-start is-justify-content-space-between is-flex-direction-column is-size-7">
          <button type="button" onClick={() => setShowAddLayer(true)}>
            <span className="icon is-small">
              <FontAwesomeIcon icon={faPlus} />
            </span>
            <span>{t("layerControl.addLayer")}</span>
          </button>
        </div>
      )}
      {showAddLayer && (
        <div className="panel-block is-align-items-flex-start is-justify-content-space-between is-flex-direction-column is-size-7">
          <input
            type="text"
            placeholder={t("layerControl.layerName")}
            value={layerName}
            onChange={(e) => setLayerName(e.target.value)}
            className="input is-small mb-2"
          />
          <button
            type="submit"
            disabled={layerName.trim() === ""}
            className="button is-primary is-small is-rounded"
            onClick={() => handleAddLayer(layerName)}
          >
            <span className="icon is-small">
              <FontAwesomeIcon icon={faPlus} />
            </span>
            <span>{t("layerControl.addLayer")}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ActiveLayersControl;
