import type { AccessGroup, IncidentAccessGrant } from "types";
import { toOptionalDate } from "../common/mapper";
import type { ListAccessGroupsQuery, ListIncidentAccessQuery } from "gql/next";

type WireIncidentAccessGrant = ListIncidentAccessQuery["incidentAccess"][0];
type WireAccessGroup = ListAccessGroupsQuery["accessGroups"][0];

export function toIncidentAccessGrant(w: WireIncidentAccessGrant): IncidentAccessGrant {
  return {
    incidentId: w.incidentId,
    principalKind: w.principalKind,
    principalId: w.principalId,
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
