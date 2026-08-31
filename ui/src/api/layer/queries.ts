import { useQuery } from "@apollo/client/react";
import { useMemo } from "react";
import type { Layer } from "types/layer";
import type { QueryResult } from "../result";
import { GET_LAYERS } from "./documents";
import { toLayer } from "./mapper";

export interface LayersData {
  layers: Layer[];
}

export function useLayersForIncident(incidentId: string | undefined): QueryResult<LayersData> {
  const { data, loading, error, refetch } = useQuery(GET_LAYERS, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId,
    pollInterval: 2000,
    fetchPolicy: "cache-and-network",
  });

  const layers = useMemo(
    () => (data ? data.layersForIncident.map(toLayer) : undefined),
    [data],
  );

  const refresh = () => void refetch();

  if (!data && loading) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }
  if (error) {
    return {
      status: "error",
      data: layers ? { layers } : undefined,
      error: Object.assign(new Error(error.message), { code: "UNKNOWN" as const }),
      isRefreshing: loading,
      refresh,
    };
  }
  if (layers) {
    return { status: "ready", data: { layers }, error: undefined, isRefreshing: loading, refresh };
  }
  return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
}
