import { useQuery } from "@apollo/client/react";
import type { Incident } from "types";
import type { QueryResult } from "../result";
import { GET_INCIDENT_DETAILS, GET_INCIDENTS } from "./documents";
import { toIncidentDetails, toIncidentSummary } from "./mapper";

export interface IncidentsData {
  incidents: Incident[];
}

export interface IncidentDetailsData {
  incident: Incident;
}

export function useIncidents(): QueryResult<IncidentsData> {
  const { loading, error, data, refetch } = useQuery(GET_INCIDENTS, {
    pollInterval: 10000,
  });

  const refresh = () => void refetch();

  if (loading && !data) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }

  if (error) {
    return {
      status: "error",
      data: data ? { incidents: data.incidents.map(toIncidentSummary) } : undefined,
      error: Object.assign(new Error(error.message), { code: "NETWORK_ERROR" as const }),
      isRefreshing: false,
      refresh,
    };
  }

  return {
    status: "ready",
    data: { incidents: (data?.incidents ?? []).map(toIncidentSummary) },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}

export function useIncidentDetails(
  incidentId: string | undefined,
): QueryResult<IncidentDetailsData> {
  const { loading, error, data, refetch } = useQuery(GET_INCIDENT_DETAILS, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId,
    fetchPolicy: "cache-first",
  });

  const refresh = () => void refetch();

  if (!incidentId || (loading && !data)) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }

  if (error) {
    return {
      status: "error",
      data: undefined,
      error: Object.assign(new Error(error.message), { code: "NETWORK_ERROR" as const }),
      isRefreshing: false,
      refresh,
    };
  }

  const wireIncident = data?.incident;
  if (!wireIncident) {
    return {
      status: "error",
      data: undefined,
      error: Object.assign(new Error("Incident not found"), { code: "NOT_FOUND" as const }),
      isRefreshing: false,
      refresh,
    };
  }

  return {
    status: "ready",
    data: { incident: toIncidentDetails(wireIncident) },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}
