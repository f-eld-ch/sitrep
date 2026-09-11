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
    <div className="flex flex-col items-start border-b border-gray-200 px-3 py-2 text-xs">
      <input
        type="text"
        placeholder={t("layerControl.layerName")}
        value={layerName}
        onChange={(e) => setLayerName(e.target.value)}
        className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
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
    <div className="flex flex-col items-start border-b border-gray-200 px-3 py-2 text-xs">
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
    <div className="text-xs">
      {!hasOwnGroup && (
        <div>
          <div className="flex items-center border-b border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 last:border-b-0">
            {t("layerControl.currentIncidentLayers")}
          </div>
          {addLayerControl}
        </div>
      )}
      {layerGroups.map((group) => (
        <div key={group.sourceIncidentId}>
          <div className="flex items-center border-b border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 last:border-b-0">
            {group.isInherited ? group.sourceIncidentName : t("layerControl.currentIncidentLayers")}
          </div>
          {group.layers.map((s) => {
            const isInherited = group.isInherited;

            return (
              <div
                key={s.layer.id}
                className={`flex cursor-pointer items-center justify-between border-b border-gray-200 px-3 py-2 text-xs transition-colors last:border-b-0 hover:bg-gray-100 ${state.activeLayer === s.layer.id ? "bg-primary/10 hover:bg-primary/20" : ""}`}
                onClick={() => handleLayerClick(s.layer.id)}
              >
                <div className={`mr-3 flex flex-1 items-center ${state.activeLayer === s.layer.id ? "font-bold" : ""}`}>
                  <span className="mr-3 inline-flex h-[1em] w-[1em] shrink-0 items-center justify-center">
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
                  {s.layer.name}
                </div>
                {s.layer.id !== state.activeLayer && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      className="leading-none transition-colors hover:text-primary"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleVisibilityToggle(s.layer.id, !s.isVisible); }}
                    >
                      <FontAwesomeIcon icon={s.isVisible ? faEye : faEyeSlash} />
                    </button>
                    {!isInherited && (
                      <button
                        className="leading-none transition-colors hover:text-primary"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleLayerClick(s.layer.id); }}
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
