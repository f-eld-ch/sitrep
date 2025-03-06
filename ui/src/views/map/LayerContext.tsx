import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import type React from "react";
import { createContext, useReducer, type Reducer } from "react";
import type { Layer } from "types/layer";
import {
  type LayersAction,
  activeLayerReducer,
  drawReducer,
  layersReducer,
  selectedFeatureReducer,
  wmsReducer,
} from "./reducer";

export type SelectedFeatureState = string | undefined;
export type LayersState = Layer[];
export type ActiveLayerState = string | undefined;
export type DrawState = MapboxDraw | undefined;
export type WMSLayersState = WMSLayer[];
export type WMSServerLayersCacheState = Record<string, WMSLayer[]>;

export interface WMSLayer {
  name: string;
  title: string;
  server: string;
  opacity: number;
  isVisible: boolean;
  legendURL?: string;
}

export interface WMSServer {
  name: string;
  url: string;
  language?: string;
}

export interface WMSState {
  activeLayers: WMSLayersState;
  availableLayers: WMSServerLayersCacheState;
  currentServer: string;
  servers: WMSServer[];
}

export interface LayerState {
  layers: LayersState;
  activeLayer: string | undefined;
  selectedFeature: SelectedFeatureState;
  draw: DrawState;
  wms: WMSState;
}

const initialState: LayerState = {
  layers: [],
  activeLayer: undefined,
  selectedFeature: undefined,
  draw: undefined,
  wms: {
    activeLayers: [],
    availableLayers: {},
    currentServer: "",
    servers: [
      { name: "Hazard Map (geodienste.ch)", url: "https://geodienste.ch/db/gefahrenkarten_v1_3_0/ger", language: "en" },
      { name: "Gefahrenkarte (geodienste.ch)", url: "https://geodienste.ch/db/gefahrenkarten_v1_3_0/ger", language: "de" },
      { name: "Cartes des dangers (geodienste.ch)", url: "https://geodienste.ch/db/gefahrenkarten_v1_3_0/fra", language: "fr" },
      { name: "Carte dei pericoli (geodienste.ch)", url: "https://geodienste.ch/db/gefahrenkarten_v1_3_0/ita", language: "it" },
      { name: "geo.admin.ch", url: "https://wms.geo.admin.ch" },
    ],
  },
};

const LayerContext = createContext<{
  state: LayerState;
  dispatch: React.Dispatch<LayersAction>;
}>({
  state: initialState,
  dispatch: () => null,
});

const mainReducer: Reducer<LayerState, LayersAction> = (
  { layers, activeLayer, selectedFeature, draw, wms }: LayerState,
  action: LayersAction,
) => ({
  layers: layersReducer(layers, action),
  activeLayer: activeLayerReducer(activeLayer, action),
  selectedFeature: selectedFeatureReducer(selectedFeature, action),
  draw: drawReducer(draw, action),
  wms: wmsReducer(wms, action),
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
