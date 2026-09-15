import { useQuery } from "@apollo/client/react";
import { apiErrorFromApolloError } from "../errors";
import type { QueryResult } from "../result";
import { GET_INCIDENT_RESOURCES } from "./documents";
import { toResource } from "./mapper";
import type { Resource } from "./mapper";

export type { Resource } from "./mapper";
export type { ResourceContact, ResourceDeploymentLocation, ResourceHomeLocation } from "./mapper";
export type { ResourceFormation, ResourceStatus, ResourceUnitSize, ContactMedium } from "./mapper";

export interface SchadenplatzWithResources {
  id: string;
  incidentId: string;
  name: string;
  isDefault: boolean;
  isMerged: boolean;
  mergedInto: string | null;
  casualties: {
    vermisste: number;
    tote: number;
    verletzte: number;
    obdachlose: number;
    eingeschlossene: number;
  };
  resources: Resource[];
}

export interface IncidentResourcesData {
  incidentId: string;
  schadenplaetze: SchadenplatzWithResources[];
}

export function useIncidentResources(incidentId: string | undefined): QueryResult<IncidentResourcesData> {
  const { loading, error, data, refetch } = useQuery(GET_INCIDENT_RESOURCES, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId,
    pollInterval: 15000,
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

  const inc = data?.incident;
  if (!inc) {
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
      incidentId: inc.id,
      schadenplaetze: inc.schadenplaetze.map((sp) => ({
        id: sp.id,
        incidentId: sp.incidentId,
        name: sp.name,
        isDefault: sp.isDefault,
        isMerged: sp.isMerged,
        mergedInto: sp.mergedInto,
        casualties: sp.casualties,
        resources: sp.resources.map(toResource),
      })),
    },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}
