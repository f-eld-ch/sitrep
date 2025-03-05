import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import type React from "react";
import { createContext, useReducer } from "react";
import type { Layer } from "types/layer";
import {
  type LayersAction,
  activeLayerReducer,
  drawReducer,
  layersReducer,
  selectedFeatureReducer,
  wmsLayersReducer,
} from "./reducer";

export type SelectedFeatureState = string | undefined;
export type LayersState = Layer[];
export type ActiveLayerState = string | undefined;
export type DrawState = MapboxDraw | undefined;
export type WMSLayersState = WMSLayer[];

export interface WMSLayer {
  name: string;
  title: string;
  server: string;
  opacity: number;
  isVisible: boolean;
  legendURL?: string;
}

export interface LayerState {
  layers: LayersState;
  activeLayer: string | undefined;
  selectedFeature: SelectedFeatureState;
  draw: DrawState;
  wmsLayers: WMSLayersState;
}

const initialState: LayerState = {
  layers: [],
  activeLayer: undefined,
  selectedFeature: undefined,
  draw: undefined,
  wmsLayers: [],
};

const LayerContext = createContext<{
  state: LayerState;
  dispatch: React.Dispatch<LayersAction>;
}>({
  state: initialState,
  dispatch: () => null,
});

const mainReducer = (
  { layers, activeLayer, selectedFeature, draw, wmsLayers }: LayerState,
  action: LayersAction,
) => ({
  layers: layersReducer(layers, action),
  activeLayer: activeLayerReducer(activeLayer, action),
  selectedFeature: selectedFeatureReducer(selectedFeature, action),
  draw: drawReducer(draw, action),
  wmsLayers: wmsLayersReducer(wmsLayers, action),
});

const LayersProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(mainReducer, initialState);

  return (
    <LayerContext.Provider value={{ state, dispatch }}>
      {children}
    </LayerContext.Provider>
  );
};

export { LayerContext, LayersProvider };
