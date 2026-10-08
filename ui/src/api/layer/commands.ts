import { useMutation } from "@apollo/client/react";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { apiErrorFromApolloError } from "../errors";
import { omit } from "lodash";
import type { CommandHook, CommandState } from "../result";
import { featureChangeVariable, layersVariables, type FeatureChangeArgs } from "./variables";
import { ADD_FEATURE, CREATE_LAYER, DELETE_FEATURE, GET_LAYERS, MODIFY_FEATURE } from "./documents";

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
      "featureId",
    ]) as GeoJsonProperties,
  };
}

export interface AddFeatureArgs {
  layerId: string;
  /** Client-side identifier (the draw id). The server derives and returns the feature id. */
  clientKey: string;
  geometry: unknown;
  properties: unknown;
  incidentId: string;
  /** When the change takes effect; required on the message map layer. */
  change?: FeatureChangeArgs;
  /** The point on the timeline the map currently shows; selects the layers result to update. */
  asOf?: Date;
}

export interface ModifyFeatureArgs {
  id: string;
  /** Sparse: omit to leave unchanged server-side. */
  geometry?: unknown;
  /** Sparse: omit to leave unchanged server-side. */
  properties?: unknown;
  /** Full current geometry — used for the optimistic cache write. */
  currentGeometry: unknown;
  /** Full current properties — used for the optimistic cache write. */
  currentProperties: unknown;
  incidentId: string;
  change?: FeatureChangeArgs;
  asOf?: Date;
}

export interface DeleteFeatureArgs {
  id: string;
  incidentId: string;
  change?: FeatureChangeArgs;
  asOf?: Date;
}

export interface AddLayerArgs {
  incidentId: string;
  name: string;
}

export function useAddFeature(): CommandHook<AddFeatureArgs, { featureId: string }> {
  const [mutate, { loading, error }] = useMutation(ADD_FEATURE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const addFeature = async (args: AddFeatureArgs): Promise<{ featureId: string }> => {
    const result = await mutate({
      variables: {
        incidentId: args.incidentId,
        layerId: args.layerId,
        clientKey: args.clientKey,
        geometry: args.geometry as unknown as import("geojson").Geometry,
        properties: args.properties as Record<string, unknown>,
        change: featureChangeVariable(args.change),
      },
      update(cache, { data }) {
        if (!data?.addFeature) return;
        const newFeature = data.addFeature;
        const variables = layersVariables(args.incidentId, args.asOf);
        const cached = cache.readQuery({ query: GET_LAYERS, variables });
        if (!cached?.layersForIncident) return;
        cache.writeQuery({
          query: GET_LAYERS,
          variables,
          data: {
            layersForIncident: cached.layersForIncident.map((layer) =>
              layer.id === args.layerId
                ? { ...layer, features: [...layer.features, newFeature] }
                : layer,
            ),
          },
        });
      },
    });
    const featureId = result.data?.addFeature?.id;
    if (!featureId) throw new Error("Failed to add feature");
    return { featureId };
  };

  return [addFeature, state];
}

export function useModifyFeature(): CommandHook<ModifyFeatureArgs> {
  const [mutate, { loading, error }] = useMutation(MODIFY_FEATURE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const modifyFeature = async (args: ModifyFeatureArgs): Promise<void> => {
    await mutate({
      variables: {
        id: args.id,
        geometry: args.geometry as unknown as import("geojson").Geometry,
        properties: args.properties as Record<string, unknown>,
        change: featureChangeVariable(args.change),
      },
      optimisticResponse: {
        modifyFeature: {
          id: args.id,
          geometry: args.currentGeometry,
          properties: args.currentProperties,
        },
      } as never,
      update(cache) {
        // The server answers with the feature's latest state, which can be newer than the
        // point on the timeline the map shows (an edit for an older message). Restore the
        // state as of that point until the next poll delivers it.
        if (!args.asOf) return;
        cache.modify({
          id: cache.identify({ __typename: "Feature", id: args.id }),
          fields: {
            geometry: () => args.currentGeometry as never,
            properties: () => args.currentProperties as never,
          },
        });
      },
    });
  };

  return [modifyFeature, state];
}

export function useDeleteFeature(): CommandHook<DeleteFeatureArgs> {
  const [mutate, { loading, error }] = useMutation(DELETE_FEATURE);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const deleteFeature = async (args: DeleteFeatureArgs): Promise<void> => {
    await mutate({
      variables: { id: args.id, change: featureChangeVariable(args.change) },
      update(cache) {
        const variables = layersVariables(args.incidentId, args.asOf);
        const cached = cache.readQuery({ query: GET_LAYERS, variables });
        if (!cached?.layersForIncident) return;
        cache.writeQuery({
          query: GET_LAYERS,
          variables,
          data: {
            layersForIncident: cached.layersForIncident.map((layer) => ({
              ...layer,
              features: layer.features.filter((f) => f.id !== args.id),
            })),
          },
        });
        cache.evict({ id: cache.identify({ __typename: "Feature", id: args.id }) });
        cache.gc();
      },
    });
  };

  return [deleteFeature, state];
}

export function useAddLayer(): CommandHook<AddLayerArgs, { layerId: string }> {
  const [mutate, { loading, error }] = useMutation(CREATE_LAYER);

  const state: CommandState = {
    loading,
    error: error ? apiErrorFromApolloError(error) : undefined,
  };

  const addLayer = async (args: AddLayerArgs): Promise<{ layerId: string }> => {
    const result = await mutate({
      variables: { incidentId: args.incidentId, name: args.name },
      update(cache, { data }) {
        if (!data?.createLayer) return;
        const newLayer = data.createLayer;
        const cached = cache.readQuery({
          query: GET_LAYERS,
          variables: { incidentId: args.incidentId },
        });
        if (!cached) return;
        cache.writeQuery({
          query: GET_LAYERS,
          variables: { incidentId: args.incidentId },
          data: {
            layersForIncident: [
              ...(cached.layersForIncident ?? []),
              { ...newLayer, revision: 0, features: [] },
            ],
          },
        });
      },
    });
    const layerId = result.data?.createLayer?.id;
    if (!layerId) throw new Error("Failed to add layer");
    return { layerId };
  };

  return [addLayer, state];
}
