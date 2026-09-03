import type { AccessGroup, AccessUser, IncidentAccessGrant } from "types";
import { toOptionalDate } from "../common/mapper";
import type { ListAccessGroupsQuery, ListIncidentAccessQuery, ListUsersQuery } from "gql/next";

type WireIncidentAccessGrant = ListIncidentAccessQuery["incidentAccess"][0];
type WireAccessGroup = ListAccessGroupsQuery["accessGroups"][0];
type WireAccessUser = ListUsersQuery["users"][0];

export function toIncidentAccessGrant(w: WireIncidentAccessGrant): IncidentAccessGrant {
  return {
    incidentId: w.incidentId,
    principalKind: w.principalKind,
    principalId: w.principalId,
    principalName: w.principalName,
    role: w.role,
  };
}

export function toAccessGroup(w: WireAccessGroup): AccessGroup {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    archivedAt: toOptionalDate(w.archivedAt),
  };
}

export function toAccessUser(w: WireAccessUser): AccessUser {
  return { sub: w.sub, name: w.name, email: w.email };
}
