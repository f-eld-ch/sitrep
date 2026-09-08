import type { ListAccessGroupsQuery, ListIncidentAccessQuery } from "gql/next";
import { toAccessGroup, toIncidentAccessGrant } from "./mapper";

describe("access mappers", () => {
  it("maps an incident access grant", () => {
    const wire: ListIncidentAccessQuery["incidentAccess"][0] = {
      incidentId: "incident-1",
      principalKind: "GROUP",
      principalId: "group-1",
      principalName: "Operations",
      role: "EDITOR",
    };

    expect(toIncidentAccessGrant(wire)).toEqual(wire);
  });

  it("maps an active access group", () => {
    const wire: ListAccessGroupsQuery["accessGroups"][0] = {
      id: "group-1",
      name: "Operations",
      description: "Incident operators",
      archivedAt: null,
    };

    expect(toAccessGroup(wire)).toEqual({
      id: "group-1",
      name: "Operations",
      description: "Incident operators",
      archivedAt: null,
    });
  });

  it("maps an archived access group timestamp", () => {
    const archivedAt = "2026-09-03T12:00:00.000Z";
    const wire: ListAccessGroupsQuery["accessGroups"][0] = {
      id: "group-1",
      name: "Former Operators",
      description: "No longer active",
      archivedAt,
    };

    expect(toAccessGroup(wire).archivedAt).toEqual(new Date(archivedAt));
  });
});
