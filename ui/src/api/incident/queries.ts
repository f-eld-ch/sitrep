import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";
import type { Incident, IncidentReview } from "types";
import { apiErrorFromApolloError } from "../errors";
import type { QueryResult } from "../result";
import { GET_INCIDENT_DETAILS, GET_INCIDENT_REVIEW, GET_INCIDENTS } from "./documents";
import { toIncidentDetails, toIncidentReview, toIncidentSummary } from "./mapper";

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
      error: apiErrorFromApolloError(error),
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
      error: apiErrorFromApolloError(error),
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

export interface IncidentReviewData {
  incidentName: string;
  /** Null when the incident has no review: it comes from the legacy import. */
  review: IncidentReview | null;
}

/** How often an open incident's interim review is refreshed. */
const REVIEW_REFRESH_MS = 30_000;

/**
 * The review of an incident's messages. For a closed incident it never changes; while the
 * incident is open it is an interim status, so it is refreshed now and then.
 */
export function useIncidentReview(incidentId: string | undefined): QueryResult<IncidentReviewData> {
  const { loading, error, data, refetch, startPolling, stopPolling } = useQuery(
    GET_INCIDENT_REVIEW,
    {
      variables: { incidentId: incidentId ?? "" },
      skip: !incidentId,
      fetchPolicy: "cache-and-network",
    },
  );

  // Only an open incident has anything new to show.
  const open = data?.incident?.review != null && data.incident.review.closedAt == null;

  useEffect(() => {
    if (open) startPolling(REVIEW_REFRESH_MS);
    else stopPolling();

    return stopPolling;
  }, [open, startPolling, stopPolling]);

  const refresh = () => void refetch();

  if (!incidentId || (loading && !data)) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }

  if (error) {
    return {
      status: "error",
      data: undefined,
      error: apiErrorFromApolloError(error),
      isRefreshing: false,
      refresh,
    };
  }

  if (!data?.incident) {
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
    data: { incidentName: data.incident.name, review: toIncidentReview(data.incident.review) },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}
