export type IncidentAccessMode = "OPEN_OPERATIONAL" | "RESTRICTED";

export type IncidentRole = "OWNER" | "MANAGER" | "EDITOR" | "VIEWER";

export type AccessPrincipalKind = "USER" | "GROUP";

export type GlobalRole = "SYSTEM_ADMIN" | "GROUP_ADMIN";

export interface IncidentAccessGrant {
  incidentId: string;
  principalKind: AccessPrincipalKind;
  principalId: string;
  role: IncidentRole;
}

export interface AccessGroup {
  id: string;
  name: string;
  description: string;
  archivedAt: Date | null;
}
