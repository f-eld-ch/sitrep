import { useApolloClient, useMutation } from "@apollo/client/react";
import { apiErrorFromApolloError, rethrowAsApiError } from "../errors";
import type { CommandHook, CommandState } from "../result";
import {
  ADD_GROUP_MEMBER,
  ARCHIVE_ACCESS_GROUP,
  CHANGE_INCIDENT_ACCESS_MODE,
  CREATE_ACCESS_GROUP,
  GRANT_GLOBAL_ROLE,
  GRANT_INCIDENT_ROLE,
  LIST_ACCESS_GROUPS,
  LIST_GLOBAL_ROLES,
  LIST_GROUP_MEMBERS,
  LIST_INCIDENT_ACCESS,
  LIST_INCIDENT_ACCESS_MODE,
  LIST_USERS,
  REMOVE_GROUP_MEMBER,
  RENAME_ACCESS_GROUP,
  UPDATE_ACCESS_GROUP_DESCRIPTION,
  REVOKE_GLOBAL_ROLE,
  REVOKE_INCIDENT_ROLE,
} from "./documents";

export interface ChangeIncidentAccessModeArgs {
  incidentId: string;
  mode: "OPEN_OPERATIONAL" | "RESTRICTED";
}

export interface IncidentRoleArgs {
  incidentId: string;
  principalKind: "USER" | "GROUP" | "ALL";
  principalId: string;
  role: "OWNER" | "MANAGER" | "EDITOR" | "VIEWER";
}

export interface CreateAccessGroupArgs {
  name: string;
  description: string;
}

export interface RenameAccessGroupArgs {
  groupId: string;
  name: string;
}

export interface GroupMemberArgs {
  groupId: string;
  subject: string;
}

export interface GlobalRoleArgs {
  subject: string;
  role: "SYSTEM_ADMIN" | "GROUP_ADMIN";
}

function commandState(loading: boolean, error: { message: string } | undefined): CommandState {
  return { loading, error: error ? apiErrorFromApolloError(error) : undefined };
}

export function useChangeIncidentAccessMode(): CommandHook<ChangeIncidentAccessModeArgs> {
  const client = useApolloClient();
  const [mutate, result] = useMutation(CHANGE_INCIDENT_ACCESS_MODE);
  const changeMode = async (args: ChangeIncidentAccessModeArgs): Promise<void> => {
    client.writeQuery({
      query: LIST_INCIDENT_ACCESS_MODE,
      variables: { incidentId: args.incidentId },
      data: { incidentAccessMode: args.mode },
    });
    await mutate({
      variables: args,
      refetchQueries: [
        { query: LIST_INCIDENT_ACCESS, variables: { incidentId: args.incidentId } },
      ],
    }).catch(rethrowAsApiError);
  };
  return [changeMode, commandState(result.loading, result.error)];
}

export function useGrantIncidentRole(): CommandHook<IncidentRoleArgs> {
  const [mutate, result] = useMutation(GRANT_INCIDENT_ROLE);
  const grant = async (args: IncidentRoleArgs): Promise<void> => {
    await mutate({
      variables: args,
      optimisticResponse: {
        grantIncidentRole: {
          incidentId: args.incidentId,
          principalKind: args.principalKind,
          principalId: args.principalId,
          principalName: args.principalId,
          role: args.role,
        },
      },
      update(cache, { data }) {
        const grant = data?.grantIncidentRole;
        if (!grant) return;
        const cached = cache.readQuery({
          query: LIST_INCIDENT_ACCESS,
          variables: { incidentId: args.incidentId },
        });
        if (!cached) return;
        // A principal holds at most one role per incident; a new grant replaces any other role row.
        const withoutExisting = cached.incidentAccess.filter(
          (existing) =>
            !(
              existing.principalKind === grant.principalKind &&
              existing.principalId === grant.principalId
            ),
        );
        cache.writeQuery({
          query: LIST_INCIDENT_ACCESS,
          variables: { incidentId: args.incidentId },
          data: { incidentAccess: [...withoutExisting, grant] },
        });
      },
    }).catch(rethrowAsApiError);
  };
  return [grant, commandState(result.loading, result.error)];
}

export function useRevokeIncidentRole(): CommandHook<IncidentRoleArgs> {
  const [mutate, result] = useMutation(REVOKE_INCIDENT_ROLE);
  const revoke = async (args: IncidentRoleArgs): Promise<void> => {
    await mutate({
      variables: args,
      optimisticResponse: { revokeIncidentRole: args.principalId },
      update(cache) {
        const cached = cache.readQuery({
          query: LIST_INCIDENT_ACCESS,
          variables: { incidentId: args.incidentId },
        });
        if (!cached) return;
        cache.writeQuery({
          query: LIST_INCIDENT_ACCESS,
          variables: { incidentId: args.incidentId },
          data: {
            incidentAccess: cached.incidentAccess.filter(
              (existing) =>
                !(
                  existing.principalKind === args.principalKind &&
                  existing.principalId === args.principalId &&
                  existing.role === args.role
                ),
            ),
          },
        });
      },
    }).catch(rethrowAsApiError);
  };
  return [revoke, commandState(result.loading, result.error)];
}

export function useCreateAccessGroup(): CommandHook<CreateAccessGroupArgs, { groupId: string }> {
  const [mutate, result] = useMutation(CREATE_ACCESS_GROUP);
  const create = async (args: CreateAccessGroupArgs): Promise<{ groupId: string }> => {
    const optimisticGroupId = `optimistic-${crypto.randomUUID()}`;
    const response = await mutate({
      variables: args,
      optimisticResponse: {
        createAccessGroup: {
          id: optimisticGroupId,
          name: args.name,
          description: args.description,
          archivedAt: null,
        },
      },
      update(cache, { data }) {
        const group = data?.createAccessGroup;
        if (!group) return;
        const cached = cache.readQuery({ query: LIST_ACCESS_GROUPS });
        if (!cached || cached.accessGroups.some((existing) => existing.id === group.id)) return;
        cache.writeQuery({
          query: LIST_ACCESS_GROUPS,
          data: { accessGroups: [...cached.accessGroups, group] },
        });
      },
    });
    const groupId = response.data?.createAccessGroup?.id;
    if (!groupId)
      throw Object.assign(new Error("Create access group failed"), { code: "UNKNOWN" as const });
    return { groupId };
  };
  return [create, commandState(result.loading, result.error)];
}

export interface UpdateAccessGroupDescriptionArgs {
  groupId: string;
  description: string;
}

export function useUpdateAccessGroupDescription(): CommandHook<UpdateAccessGroupDescriptionArgs> {
  const [mutate, result] = useMutation(UPDATE_ACCESS_GROUP_DESCRIPTION);
  const update = async (args: UpdateAccessGroupDescriptionArgs): Promise<void> => {
    await mutate({ variables: args, refetchQueries: [{ query: LIST_ACCESS_GROUPS }] });
  };
  return [update, commandState(result.loading, result.error)];
}

export function useRenameAccessGroup(): CommandHook<RenameAccessGroupArgs> {
  const [mutate, result] = useMutation(RENAME_ACCESS_GROUP);
  const rename = async (args: RenameAccessGroupArgs): Promise<void> => {
    await mutate({ variables: args, refetchQueries: [{ query: LIST_ACCESS_GROUPS }] });
  };
  return [rename, commandState(result.loading, result.error)];
}

export function useArchiveAccessGroup(): CommandHook<{ groupId: string }> {
  const [mutate, result] = useMutation(ARCHIVE_ACCESS_GROUP);
  const archive = async ({ groupId }: { groupId: string }): Promise<void> => {
    await mutate({ variables: { groupId }, refetchQueries: [{ query: LIST_ACCESS_GROUPS }] });
  };
  return [archive, commandState(result.loading, result.error)];
}

export function useAddGroupMember(): CommandHook<GroupMemberArgs> {
  const [mutate, result] = useMutation(ADD_GROUP_MEMBER);
  const add = async (args: GroupMemberArgs): Promise<void> => {
    await mutate({
      variables: args,
      update(cache) {
        const cached = cache.readQuery({
          query: LIST_GROUP_MEMBERS,
          variables: { groupId: args.groupId },
        });
        if (!cached || cached.groupMembers.includes(args.subject)) return;
        cache.writeQuery({
          query: LIST_GROUP_MEMBERS,
          variables: { groupId: args.groupId },
          data: { groupMembers: [...cached.groupMembers, args.subject] },
        });
      },
    });
  };
  return [add, commandState(result.loading, result.error)];
}

export function useRemoveGroupMember(): CommandHook<GroupMemberArgs> {
  const [mutate, result] = useMutation(REMOVE_GROUP_MEMBER);
  const remove = async (args: GroupMemberArgs): Promise<void> => {
    await mutate({
      variables: args,
      update(cache) {
        const cached = cache.readQuery({
          query: LIST_GROUP_MEMBERS,
          variables: { groupId: args.groupId },
        });
        if (!cached) return;
        cache.writeQuery({
          query: LIST_GROUP_MEMBERS,
          variables: { groupId: args.groupId },
          data: {
            groupMembers: cached.groupMembers.filter((subject) => subject !== args.subject),
          },
        });
      },
    });
  };
  return [remove, commandState(result.loading, result.error)];
}

export function useGrantGlobalRole(): CommandHook<GlobalRoleArgs> {
  const [mutate, result] = useMutation(GRANT_GLOBAL_ROLE);
  const grant = async (args: GlobalRoleArgs): Promise<void> => {
    await mutate({
      variables: args,
      optimisticResponse: { grantGlobalRole: args.subject },
      update(cache) {
        const cachedRoles = cache.readQuery({ query: LIST_GLOBAL_ROLES });
        if (!cachedRoles) return;

        const withoutExisting = cachedRoles.globalRoles.filter(
          (grant) => !(grant.subject === args.subject && grant.role === args.role),
        );
        const cachedUsers = cache.readQuery({ query: LIST_USERS });
        const user = cachedUsers?.users.find((candidate) => candidate.sub === args.subject);

        cache.writeQuery({
          query: LIST_GLOBAL_ROLES,
          data: {
            globalRoles: [
              ...withoutExisting,
              {
                subject: args.subject,
                role: args.role,
                name: user?.name ?? "",
                email: user?.email ?? "",
              },
            ],
          },
        });
      },
    });
  };
  return [grant, commandState(result.loading, result.error)];
}

export function useRevokeGlobalRole(): CommandHook<GlobalRoleArgs> {
  const [mutate, result] = useMutation(REVOKE_GLOBAL_ROLE);
  const revoke = async (args: GlobalRoleArgs): Promise<void> => {
    await mutate({
      variables: args,
      optimisticResponse: { revokeGlobalRole: args.subject },
      update(cache) {
        const cached = cache.readQuery({ query: LIST_GLOBAL_ROLES });
        if (!cached) return;

        cache.writeQuery({
          query: LIST_GLOBAL_ROLES,
          data: {
            globalRoles: cached.globalRoles.filter(
              (grant) => !(grant.subject === args.subject && grant.role === args.role),
            ),
          },
        });
      },
    });
  };
  return [revoke, commandState(result.loading, result.error)];
}
