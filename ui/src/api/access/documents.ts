import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  ListAccessGroupsQuery,
  ListAccessGroupsQueryVariables,
  ListGroupMembersQuery,
  ListGroupMembersQueryVariables,
  ListIncidentAccessQuery,
  ListIncidentAccessQueryVariables,
  ListIncidentAccessModeQuery,
  ListIncidentAccessModeQueryVariables,
  ListUsersQuery,
  ListUsersQueryVariables,
  AddGroupMemberMutation,
  AddGroupMemberMutationVariables,
  ArchiveAccessGroupMutation,
  ArchiveAccessGroupMutationVariables,
  ChangeIncidentAccessModeMutation,
  ChangeIncidentAccessModeMutationVariables,
  CreateAccessGroupMutation,
  CreateAccessGroupMutationVariables,
  GrantGlobalRoleMutation,
  GrantGlobalRoleMutationVariables,
  GrantIncidentRoleMutation,
  GrantIncidentRoleMutationVariables,
  RemoveGroupMemberMutation,
  RemoveGroupMemberMutationVariables,
  RenameAccessGroupMutation,
  RenameAccessGroupMutationVariables,
  RevokeGlobalRoleMutation,
  RevokeGlobalRoleMutationVariables,
  RevokeIncidentRoleMutation,
  RevokeIncidentRoleMutationVariables,
} from "gql/next";

export const LIST_INCIDENT_ACCESS: TypedDocumentNode<
  ListIncidentAccessQuery,
  ListIncidentAccessQueryVariables
> = gql`
  query ListIncidentAccess($incidentId: ID!) {
    incidentAccess(incidentId: $incidentId) {
      incidentId
      principalKind
      principalId
      principalName
      role
    }
  }
`;

export const LIST_INCIDENT_ACCESS_MODE: TypedDocumentNode<
  ListIncidentAccessModeQuery,
  ListIncidentAccessModeQueryVariables
> = gql`
  query ListIncidentAccessMode($incidentId: ID!) {
    incidentAccessMode(incidentId: $incidentId)
  }
`;

export const LIST_ACCESS_GROUPS: TypedDocumentNode<
  ListAccessGroupsQuery,
  ListAccessGroupsQueryVariables
> = gql`
  query ListAccessGroups {
    accessGroups {
      id
      name
      description
      archivedAt
    }
  }
`;

export const LIST_GROUP_MEMBERS: TypedDocumentNode<
  ListGroupMembersQuery,
  ListGroupMembersQueryVariables
> = gql`
  query ListGroupMembers($groupId: ID!) {
    groupMembers(groupId: $groupId)
  }
`;

export const LIST_USERS: TypedDocumentNode<ListUsersQuery, ListUsersQueryVariables> = gql`
  query ListUsers {
    users {
      sub
      name
      email
    }
  }
`;

export const CHANGE_INCIDENT_ACCESS_MODE: TypedDocumentNode<
  ChangeIncidentAccessModeMutation,
  ChangeIncidentAccessModeMutationVariables
> = gql`
  mutation ChangeIncidentAccessMode($incidentId: ID!, $mode: IncidentAccessMode!) {
    changeIncidentAccessMode(incidentId: $incidentId, mode: $mode) {
      incidentId
      principalKind
      principalId
      role
    }
  }
`;

export const GRANT_INCIDENT_ROLE: TypedDocumentNode<
  GrantIncidentRoleMutation,
  GrantIncidentRoleMutationVariables
> = gql`
  mutation GrantIncidentRole(
    $incidentId: ID!
    $principalKind: AccessPrincipalKind!
    $principalId: ID!
    $role: IncidentRole!
  ) {
    grantIncidentRole(
      incidentId: $incidentId
      principalKind: $principalKind
      principalId: $principalId
      role: $role
    ) {
      incidentId
      principalKind
      principalId
      principalName
      role
    }
  }
`;

export const REVOKE_INCIDENT_ROLE: TypedDocumentNode<
  RevokeIncidentRoleMutation,
  RevokeIncidentRoleMutationVariables
> = gql`
  mutation RevokeIncidentRole(
    $incidentId: ID!
    $principalKind: AccessPrincipalKind!
    $principalId: ID!
    $role: IncidentRole!
  ) {
    revokeIncidentRole(
      incidentId: $incidentId
      principalKind: $principalKind
      principalId: $principalId
      role: $role
    )
  }
`;

export const CREATE_ACCESS_GROUP: TypedDocumentNode<
  CreateAccessGroupMutation,
  CreateAccessGroupMutationVariables
> = gql`
  mutation CreateAccessGroup($name: String!, $description: String!) {
    createAccessGroup(name: $name, description: $description) {
      id
      name
      description
      archivedAt
    }
  }
`;

export const RENAME_ACCESS_GROUP: TypedDocumentNode<
  RenameAccessGroupMutation,
  RenameAccessGroupMutationVariables
> = gql`
  mutation RenameAccessGroup($groupId: ID!, $name: String!) {
    renameAccessGroup(groupId: $groupId, name: $name) {
      id
      name
      description
      archivedAt
    }
  }
`;

export const ARCHIVE_ACCESS_GROUP: TypedDocumentNode<
  ArchiveAccessGroupMutation,
  ArchiveAccessGroupMutationVariables
> = gql`
  mutation ArchiveAccessGroup($groupId: ID!) {
    archiveAccessGroup(groupId: $groupId)
  }
`;

export const ADD_GROUP_MEMBER: TypedDocumentNode<
  AddGroupMemberMutation,
  AddGroupMemberMutationVariables
> = gql`
  mutation AddGroupMember($groupId: ID!, $subject: String!) {
    addGroupMember(groupId: $groupId, subject: $subject)
  }
`;

export const REMOVE_GROUP_MEMBER: TypedDocumentNode<
  RemoveGroupMemberMutation,
  RemoveGroupMemberMutationVariables
> = gql`
  mutation RemoveGroupMember($groupId: ID!, $subject: String!) {
    removeGroupMember(groupId: $groupId, subject: $subject)
  }
`;

export const GRANT_GLOBAL_ROLE: TypedDocumentNode<
  GrantGlobalRoleMutation,
  GrantGlobalRoleMutationVariables
> = gql`
  mutation GrantGlobalRole($subject: ID!, $role: GlobalRole!) {
    grantGlobalRole(subject: $subject, role: $role)
  }
`;

export const REVOKE_GLOBAL_ROLE: TypedDocumentNode<
  RevokeGlobalRoleMutation,
  RevokeGlobalRoleMutationVariables
> = gql`
  mutation RevokeGlobalRole($subject: ID!, $role: GlobalRole!) {
    revokeGlobalRole(subject: $subject, role: $role)
  }
`;
