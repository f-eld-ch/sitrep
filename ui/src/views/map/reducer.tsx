import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import { first } from "lodash";
import type { Layer } from "types/layer";
import type {
  ActiveLayerState,
  DrawState,
  LayersState,
  SelectedFeatureState,
  WMSLayer,
  WMSState,
  WMSServer,
} from "./LayerContext";

// All valid actions
export type LayersAction =
  | SetLayerAction
  | RemoveLayerAction
  | ToggleLayerVisibilityAction
  | SelectFeatureAction
  | DeselectFeature
  | SetActiveLayer
  | SetDrawLayer
  | AddWMSLayerAction
  | UpdateWMSLayerOpacityAction
  | ToggleWMSLayerVisibilityAction
  | RemoveWMSLayerAction
  | SetWMSServerAction
  | SetWMSServerLayersCacheAction
  | AddCustomWMSServerAction;

export interface SetLayerAction {
  type: "SET_LAYERS";
  payload: {
    layers: Layer[];
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

export interface ToggleLayerVisibilityAction {
  type: "TOGGLE_LAYER_VISIBILITY";
  payload: {
    layerId: string;
    isVisible: boolean;
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

export interface AddWMSLayerAction {
  type: "ADD_WMS_LAYER";
  payload: {
    layerName: string;
    title: string;
    opacity: number;
    server: string;
    legendURL?: string;
  };
}

export interface UpdateWMSLayerOpacityAction {
  type: "UPDATE_WMS_LAYER_OPACITY";
  payload: {
    layerName: string;
    opacity: number;
  };
}

export interface ToggleWMSLayerVisibilityAction {
  type: "TOGGLE_WMS_LAYER_VISIBILITY";
  payload: {
    layerName: string;
    isVisible: boolean;
  };
}

export interface RemoveWMSLayerAction {
  type: "REMOVE_WMS_LAYER";
  payload: {
    layerName: string;
  };
}

export interface SetWMSServerAction {
  type: "SET_WMS_SERVER";
  payload: {
    server: string;
  };
}

export interface SetWMSServerLayersCacheAction {
  type: "SET_WMS_SERVER_LAYERS_CACHE";
  payload: {
    server: string;
    layers: WMSLayer[];
  };
}

export interface AddCustomWMSServerAction {
  type: "ADD_CUSTOM_WMS_SERVER";
  payload: {
    server: WMSServer;
  };
}

export const layersReducer = (state: LayersState, action: LayersAction) => {
  switch (action.type) {
    case "SET_LAYERS":
      return action.payload.layers.map((layer) => ({
        layer,
        isVisible: state.some((s) => s.layer.id === layer.id)
          ? state.find((s) => s.layer.id === layer.id)?.isVisible ?? true
          : true,
      }));
    case "TOGGLE_LAYER_VISIBILITY":
      return state.map((s) =>
        s.layer.id === action.payload.layerId
          ? { ...s, isVisible: action.payload.isVisible }
          : s,
      );
    default:
      return state;
  }
}

export const selectedFeatureReducer = (
  state: SelectedFeatureState,
  action: LayersAction,
) => {
  switch (action.type) {
    case "SELECT_FEATURE":
      return action.payload.id;
    case "DESELECT_FEATURE":
      return undefined;
    default:
      return state;
  }
};

export const activeLayerReducer = (
  state: ActiveLayerState,
  action: LayersAction,
) => {
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

export const wmsReducer = (state: WMSState, action: LayersAction) => {
  switch (action.type) {
    case "ADD_WMS_LAYER":
      if (state.activeLayers.some((layer) => layer.name === action.payload.layerName)) {
        return state;
      }
      return {
        ...state,
        activeLayers: [
          ...state.activeLayers,
          {
            name: action.payload.layerName,
            title: action.payload.title,
            opacity: action.payload.opacity,
            server: action.payload.server,
            isVisible: true,
            legendURL: action.payload.legendURL,
          },
        ],
      };
    case "UPDATE_WMS_LAYER_OPACITY":
      return {
        ...state,
        activeLayers: state.activeLayers.map((layer) =>
          layer.name === action.payload.layerName
            ? { ...layer, opacity: action.payload.opacity }
            : layer,
        ),
      };
    case "TOGGLE_WMS_LAYER_VISIBILITY":
      return {
        ...state,
        activeLayers: state.activeLayers.map((layer) =>
          layer.name === action.payload.layerName
            ? { ...layer, isVisible: action.payload.isVisible }
            : layer,
        ),
      };
    case "REMOVE_WMS_LAYER":
      return {
        ...state,
        activeLayers: state.activeLayers.filter((layer) => layer.name !== action.payload.layerName),
      };
    case "SET_WMS_SERVER":
      return {
        ...state,
        currentServer: action.payload.server,
      };
    case "SET_WMS_SERVER_LAYERS_CACHE":
      return {
        ...state,
        availableLayers: {
          ...state.availableLayers,
          [action.payload.server]: action.payload.layers,
        },
      };
    case "ADD_CUSTOM_WMS_SERVER":
      return {
        ...state,
        servers: [...state.servers, action.payload.server],
      };
    default:
      return state;
  }
};
