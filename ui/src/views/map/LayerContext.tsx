
import React, { createContext, useReducer } from 'react';
import { LayersAction, layersReducer, selectedFeatureReducer, activeLayerReducer, drawReducer } from './reducer';
import { Layer } from 'types/layer';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

export type SelectedFeatureState = string | number | undefined;
export type LayersState = Layer[];
export type ActiveLayerState = string | undefined;
export type DrawState = MapboxDraw | undefined;


export type LayerState = {
    layers: LayersState;
    activeLayer: string | undefined
    selectedFeature: SelectedFeatureState;
    draw: DrawState;
}

const initialState: LayerState = {
    layers: [],
    activeLayer: undefined,
    selectedFeature: 0,
    draw: undefined,
}

const LayerContext = createContext<{
    state: LayerState;
    dispatch: React.Dispatch<LayersAction>;
}>({
    state: initialState,
    dispatch: () => null,
});

const mainReducer = ({ layers, activeLayer, selectedFeature, draw }: LayerState, action: LayersAction) => ({
    layers: layersReducer(layers, action),
    activeLayer: activeLayerReducer(activeLayer, action),
    selectedFeature: selectedFeatureReducer(selectedFeature, action),
    draw: drawReducer(draw, action),
});

const LayersProvider = ({ children }: { children: React.ReactNode }) => {
    const [state, dispatch] = useReducer(mainReducer, initialState);

    return (
        <LayerContext.Provider value={{ state, dispatch }}>
            {children}
        </LayerContext.Provider>
    )
}

export { LayerContext, LayersProvider };