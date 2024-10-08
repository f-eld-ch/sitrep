import { Layer } from "types/layer";
import { ActiveLayerState, DrawState, LayersState, SelectedFeatureState } from "./LayerContext";
import { first } from "lodash";
import MapboxDraw from "@mapbox/mapbox-gl-draw";

// All valid actions
export type LayersAction =
  | SetLayerAction
  | AddLayerAction
  | RemoveLayerAction
  | SelectFeatureAction
  | DeselectFeature
  | SetActiveLayer
  | SetDrawLayer;

export interface SetLayerAction {
  type: "SET_LAYERS";
  payload: {
    layers: Layer[];
  };
}

export interface AddLayerAction {
  type: "ADD_LAYER";
  payload: {
    layer: Layer;
  };
}

export interface RemoveLayerAction {
  type: "REMOVE_LAYER";
  payload: {
    id: string;
  };
}

export interface SetActiveLayer {
  type: "SET_ACTIVE_LAYER";
  payload: {
    layerId: string;
  };
}

export interface SelectFeatureAction {
  type: "SELECT_FEATURE";
  payload: {
    id: string | undefined;
  };
}

export interface DeselectFeature {
  type: "DESELECT_FEATURE";
  payload: null;
}

export interface SetDrawLayer {
  type: "SET_DRAW";
  payload: {
    draw: MapboxDraw | undefined;
  };
}

export const layersReducer = (state: LayersState, action: LayersAction) => {
  switch (action.type) {
    case "SET_LAYERS":
      return action.payload.layers;
    case "ADD_LAYER":
      return [...state, action.payload.layer];
    case "REMOVE_LAYER":
      return [...state.filter((layer) => layer.id !== action.payload.id)];
    default:
      return state;
  }
};

export const selectedFeatureReducer = (state: SelectedFeatureState, action: LayersAction) => {
  switch (action.type) {
    case "SELECT_FEATURE":
      return action.payload.id;
    case "DESELECT_FEATURE":
      return undefined;
    default:
      return state;
  }
};

export const activeLayerReducer = (state: ActiveLayerState, action: LayersAction) => {
  switch (action.type) {
    case "SET_ACTIVE_LAYER":
      return action.payload.layerId;
    case "SET_LAYERS":
      if (state === undefined) {
        // set the first layer as active if we have not an active layer yet
        return first(action.payload.layers)?.id;
      }
      return state;
    default:
      return state;
  }
};

export const drawReducer = (state: DrawState, action: LayersAction) => {
  switch (action.type) {
    case "SET_DRAW":
      return action.payload.draw;
    default:
      return state;
  }
};
