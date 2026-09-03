import { useMutation } from "@apollo/client/react";
import { apiErrorFromApolloError } from "../errors";
import type { CommandHook, CommandState } from "../result";
import {
  ADD_GROUP_MEMBER,
  ARCHIVE_ACCESS_GROUP,
  CHANGE_INCIDENT_ACCESS_MODE,
  CREATE_ACCESS_GROUP,
  GRANT_GLOBAL_ROLE,
  GRANT_INCIDENT_ROLE,
  LIST_ACCESS_GROUPS,
  LIST_GROUP_MEMBERS,
  LIST_INCIDENT_ACCESS,
  REMOVE_GROUP_MEMBER,
  RENAME_ACCESS_GROUP,
  REVOKE_GLOBAL_ROLE,
  REVOKE_INCIDENT_ROLE,
} from "./documents";

export interface ChangeIncidentAccessModeArgs {
  incidentId: string;
  mode: "OPEN_OPERATIONAL" | "RESTRICTED";
}

export interface IncidentRoleArgs {
  incidentId: string;
  principalKind: "USER" | "GROUP";
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
  const [mutate, result] = useMutation(CHANGE_INCIDENT_ACCESS_MODE);
  const changeMode = async (args: ChangeIncidentAccessModeArgs): Promise<void> => {
    await mutate({
      variables: args,
      refetchQueries: [{ query: LIST_INCIDENT_ACCESS, variables: { incidentId: args.incidentId } }],
    });
  };
  return [changeMode, commandState(result.loading, result.error)];
}

export function useGrantIncidentRole(): CommandHook<IncidentRoleArgs> {
  const [mutate, result] = useMutation(GRANT_INCIDENT_ROLE);
  const grant = async (args: IncidentRoleArgs): Promise<void> => {
    await mutate({
      variables: args,
      refetchQueries: [{ query: LIST_INCIDENT_ACCESS, variables: { incidentId: args.incidentId } }],
    });
  };
  return [grant, commandState(result.loading, result.error)];
}

export function useRevokeIncidentRole(): CommandHook<IncidentRoleArgs> {
  const [mutate, result] = useMutation(REVOKE_INCIDENT_ROLE);
  const revoke = async (args: IncidentRoleArgs): Promise<void> => {
    await mutate({
      variables: args,
      refetchQueries: [{ query: LIST_INCIDENT_ACCESS, variables: { incidentId: args.incidentId } }],
    });
  };
  return [revoke, commandState(result.loading, result.error)];
}

export function useCreateAccessGroup(): CommandHook<CreateAccessGroupArgs, { groupId: string }> {
  const [mutate, result] = useMutation(CREATE_ACCESS_GROUP);
  const create = async (args: CreateAccessGroupArgs): Promise<{ groupId: string }> => {
    const response = await mutate({
      variables: args,
      refetchQueries: [{ query: LIST_ACCESS_GROUPS }],
    });
    const groupId = response.data?.createAccessGroup?.id;
    if (!groupId)
      throw Object.assign(new Error("Create access group failed"), { code: "UNKNOWN" as const });
    return { groupId };
  };
  return [create, commandState(result.loading, result.error)];
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
      refetchQueries: [{ query: LIST_GROUP_MEMBERS, variables: { groupId: args.groupId } }],
      awaitRefetchQueries: true,
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
      refetchQueries: [{ query: LIST_GROUP_MEMBERS, variables: { groupId: args.groupId } }],
    });
  };
  return [remove, commandState(result.loading, result.error)];
}

export function useGrantGlobalRole(): CommandHook<GlobalRoleArgs> {
  const [mutate, result] = useMutation(GRANT_GLOBAL_ROLE);
  const grant = async (args: GlobalRoleArgs): Promise<void> => {
    await mutate({ variables: args });
  };
  return [grant, commandState(result.loading, result.error)];
}

export function useRevokeGlobalRole(): CommandHook<GlobalRoleArgs> {
  const [mutate, result] = useMutation(REVOKE_GLOBAL_ROLE);
  const revoke = async (args: GlobalRoleArgs): Promise<void> => {
    await mutate({ variables: args });
  };
  return [revoke, commandState(result.loading, result.error)];
}
