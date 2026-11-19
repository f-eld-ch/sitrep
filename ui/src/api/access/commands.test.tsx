import { InMemoryCache } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors";
import { graphQlError, mockMutation, mutateOptions, newCache } from "../testing/mutations";
import {
  useAddGroupMember,
  useArchiveAccessGroup,
  useChangeIncidentAccessMode,
  useCreateAccessGroup,
  useGrantDefaultRole,
  useGrantGlobalRole,
  useGrantIncidentRole,
  useRemoveGroupMember,
  useRenameAccessGroup,
  useRevokeDefaultRole,
  useRevokeGlobalRole,
  useRevokeIncidentRole,
  useSetDefaultAccessMode,
  useUpdateAccessGroupDescription,
} from "./commands";
import {
  GET_DEFAULT_ACCESS,
  LIST_ACCESS_GROUPS,
  LIST_GLOBAL_ROLES,
  LIST_GROUP_MEMBERS,
  LIST_INCIDENT_ACCESS,
  LIST_INCIDENT_ACCESS_MODE,
  LIST_USERS,
} from "./documents";

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
  useApolloClient: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useApolloClient).mockReset();
});

const incidentAccess = (
  principalKind: "USER" | "GROUP" | "ALL",
  principalId: string,
  role: "OWNER" | "MANAGER" | "EDITOR" | "VIEWER",
) => ({ incidentId: "inc-1", principalKind, principalId, principalName: principalId, role });

function seedIncidentAccess(cache: InMemoryCache, rows: ReturnType<typeof incidentAccess>[]) {
  cache.writeQuery({
    query: LIST_INCIDENT_ACCESS,
    variables: { incidentId: "inc-1" },
    data: { incidentAccess: rows },
  });
}

function readIncidentAccess(cache: InMemoryCache) {
  return cache.readQuery({ query: LIST_INCIDENT_ACCESS, variables: { incidentId: "inc-1" } })
    ?.incidentAccess;
}

const defaultGrant = (
  principalKind: "USER" | "GROUP" | "ALL",
  principalId: string,
  role: "OWNER" | "MANAGER" | "EDITOR" | "VIEWER",
) => ({ principalKind, principalId, role });

function seedDefaultAccess(
  cache: InMemoryCache,
  mode: "OPEN_OPERATIONAL" | "RESTRICTED",
  grants: ReturnType<typeof defaultGrant>[],
) {
  cache.writeQuery({ query: GET_DEFAULT_ACCESS, data: { defaultAccess: { mode, grants } } });
}

describe("useChangeIncidentAccessMode", () => {
  it("writes the new mode to the cache up front, then mutates and refetches the access list", async () => {
    const writeQuery = vi.fn();
    vi.mocked(useApolloClient).mockReturnValue({ writeQuery } as never);
    const mutate = await mockMutation();
    const { result } = renderHook(() => useChangeIncidentAccessMode());

    await result.current[0]({ incidentId: "inc-1", mode: "RESTRICTED" });

    expect(writeQuery).toHaveBeenCalledWith({
      query: LIST_INCIDENT_ACCESS_MODE,
      variables: { incidentId: "inc-1" },
      data: { incidentAccessMode: "RESTRICTED" },
    });
    expect(mutate).toHaveBeenCalledWith({
      variables: { incidentId: "inc-1", mode: "RESTRICTED" },
      refetchQueries: [{ query: LIST_INCIDENT_ACCESS, variables: { incidentId: "inc-1" } }],
    });
  });

  it("converts a failed mutation to an ApiError", async () => {
    vi.mocked(useApolloClient).mockReturnValue({ writeQuery: vi.fn() } as never);
    await mockMutation({ rejection: graphQlError("FORBIDDEN") });
    const { result } = renderHook(() => useChangeIncidentAccessMode());

    await expect(
      result.current[0]({ incidentId: "inc-1", mode: "RESTRICTED" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("useGrantIncidentRole", () => {
  const args = {
    incidentId: "inc-1",
    principalKind: "USER" as const,
    principalId: "u-1",
    role: "EDITOR" as const,
  };

  it("sends the args and an optimistic response that names the principal by id", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantIncidentRole());

    await result.current[0](args);

    const options = mutateOptions(mutate);
    expect(options.variables).toEqual(args);
    expect(options.optimisticResponse).toEqual({
      grantIncidentRole: { ...incidentAccess("USER", "u-1", "EDITOR") },
    });
  });

  it("replaces any other role the principal holds and keeps other principals", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantIncidentRole());
    await result.current[0](args);
    const cache = newCache();
    seedIncidentAccess(cache, [
      incidentAccess("USER", "u-1", "VIEWER"),
      incidentAccess("GROUP", "u-1", "MANAGER"),
      incidentAccess("USER", "u-2", "OWNER"),
    ]);

    mutateOptions(mutate).update?.(cache, {
      data: { grantIncidentRole: incidentAccess("USER", "u-1", "EDITOR") },
    });

    expect(readIncidentAccess(cache)).toEqual([
      incidentAccess("GROUP", "u-1", "MANAGER"),
      incidentAccess("USER", "u-2", "OWNER"),
      incidentAccess("USER", "u-1", "EDITOR"),
    ]);
  });

  it("leaves an unloaded access list alone", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantIncidentRole());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, {
      data: { grantIncidentRole: incidentAccess("USER", "u-1", "EDITOR") },
    });

    expect(readIncidentAccess(cache)).toBeUndefined();
  });

  it("does nothing to the cache when the response carries no grant", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantIncidentRole());
    await result.current[0](args);
    const cache = newCache();
    seedIncidentAccess(cache, [incidentAccess("USER", "u-2", "OWNER")]);

    mutateOptions(mutate).update?.(cache, { data: undefined });

    expect(readIncidentAccess(cache)).toEqual([incidentAccess("USER", "u-2", "OWNER")]);
  });

  it("converts a failed mutation to an ApiError", async () => {
    await mockMutation({ rejection: graphQlError("FORBIDDEN") });
    const { result } = renderHook(() => useGrantIncidentRole());

    await expect(result.current[0](args)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("useRevokeIncidentRole", () => {
  const args = {
    incidentId: "inc-1",
    principalKind: "USER" as const,
    principalId: "u-1",
    role: "EDITOR" as const,
  };

  it("sends the args with an optimistic response", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRevokeIncidentRole());

    await result.current[0](args);

    const options = mutateOptions(mutate);
    expect(options.variables).toEqual(args);
    expect(options.optimisticResponse).toEqual({ revokeIncidentRole: "u-1" });
  });

  it("removes only the row that matches kind, id and role", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRevokeIncidentRole());
    await result.current[0](args);
    const cache = newCache();
    seedIncidentAccess(cache, [
      incidentAccess("USER", "u-1", "EDITOR"),
      incidentAccess("USER", "u-1", "VIEWER"),
      incidentAccess("GROUP", "u-1", "EDITOR"),
    ]);

    mutateOptions(mutate).update?.(cache, { data: { revokeIncidentRole: "u-1" } });

    expect(readIncidentAccess(cache)).toEqual([
      incidentAccess("USER", "u-1", "VIEWER"),
      incidentAccess("GROUP", "u-1", "EDITOR"),
    ]);
  });

  it("leaves an unloaded access list alone", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRevokeIncidentRole());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, { data: { revokeIncidentRole: "u-1" } });

    expect(readIncidentAccess(cache)).toBeUndefined();
  });

  it("converts a failed mutation to an ApiError", async () => {
    await mockMutation({ rejection: graphQlError("NOT_FOUND") });
    const { result } = renderHook(() => useRevokeIncidentRole());

    await expect(result.current[0](args)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("useCreateAccessGroup", () => {
  const group = { id: "g-1", name: "Staff", description: "Staff group", archivedAt: null };

  it("returns the id of the created group", async () => {
    await mockMutation({ resolved: { data: { createAccessGroup: group } } });
    const { result } = renderHook(() => useCreateAccessGroup());

    await expect(result.current[0]({ name: "Staff", description: "Staff group" })).resolves.toEqual(
      { groupId: "g-1" },
    );
  });

  it("sends the args and an optimistic group with a temporary id", async () => {
    const mutate = await mockMutation({ resolved: { data: { createAccessGroup: group } } });
    const { result } = renderHook(() => useCreateAccessGroup());

    await result.current[0]({ name: "Staff", description: "Staff group" });

    const options = mutateOptions(mutate);
    expect(options.variables).toEqual({ name: "Staff", description: "Staff group" });
    expect(options.optimisticResponse).toEqual({
      createAccessGroup: {
        id: expect.stringMatching(/^optimistic-/),
        name: "Staff",
        description: "Staff group",
        archivedAt: null,
      },
    });
  });

  it("appends the new group to the cached list", async () => {
    const mutate = await mockMutation({ resolved: { data: { createAccessGroup: group } } });
    const { result } = renderHook(() => useCreateAccessGroup());
    await result.current[0]({ name: "Staff", description: "Staff group" });
    const cache = newCache();
    const other = { id: "g-0", name: "Other", description: "", archivedAt: null };
    cache.writeQuery({ query: LIST_ACCESS_GROUPS, data: { accessGroups: [other] } });

    mutateOptions(mutate).update?.(cache, { data: { createAccessGroup: group } });

    expect(cache.readQuery({ query: LIST_ACCESS_GROUPS })?.accessGroups).toEqual([other, group]);
  });

  it("does not add a group that is already cached", async () => {
    const mutate = await mockMutation({ resolved: { data: { createAccessGroup: group } } });
    const { result } = renderHook(() => useCreateAccessGroup());
    await result.current[0]({ name: "Staff", description: "Staff group" });
    const cache = newCache();
    cache.writeQuery({ query: LIST_ACCESS_GROUPS, data: { accessGroups: [group] } });

    mutateOptions(mutate).update?.(cache, { data: { createAccessGroup: group } });

    expect(cache.readQuery({ query: LIST_ACCESS_GROUPS })?.accessGroups).toEqual([group]);
  });

  it("leaves an unloaded group list alone and ignores an empty response", async () => {
    const mutate = await mockMutation({ resolved: { data: { createAccessGroup: group } } });
    const { result } = renderHook(() => useCreateAccessGroup());
    await result.current[0]({ name: "Staff", description: "Staff group" });
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, { data: { createAccessGroup: group } });
    mutateOptions(mutate).update?.(cache, { data: undefined });

    expect(cache.readQuery({ query: LIST_ACCESS_GROUPS })).toBeNull();
  });

  it("fails when the response has no group", async () => {
    await mockMutation({ resolved: { data: { createAccessGroup: null } } });
    const { result } = renderHook(() => useCreateAccessGroup());

    await expect(result.current[0]({ name: "Staff", description: "Staff group" })).rejects.toThrow(
      "Create access group failed",
    );
  });
});

describe("access group commands that refetch the group list", () => {
  it.each([
    {
      name: "useUpdateAccessGroupDescription",
      hook: useUpdateAccessGroupDescription,
      args: { groupId: "g-1", description: "New" },
      variables: { groupId: "g-1", description: "New" },
    },
    {
      name: "useRenameAccessGroup",
      hook: useRenameAccessGroup,
      args: { groupId: "g-1", name: "New" },
      variables: { groupId: "g-1", name: "New" },
    },
    {
      name: "useArchiveAccessGroup",
      hook: useArchiveAccessGroup,
      args: { groupId: "g-1" },
      variables: { groupId: "g-1" },
    },
  ] as const)(
    "$name sends the args and refetches the groups",
    async ({ hook, args, variables }) => {
      const mutate = await mockMutation();
      const { result } = renderHook(() => hook());

      await (result.current[0] as (a: typeof args) => Promise<void>)(args);

      expect(mutate).toHaveBeenCalledWith({
        variables,
        refetchQueries: [{ query: LIST_ACCESS_GROUPS }],
      });
    },
  );

  it("useArchiveAccessGroup sends only the group id, whatever else the caller passes", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useArchiveAccessGroup());

    await result.current[0]({ groupId: "g-1", extra: "x" } as { groupId: string });

    expect(mutateOptions(mutate).variables).toEqual({ groupId: "g-1" });
  });
});

describe("useAddGroupMember", () => {
  const args = { groupId: "g-1", subject: "s-2" };

  function seedMembers(cache: InMemoryCache, members: string[]) {
    cache.writeQuery({
      query: LIST_GROUP_MEMBERS,
      variables: { groupId: "g-1" },
      data: { groupMembers: members },
    });
  }
  const readMembers = (cache: InMemoryCache) =>
    cache.readQuery({ query: LIST_GROUP_MEMBERS, variables: { groupId: "g-1" } })?.groupMembers;

  it("sends the args and appends the member to the cached list", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useAddGroupMember());
    await result.current[0](args);
    const cache = newCache();
    seedMembers(cache, ["s-1"]);

    expect(mutateOptions(mutate).variables).toEqual(args);
    mutateOptions(mutate).update?.(cache, {});

    expect(readMembers(cache)).toEqual(["s-1", "s-2"]);
  });

  it("does not duplicate a member that is already listed", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useAddGroupMember());
    await result.current[0](args);
    const cache = newCache();
    seedMembers(cache, ["s-2"]);

    mutateOptions(mutate).update?.(cache, {});

    expect(readMembers(cache)).toEqual(["s-2"]);
  });

  it("leaves an unloaded member list alone", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useAddGroupMember());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, {});

    expect(readMembers(cache)).toBeUndefined();
  });
});

describe("useRemoveGroupMember", () => {
  const args = { groupId: "g-1", subject: "s-2" };

  function seedMembers(cache: InMemoryCache, members: string[]) {
    cache.writeQuery({
      query: LIST_GROUP_MEMBERS,
      variables: { groupId: "g-1" },
      data: { groupMembers: members },
    });
  }
  const readMembers = (cache: InMemoryCache) =>
    cache.readQuery({ query: LIST_GROUP_MEMBERS, variables: { groupId: "g-1" } })?.groupMembers;

  it("sends the args and drops the member from the cached list", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRemoveGroupMember());
    await result.current[0](args);
    const cache = newCache();
    seedMembers(cache, ["s-1", "s-2", "s-3"]);

    expect(mutateOptions(mutate).variables).toEqual(args);
    mutateOptions(mutate).update?.(cache, {});

    expect(readMembers(cache)).toEqual(["s-1", "s-3"]);
  });

  it("leaves an unloaded member list alone", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRemoveGroupMember());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, {});

    expect(readMembers(cache)).toBeUndefined();
  });
});

describe("useGrantGlobalRole", () => {
  const args = { subject: "s-1", role: "GROUP_ADMIN" as const };
  const grant = (subject: string, role: "SYSTEM_ADMIN" | "GROUP_ADMIN", name = "", email = "") => ({
    subject,
    role,
    name,
    email,
  });

  it("sends the args with an optimistic response", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantGlobalRole());

    await result.current[0](args);

    expect(mutateOptions(mutate).variables).toEqual(args);
    expect(mutateOptions(mutate).optimisticResponse).toEqual({ grantGlobalRole: "s-1" });
  });

  it("adds the grant with the user's name and email from the user list", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantGlobalRole());
    await result.current[0](args);
    const cache = newCache();
    cache.writeQuery({
      query: LIST_GLOBAL_ROLES,
      data: { globalRoles: [grant("s-0", "SYSTEM_ADMIN", "Zed", "z@x.ch")] },
    });
    cache.writeQuery({
      query: LIST_USERS,
      data: { users: [{ sub: "s-1", name: "Ann", email: "a@x.ch" }] },
    });

    mutateOptions(mutate).update?.(cache, {});

    expect(cache.readQuery({ query: LIST_GLOBAL_ROLES })?.globalRoles).toEqual([
      grant("s-0", "SYSTEM_ADMIN", "Zed", "z@x.ch"),
      grant("s-1", "GROUP_ADMIN", "Ann", "a@x.ch"),
    ]);
  });

  it("falls back to empty name and email for a user that is not listed, without duplicating", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantGlobalRole());
    await result.current[0](args);
    const cache = newCache();
    cache.writeQuery({
      query: LIST_GLOBAL_ROLES,
      data: { globalRoles: [grant("s-1", "GROUP_ADMIN", "Old", "o@x.ch")] },
    });

    mutateOptions(mutate).update?.(cache, {});

    expect(cache.readQuery({ query: LIST_GLOBAL_ROLES })?.globalRoles).toEqual([
      grant("s-1", "GROUP_ADMIN"),
    ]);
  });

  it("leaves an unloaded role list alone", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantGlobalRole());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, {});

    expect(cache.readQuery({ query: LIST_GLOBAL_ROLES })).toBeNull();
  });
});

describe("useRevokeGlobalRole", () => {
  const args = { subject: "s-1", role: "GROUP_ADMIN" as const };
  const grant = (subject: string, role: "SYSTEM_ADMIN" | "GROUP_ADMIN") => ({
    subject,
    role,
    name: "",
    email: "",
  });

  it("removes only the matching subject and role from the cached list", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRevokeGlobalRole());
    await result.current[0](args);
    const cache = newCache();
    cache.writeQuery({
      query: LIST_GLOBAL_ROLES,
      data: {
        globalRoles: [
          grant("s-1", "GROUP_ADMIN"),
          grant("s-1", "SYSTEM_ADMIN"),
          grant("s-2", "GROUP_ADMIN"),
        ],
      },
    });

    expect(mutateOptions(mutate).variables).toEqual(args);
    expect(mutateOptions(mutate).optimisticResponse).toEqual({ revokeGlobalRole: "s-1" });
    mutateOptions(mutate).update?.(cache, {});

    expect(cache.readQuery({ query: LIST_GLOBAL_ROLES })?.globalRoles).toEqual([
      grant("s-1", "SYSTEM_ADMIN"),
      grant("s-2", "GROUP_ADMIN"),
    ]);
  });

  it("leaves an unloaded role list alone", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRevokeGlobalRole());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, {});

    expect(cache.readQuery({ query: LIST_GLOBAL_ROLES })).toBeNull();
  });
});

describe("useSetDefaultAccessMode", () => {
  const readDefault = (cache: InMemoryCache) =>
    cache.readQuery({ query: GET_DEFAULT_ACCESS })?.defaultAccess;

  it("sends only the mode and an optimistic response", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useSetDefaultAccessMode());

    await result.current[0]({ mode: "RESTRICTED" });

    expect(mutateOptions(mutate).variables).toEqual({ mode: "RESTRICTED" });
    expect(mutateOptions(mutate).optimisticResponse).toEqual({
      setDefaultAccessMode: { mode: "RESTRICTED", grants: [] },
    });
  });

  it("takes the new mode from the response and keeps the cached grants", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useSetDefaultAccessMode());
    await result.current[0]({ mode: "OPEN_OPERATIONAL" });
    const cache = newCache();
    seedDefaultAccess(cache, "RESTRICTED", [defaultGrant("USER", "u-1", "EDITOR")]);

    mutateOptions(mutate).update?.(cache, {
      data: { setDefaultAccessMode: { mode: "OPEN_OPERATIONAL", grants: [] } },
    });

    expect(readDefault(cache)).toEqual({
      mode: "OPEN_OPERATIONAL",
      grants: [defaultGrant("USER", "u-1", "EDITOR")],
    });
  });

  it("starts from no grants when nothing is cached, and ignores an empty response", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useSetDefaultAccessMode());
    await result.current[0]({ mode: "OPEN_OPERATIONAL" });
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, { data: undefined });
    expect(readDefault(cache)).toBeUndefined();

    mutateOptions(mutate).update?.(cache, {
      data: { setDefaultAccessMode: { mode: "OPEN_OPERATIONAL", grants: [] } },
    });
    expect(readDefault(cache)).toEqual({ mode: "OPEN_OPERATIONAL", grants: [] });
  });

  it("converts a failed mutation to an ApiError", async () => {
    await mockMutation({ rejection: graphQlError("FORBIDDEN") });
    const { result } = renderHook(() => useSetDefaultAccessMode());

    await expect(result.current[0]({ mode: "RESTRICTED" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("useGrantDefaultRole", () => {
  const args = { principalKind: "USER" as const, principalId: "u-1", role: "EDITOR" as const };
  const readDefault = (cache: InMemoryCache) =>
    cache.readQuery({ query: GET_DEFAULT_ACCESS })?.defaultAccess;

  it("sends the args and an optimistic response holding the new grant", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantDefaultRole());

    await result.current[0](args);

    expect(mutateOptions(mutate).variables).toEqual(args);
    expect(mutateOptions(mutate).optimisticResponse).toEqual({
      grantDefaultRole: { mode: "RESTRICTED", grants: [defaultGrant("USER", "u-1", "EDITOR")] },
    });
  });

  it("replaces the principal's earlier grant and keeps the cached mode", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantDefaultRole());
    await result.current[0](args);
    const cache = newCache();
    seedDefaultAccess(cache, "OPEN_OPERATIONAL", [
      defaultGrant("USER", "u-1", "VIEWER"),
      defaultGrant("GROUP", "u-1", "VIEWER"),
    ]);

    mutateOptions(mutate).update?.(cache, {
      data: { grantDefaultRole: { mode: "RESTRICTED", grants: [] } },
    });

    expect(readDefault(cache)).toEqual({
      mode: "OPEN_OPERATIONAL",
      grants: [defaultGrant("GROUP", "u-1", "VIEWER"), defaultGrant("USER", "u-1", "EDITOR")],
    });
  });

  it("leaves an uncached default access alone and ignores an empty response", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useGrantDefaultRole());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, {
      data: { grantDefaultRole: { mode: "RESTRICTED", grants: [] } },
    });
    mutateOptions(mutate).update?.(cache, { data: undefined });

    expect(readDefault(cache)).toBeUndefined();
  });

  it("converts a failed mutation to an ApiError", async () => {
    await mockMutation({ rejection: graphQlError("INVALID_INPUT") });
    const { result } = renderHook(() => useGrantDefaultRole());

    await expect(result.current[0](args)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("useRevokeDefaultRole", () => {
  const args = { principalKind: "USER" as const, principalId: "u-1", role: "EDITOR" as const };
  const readDefault = (cache: InMemoryCache) =>
    cache.readQuery({ query: GET_DEFAULT_ACCESS })?.defaultAccess;

  it("sends the args and removes only the exact grant from the cache", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRevokeDefaultRole());
    await result.current[0](args);
    const cache = newCache();
    seedDefaultAccess(cache, "OPEN_OPERATIONAL", [
      defaultGrant("USER", "u-1", "EDITOR"),
      defaultGrant("USER", "u-1", "VIEWER"),
      defaultGrant("GROUP", "u-1", "EDITOR"),
    ]);

    expect(mutateOptions(mutate).variables).toEqual(args);
    expect(mutateOptions(mutate).optimisticResponse).toEqual({
      revokeDefaultRole: { mode: "RESTRICTED", grants: [] },
    });
    mutateOptions(mutate).update?.(cache, {});

    expect(readDefault(cache)).toEqual({
      mode: "OPEN_OPERATIONAL",
      grants: [defaultGrant("USER", "u-1", "VIEWER"), defaultGrant("GROUP", "u-1", "EDITOR")],
    });
  });

  it("leaves an uncached default access alone", async () => {
    const mutate = await mockMutation();
    const { result } = renderHook(() => useRevokeDefaultRole());
    await result.current[0](args);
    const cache = newCache();

    mutateOptions(mutate).update?.(cache, {});

    expect(readDefault(cache)).toBeUndefined();
  });

  it("converts a failed mutation to an ApiError", async () => {
    await mockMutation({ rejection: graphQlError("NOT_FOUND") });
    const { result } = renderHook(() => useRevokeDefaultRole());

    await expect(result.current[0](args)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("command state", () => {
  it("reports loading and converts the mutation error to an ApiError", async () => {
    const { useMutation } = await import("@apollo/client/react");
    vi.mocked(useMutation).mockReturnValue([
      vi.fn(),
      { loading: true, error: graphQlError("FORBIDDEN"), reset: vi.fn(), called: true } as never,
    ]);
    const { result } = renderHook(() => useRenameAccessGroup());

    expect(result.current[1].loading).toBe(true);
    expect(result.current[1].error).toBeInstanceOf(ApiError);
  });

  it("has no error when the mutation has none", async () => {
    await mockMutation();
    const { result } = renderHook(() => useRenameAccessGroup());

    expect(result.current[1]).toEqual({ loading: false, error: undefined });
  });
});
