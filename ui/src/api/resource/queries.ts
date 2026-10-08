import { useQuery } from "@apollo/client/react";
import { apiErrorFromApolloError } from "../errors";
import { isMutationRecent } from "../mutationActivity";
import type { QueryResult } from "../result";
import { GET_INCIDENT_RESOURCES, GET_INCIDENT_RESOURCES_AS_OF } from "./documents";
import { toResource } from "./mapper";
import type { Resource } from "./mapper";

export type { Resource } from "./mapper";
export type {
  ResourceContact,
  ResourceDeploymentLocation,
  ResourceDeploymentPeriod,
  ResourceHomeLocation,
} from "./mapper";
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
  incidentName: string;
  schadenplaetze: SchadenplatzWithResources[];
  childIncidents: ChildIncidentCasualties[];
  resources: Resource[];
}

export interface ChildIncidentCasualties {
  id: string;
  name: string;
  casualties: SchadenplatzWithResources["casualties"];
}

/**
 * Resources and casualties of an incident. With `asOf` they are the state at that point in time:
 * a past view does not change, so it is not polled, and it bypasses the cache because its
 * resources would otherwise overwrite the current state of the same (normalized) entities.
 */
export function useIncidentResources(
  incidentId: string | undefined,
  asOf?: Date,
): QueryResult<IncidentResourcesData> {
  const live = useQuery(GET_INCIDENT_RESOURCES, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId || asOf !== undefined,
    fetchPolicy: "cache-and-network",
    pollInterval: 5000,
    skipPollAttempt: () => document.hidden || isMutationRecent(),
  });
  const past = useQuery(GET_INCIDENT_RESOURCES_AS_OF, {
    variables: { incidentId: incidentId ?? "", asOf: asOf?.toISOString() ?? "" },
    skip: !incidentId || asOf === undefined,
    fetchPolicy: "no-cache",
  });

  const { loading, error, data, refetch } = asOf === undefined ? live : past;

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
      incidentName: inc.name,
      childIncidents: inc.childIncidents.map((child) => ({
        id: child.id,
        name: child.name,
        casualties: sumCasualties(child.schadenplaetze),
      })),
      resources: inc.resources.map(toResource),
      schadenplaetze: inc.schadenplaetze.map(toSchadenplatzWithResources),
    },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}

function toSchadenplatzWithResources(sp: {
  id: string;
  incidentId: string;
  name: string;
  isDefault: boolean;
  isMerged: boolean;
  mergedInto: string | null;
  casualties: SchadenplatzWithResources["casualties"];
  /** Absent when the query skipped it (past views). */
  resources?: Parameters<typeof toResource>[0][];
}): SchadenplatzWithResources {
  return {
    id: sp.id,
    incidentId: sp.incidentId,
    name: sp.name,
    isDefault: sp.isDefault,
    isMerged: sp.isMerged,
    mergedInto: sp.mergedInto,
    casualties: sp.casualties,
    resources: (sp.resources ?? []).map(toResource),
  };
}

function sumCasualties(
  sps: Array<{
    isMerged: boolean;
    casualties: SchadenplatzWithResources["casualties"];
  }>,
): SchadenplatzWithResources["casualties"] {
  return sps
    .filter((sp) => !sp.isMerged)
    .reduce(
      (acc, sp) => ({
        vermisste: acc.vermisste + sp.casualties.vermisste,
        tote: acc.tote + sp.casualties.tote,
        verletzte: acc.verletzte + sp.casualties.verletzte,
        obdachlose: acc.obdachlose + sp.casualties.obdachlose,
        eingeschlossene: acc.eingeschlossene + sp.casualties.eingeschlossene,
      }),
      { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 },
    );
}
