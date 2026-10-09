import { useQuery } from "@apollo/client/react";
import { useEffect, useMemo } from "react";
import type { FeatureMessage, Layer } from "types/layer";
import { apiErrorFromApolloError } from "../errors";
import type { QueryResult } from "../result";
import {
  GET_FEATURE_CHANGE_TIMES,
  GET_FEATURE_CHANGES,
  GET_FEATURE_MESSAGES,
  GET_LAYERS,
} from "./documents";
import { layersVariables } from "./variables";
import { messageFeatureHalos, type FeatureHalo, type HistoryChange } from "./halos";
import { toFeatureMessage, toLayer } from "./mapper";

/** How often the live map is refreshed, so other operators' drawings show up quickly. */
export const LIVE_POLL_INTERVAL_MS = 2000;

export interface LayersData {
  layers: Layer[];
}

/**
 * Layers visible from an incident. With `asOf`, each layer's features are the state of the map
 * at that point on the incident timeline instead of the current state.
 */
export function useLayersForIncident(
  incidentId: string | undefined,
  asOf?: Date,
  options: { pollInterval?: number; fetchPolicy?: "cache-and-network" | "no-cache" } = {},
): QueryResult<LayersData> {
  const { data, loading, error, refetch } = useQuery(GET_LAYERS, {
    variables: layersVariables(incidentId ?? "", asOf),
    skip: !incidentId,
    pollInterval: options.pollInterval ?? LIVE_POLL_INTERVAL_MS,
    // Nobody watches a hidden tab; resume with the next tick once it is visible again.
    skipPollAttempt: () => document.hidden,
    fetchPolicy: options.fetchPolicy ?? "cache-and-network",
  });

  const layers = useMemo(() => (data ? data.layersForIncident.map(toLayer) : undefined), [data]);

  const refresh = () => void refetch();

  if (!data && loading) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }
  if (error) {
    return {
      status: "error",
      data: layers ? { layers } : undefined,
      error: apiErrorFromApolloError(error),
      isRefreshing: loading,
      refresh,
    };
  }
  if (layers) {
    return { status: "ready", data: { layers }, error: undefined, isRefreshing: loading, refresh };
  }
  return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
}

export interface FeatureMessagesData {
  messages: FeatureMessage[];
}

/** The messages connected to a feature. Pass undefined to skip (nothing selected). */
export function useFeatureMessages(
  featureId: string | undefined,
): QueryResult<FeatureMessagesData> {
  const { data, loading, error, refetch } = useQuery(GET_FEATURE_MESSAGES, {
    variables: { featureId: featureId ?? "" },
    skip: !featureId,
    fetchPolicy: "cache-and-network",
  });

  const refresh = () => void refetch();

  if (!data && loading) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }
  if (error) {
    return {
      status: "error",
      data: undefined,
      error: apiErrorFromApolloError(error),
      isRefreshing: loading,
      refresh,
    };
  }
  if (data) {
    return {
      status: "ready",
      data: { messages: data.featureMessages.map(toFeatureMessage) },
      error: undefined,
      isRefreshing: loading,
      refresh,
    };
  }

  return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
}

/**
 * What a message added, modified and removed. Read once per `refreshKey`: it changes whenever the
 * map's features do, so the answer follows the drawing without polling.
 */
export function useMessageFeatureHalos(
  incidentId: string | undefined,
  messageId: string | undefined,
  refreshKey: string,
): { halos: ReadonlyMap<string, FeatureHalo>; ready: boolean } {
  const { data, refetch } = useQuery(GET_FEATURE_CHANGES, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId || !messageId,
    // The history is not part of the normalized layer data and is only read here.
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    if (incidentId && messageId) void refetch();
  }, [incidentId, messageId, refreshKey, refetch]);

  const halos = useMemo(
    () =>
      messageId
        ? messageFeatureHalos((data?.featureChanges ?? []) as HistoryChange[], messageId)
        : new Map<string, FeatureHalo>(),
    [data, messageId],
  );

  return { halos, ready: data !== undefined };
}

/**
 * When the map's features changed, on the incident timeline, across all of the incident's
 * layers: the points a timeline over the map can stop at. Layers that are not shown right now
 * count too, so the timeline is the same whichever layer is in view.
 */
export function useFeatureChangeTimes(
  incidentId: string | undefined,
  options: { pollInterval?: number } = {},
): number[] {
  // Only the times: this is polled, so it must not carry every change's geometry along.
  const { data } = useQuery(GET_FEATURE_CHANGE_TIMES, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId,
    pollInterval: options.pollInterval,
    skipPollAttempt: () => document.hidden,
    fetchPolicy: "cache-and-network",
  });

  return useMemo(
    () => [...new Set((data?.featureChangeTimes ?? []).map((at) => new Date(at).getTime()))],
    [data],
  );
}
