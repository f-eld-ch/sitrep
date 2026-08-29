import { useQuery } from "@apollo/client/react";
import type { Journal } from "types";
import type { QueryResult } from "../result";
import { GET_JOURNALS } from "./documents";
import { toJournal } from "./mapper";

export interface JournalsData {
  incidentName: string;
  journals: Journal[];
}

export function useJournals(incidentId: string | undefined): QueryResult<JournalsData> {
  const { loading, error, data, refetch } = useQuery(GET_JOURNALS, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId,
    pollInterval: 10000,
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

  const incident = data?.incidents[0];
  if (!incident) {
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
    data: {
      incidentName: incident.name,
      journals: incident.journals.map(toJournal),
    },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}
