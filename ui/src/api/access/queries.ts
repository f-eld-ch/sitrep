import { useQuery } from "@apollo/client/react";
import type { AccessGroup, AccessUser, IncidentAccessGrant } from "types";
import { apiErrorFromApolloError } from "../errors";
import type { QueryResult } from "../result";
import {
  LIST_ACCESS_GROUPS,
  LIST_GROUP_MEMBERS,
  LIST_INCIDENT_ACCESS,
  LIST_INCIDENT_ACCESS_MODE,
  LIST_USERS,
} from "./documents";
import { toAccessGroup, toAccessUser, toIncidentAccessGrant } from "./mapper";

export interface IncidentAccessData {
  grants: IncidentAccessGrant[];
}

export interface IncidentAccessModeData {
  mode: "OPEN_OPERATIONAL" | "RESTRICTED";
}

export interface AccessGroupsData {
  groups: AccessGroup[];
}

export interface GroupMembersData {
  subjects: string[];
}

export interface UsersData {
  users: AccessUser[];
}

export function useIncidentAccess(incidentId: string | undefined): QueryResult<IncidentAccessData> {
  const { loading, error, data, refetch } = useQuery(LIST_INCIDENT_ACCESS, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId,
  });

  const refresh = () => void refetch();
  if (!incidentId || (loading && !data)) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }
  if (error) {
    return {
      status: "error",
      data: data ? { grants: data.incidentAccess.map(toIncidentAccessGrant) } : undefined,
      error: apiErrorFromApolloError(error),
      isRefreshing: loading,
      refresh,
    };
  }
  return {
    status: "ready",
    data: { grants: (data?.incidentAccess ?? []).map(toIncidentAccessGrant) },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}

export function useIncidentAccessMode(
  incidentId: string | undefined,
): QueryResult<IncidentAccessModeData> {
  const { loading, error, data, refetch } = useQuery(LIST_INCIDENT_ACCESS_MODE, {
    variables: { incidentId: incidentId ?? "" },
    skip: !incidentId,
  });
  const refresh = () => void refetch();
  if (!incidentId || (loading && !data)) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }
  if (error) {
    return {
      status: "error",
      data: data ? { mode: data.incidentAccessMode } : undefined,
      error: apiErrorFromApolloError(error),
      isRefreshing: loading,
      refresh,
    };
  }
  return {
    status: "ready",
    data: { mode: data?.incidentAccessMode ?? "OPEN_OPERATIONAL" },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}

export function useAccessGroups(): QueryResult<AccessGroupsData> {
  const { loading, error, data, refetch } = useQuery(LIST_ACCESS_GROUPS);
  const refresh = () => void refetch();
  if (loading && !data) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }
  if (error) {
    return {
      status: "error",
      data: data ? { groups: data.accessGroups.map(toAccessGroup) } : undefined,
      error: apiErrorFromApolloError(error),
      isRefreshing: loading,
      refresh,
    };
  }
  return {
    status: "ready",
    data: { groups: (data?.accessGroups ?? []).map(toAccessGroup) },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}

export function useGroupMembers(groupId: string | undefined): QueryResult<GroupMembersData> {
  const { loading, error, data, refetch } = useQuery(LIST_GROUP_MEMBERS, {
    variables: { groupId: groupId ?? "" },
    skip: !groupId,
    pollInterval: 1000,
  });
  const refresh = () => void refetch();
  if (!groupId || (loading && !data)) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }
  if (error) {
    return {
      status: "error",
      data: data ? { subjects: data.groupMembers } : undefined,
      error: apiErrorFromApolloError(error),
      isRefreshing: loading,
      refresh,
    };
  }
  return {
    status: "ready",
    data: { subjects: data?.groupMembers ?? [] },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}

export function useAccessUsers(): QueryResult<UsersData> {
  const { loading, error, data, refetch } = useQuery(LIST_USERS);
  const refresh = () => void refetch();
  if (loading && !data) {
    return { status: "loading", data: undefined, error: undefined, isRefreshing: false, refresh };
  }
  if (error) {
    return {
      status: "error",
      data: data ? { users: data.users.map(toAccessUser) } : undefined,
      error: apiErrorFromApolloError(error),
      isRefreshing: loading,
      refresh,
    };
  }
  return {
    status: "ready",
    data: { users: (data?.users ?? []).map(toAccessUser) },
    error: undefined,
    isRefreshing: loading,
    refresh,
  };
}
