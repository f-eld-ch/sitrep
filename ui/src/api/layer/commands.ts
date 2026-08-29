import { useMutation } from "@apollo/client/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { omit } from "lodash";
import type { CommandHook, CommandState } from "../result";
import { ADD_FEATURE, ADD_LAYER, DELETE_FEATURE, MODIFY_FEATURE } from "./documents";
import { afterLayerWrite } from "./invalidate";

export function cleanFeature(f: Feature): Feature<Geometry, GeoJsonProperties> {
  return {
    type: "Feature",
    id: f.id,
    geometry: f.geometry,
    properties: omit(f.properties as Record<string, unknown>, [
      "createdAt",
      "updatedAt",
      "deletedAt",
      "layerId",
    ]) as GeoJsonProperties,
  };
}

export interface AddFeatureArgs {
  layerId: string;
  id: string;
  geometry: unknown;
  properties: unknown;
  incidentId: string;
}

export interface ModifyFeatureArgs {
  id: string;
  geometry: unknown;
  properties: unknown;
  incidentId: string;
}

export interface DeleteFeatureArgs {
  id: string;
  incidentId: string;
}

export interface AddLayerArgs {
  incidentId: string;
  name: string;
}

export function useAddFeature(): CommandHook<AddFeatureArgs, { featureId: string }> {
  const [mutate, { loading, error }] = useMutation(ADD_FEATURE);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const addFeature = async (args: AddFeatureArgs): Promise<{ featureId: string }> => {
    const result = await mutate({
      variables: {
        layerId: args.layerId,
        id: args.id,
        geometry: args.geometry as Record<string, unknown>,
        properties: args.properties as Record<string, unknown>,
      },
      refetchQueries: afterLayerWrite(args.incidentId),
    });
    const featureId = result.data?.insertFeaturesOne?.id;
    if (!featureId) throw new Error("Failed to add feature");
    return { featureId };
  };

  return [addFeature, state];
}

export function useModifyFeature(): CommandHook<ModifyFeatureArgs> {
  const [mutate, { loading, error }] = useMutation(MODIFY_FEATURE);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const modifyFeature = async (args: ModifyFeatureArgs): Promise<void> => {
    await mutate({
      variables: {
        id: args.id,
        geometry: args.geometry as Record<string, unknown>,
        properties: args.properties as Record<string, unknown>,
      },
      refetchQueries: afterLayerWrite(args.incidentId),
    });
  };

  return [modifyFeature, state];
}

export function useDeleteFeature(): CommandHook<DeleteFeatureArgs> {
  const [mutate, { loading, error }] = useMutation(DELETE_FEATURE);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const deleteFeature = async (args: DeleteFeatureArgs): Promise<void> => {
    await mutate({
      variables: { id: args.id, deletedAt: new Date() },
      refetchQueries: afterLayerWrite(args.incidentId),
    });
  };

  return [deleteFeature, state];
}

export function useAddLayer(): CommandHook<AddLayerArgs, { layerId: string }> {
  const [mutate, { loading, error }] = useMutation(ADD_LAYER);

  const state: CommandState = {
    loading,
    error: error
      ? Object.assign(new Error(error.message), { code: "UNKNOWN" as const })
      : undefined,
  };

  const addLayer = async (args: AddLayerArgs): Promise<{ layerId: string }> => {
    const result = await mutate({
      variables: { incidentId: args.incidentId, name: args.name },
      refetchQueries: afterLayerWrite(args.incidentId),
    });
    const layerId = result.data?.insertLayersOne?.id;
    if (!layerId) throw new Error("Failed to add layer");
    return { layerId };
  };

  return [addLayer, state];
}
