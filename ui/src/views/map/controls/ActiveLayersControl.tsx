import {
  faDrawPolygon,
  faEdit,
  faEye,
  faEyeSlash,
  faObjectGroup,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import type React from "react";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useAddLayer } from "api";
import { LayerContext, type DrawingLayerState } from "../LayerContext";

interface LayerGroup {
  sourceIncidentId: string;
  sourceIncidentName: string;
  isInherited: boolean;
  layers: DrawingLayerState[];
}

export function groupLayersForControl(
  layers: DrawingLayerState[],
  incidentId: string | undefined,
): LayerGroup[] {
  const groups: LayerGroup[] = [];

  for (const layerState of layers) {
    const sourceIncidentId = layerState.layer.sourceIncidentId;
    const existing = groups.find((group) => group.sourceIncidentId === sourceIncidentId);
    if (existing) {
      existing.layers.push(layerState);
      continue;
    }

    groups.push({
      sourceIncidentId,
      sourceIncidentName: layerState.layer.sourceIncidentName,
      isInherited: sourceIncidentId !== incidentId,
      layers: [layerState],
    });
  }

  return groups;
}

export function hasOwnLayerGroup(groups: LayerGroup[]): boolean {
  return groups.some((group) => !group.isInherited);
}

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

  const addLayerControl = showAddLayer ? (
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
  ) : (
    <div className="panel-block is-align-items-flex-start is-justify-content-space-between is-flex-direction-column is-size-7">
      <button type="button" onClick={() => setShowAddLayer(true)}>
        <span className="icon is-small">
          <FontAwesomeIcon icon={faPlus} />
        </span>
        <span>{t("layerControl.addLayer")}</span>
      </button>
    </div>
  );

  const layerGroups = groupLayersForControl(state.layers, incidentId);
  const hasOwnGroup = hasOwnLayerGroup(layerGroups);

  return (
    <div className="active-layers-control is-size-7">
      {!hasOwnGroup && (
        <div>
          <div className="panel-block py-1 has-text-weight-semibold has-text-grey is-size-7">
            {t("layerControl.currentIncidentLayers")}
          </div>
          {addLayerControl}
        </div>
      )}
      {layerGroups.map((group) => (
        <div key={group.sourceIncidentId}>
          <div className="panel-block py-1 has-text-weight-semibold has-text-grey is-size-7">
            {group.isInherited ? group.sourceIncidentName : t("layerControl.currentIncidentLayers")}
          </div>
          {group.layers.map((s) => {
            const isInherited = group.isInherited;

            return (
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
                      icon={
                        isInherited
                          ? faObjectGroup
                          : state.activeLayer === s.layer.id
                            ? faEdit
                            : faDrawPolygon
                      }
                      size="lg"
                    />
                  </span>
                  <button
                    type="button"
                    className={classNames({
                      "has-text-weight-bold": state.activeLayer === s.layer.id,
                    })}
                    onClick={() => handleLayerClick(s.layer.id)}
                  >
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
                    {!isInherited && (
                      <button
                        className="mr-2 is-align-self-center"
                        type="button"
                        onClick={() => handleLayerClick(s.layer.id)}
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!group.isInherited && addLayerControl}
        </div>
      ))}
    </div>
  );
};

export default ActiveLayersControl;
