import {
  faDrawPolygon,
  faEdit,
  faEye,
  faEyeSlash,
  faObjectGroup,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type React from "react";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useAddLayer } from "api";
import { Button } from "components/ui";
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
    <div className="flex flex-col items-start px-3 py-2 border-b border-gray-200 text-xs">
      <input
        type="text"
        placeholder={t("layerControl.layerName")}
        value={layerName}
        onChange={(e) => setLayerName(e.target.value)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-2"
      />
      <Button
        variant="primary"
        size="sm"
        disabled={layerName.trim() === ""}
        onClick={() => handleAddLayer(layerName)}
      >
        <span className="mr-1">
          <FontAwesomeIcon icon={faPlus} />
        </span>
        <span>{t("layerControl.addLayer")}</span>
      </Button>
    </div>
  ) : (
    <div className="flex flex-col items-start px-3 py-2 border-b border-gray-200 text-xs">
      <button type="button" onClick={() => setShowAddLayer(true)}>
        <span className="mr-1">
          <FontAwesomeIcon icon={faPlus} />
        </span>
        <span>{t("layerControl.addLayer")}</span>
      </button>
    </div>
  );

  const layerGroups = groupLayersForControl(state.layers, incidentId);
  const hasOwnGroup = hasOwnLayerGroup(layerGroups);

  return (
    <div className="active-layers-control text-xs">
      {!hasOwnGroup && (
        <div>
          <div className="flex items-center px-3 py-1 border-b border-gray-200 last:border-b-0 text-xs font-semibold text-gray-500">
            {t("layerControl.currentIncidentLayers")}
          </div>
          {addLayerControl}
        </div>
      )}
      {layerGroups.map((group) => (
        <div key={group.sourceIncidentId}>
          <div className="flex items-center px-3 py-1 border-b border-gray-200 last:border-b-0 text-xs font-semibold text-gray-500">
            {group.isInherited ? group.sourceIncidentName : t("layerControl.currentIncidentLayers")}
          </div>
          {group.layers.map((s) => {
            const isInherited = group.isInherited;

            return (
              <div
                key={s.layer.id}
                className={`flex items-start justify-between px-3 py-2 border-b border-gray-200 last:border-b-0 text-xs ${state.activeLayer === s.layer.id ? "bg-primary/10" : ""}`}
              >
                <div className="mr-3 flex items-center">
                  <span className="inline-flex items-center justify-center w-[1em] h-[1em] mr-3">
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
                    className={state.activeLayer === s.layer.id ? "font-bold" : ""}
                    onClick={() => handleLayerClick(s.layer.id)}
                  >
                    {s.layer.name}
                  </button>
                </div>
                {s.layer.id !== state.activeLayer && (
                  <div className="flex items-end shrink-0">
                    <button
                      className="mr-2 self-center"
                      type="button"
                      onClick={() => handleVisibilityToggle(s.layer.id, !s.isVisible)}
                    >
                      <FontAwesomeIcon icon={s.isVisible ? faEye : faEyeSlash} />
                    </button>
                    {!isInherited && (
                      <button
                        className="mr-2 self-center"
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
