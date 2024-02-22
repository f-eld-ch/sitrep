import { Feature, Layer } from "types/layer";
import { ActiveLayerState, DrawState, LayersState, SelectedFeatureState } from "./LayerContext";
import { first } from "lodash";
import MapboxDraw from "@mapbox/mapbox-gl-draw";

// All valid actions
export type LayersAction =
    SetLayerAction |
    AddLayerAction |
    RemoveLayerAction |
    SelectFeatureAction |
    DeselectFeature |
    ModifyFeature |
    AddFeature |
    DeleteFeature |
    SetActiveLayer |
    SetDrawLayer;

export type SetLayerAction = {
    type: 'SET_LAYERS';
    payload: {
        layers: Layer[];
    }
}

export type AddLayerAction = {
    type: 'ADD_LAYER';
    payload: {
        layer: Layer;
    }
}

export type RemoveLayerAction = {
    type: 'REMOVE_LAYER';
    payload: {
        id: string
    }
}

export type AddFeature = {
    type: 'ADD_FEATURE';
    payload: {
        layerId: string | undefined;
        feature: Feature;
    }
}

export type ModifyFeature = {
    type: 'MODIFY_FEATURE';
    payload: {
        layerId: string | undefined;
        feature: Feature;
    }
}

export type DeleteFeature = {
    type: 'DELETE_FEATURE';
    payload: {
        layerId: string | undefined;
        featureId: string | undefined;
    }
}


export type SetActiveLayer = {
    type: 'SET_ACTIVE_LAYER';
    payload: {
        layerId: string;
    }
}

export type SelectFeatureAction = {
    type: "SELECT_FEATURE";
    payload: {
        id: string | number | undefined
    }
}

export type DeselectFeature = {
    type: "DESELECT_FEATURE";
    payload: {}
}

export type SetDrawLayer = {
    type: "SET_DRAW";
    payload: {
        draw: MapboxDraw | undefined;
    }
}

export const layersReducer = (state: LayersState, action: LayersAction) => {
    switch (action.type) {
        case 'SET_LAYERS':
            return action.payload.layers
        case 'ADD_LAYER':
            return [
                ...state,
                action.payload.layer
            ]
        case 'REMOVE_LAYER':
            return [
                ...state.filter(layer => layer.id !== action.payload.id),
            ]
        case 'ADD_FEATURE':
            return state.map((layer: Layer) => {
                if (layer.id !== action.payload.layerId) {
                    // This isn't the item we care about - keep it as-is
                    return layer
                }

                // Otherwise, this is the one we want - append the feature
                return Object.assign({}, layer, { features: [...layer.features, action.payload.feature] })

            })
        case 'MODIFY_FEATURE':
            return state.map((layer: Layer) => {
                if (layer.id !== action.payload.layerId) {
                    // This isn't the item we care about - keep it as-is
                    return layer
                }

                // Otherwise, this is the one we want - append the feature
                layer.features.map((feature: Feature) => {
                    if (feature.id !== action.payload.feature.id) {
                        return feature
                    }
                    // replace the feature
                    return action.payload.feature
                })
                return layer
            })
        case 'DELETE_FEATURE':
            return state.map((layer: Layer) => {
                if (layer.id !== action.payload.layerId) {
                    // This isn't the item we care about - keep it as-is
                    return layer
                }

                if (action.payload.featureId === undefined) {
                    return layer
                }

                // Otherwise, this is the one we want - append the feature
                layer.features.map((feature: Feature) => {
                    if (feature.id !== action.payload.featureId) {
                        return feature
                    }
                    // set the deletedAt
                    return { ...feature, deleteAt: new Date() }
                })
                return layer
            })
        default:
            return state;
    }
}

export const selectedFeatureReducer = (state: SelectedFeatureState, action: LayersAction) => {
    switch (action.type) {
        case 'SELECT_FEATURE':
            return action.payload.id;
        case 'DESELECT_FEATURE':
            return undefined
        default:
            return state;
    }
}

export const activeLayerReducer = (state: ActiveLayerState, action: LayersAction) => {
    switch (action.type) {
        case 'SET_ACTIVE_LAYER':
            return action.payload.layerId;
        case 'SET_LAYERS':
            if (state === undefined) {
                // set the first layer as active if we have not an active layer yet
                return first(action.payload.layers)?.id
            }
            return state
        default:
            return state;
    }
}


export const drawReducer = (state: DrawState, action: LayersAction) => {
    switch (action.type) {
        case 'SET_DRAW':
            return action.payload.draw;
        default:
            return state;
    }
}