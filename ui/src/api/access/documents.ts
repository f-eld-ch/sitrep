import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  ListAccessGroupsQuery,
  ListAccessGroupsQueryVariables,
  ListGroupMembersQuery,
  ListGroupMembersQueryVariables,
  ListIncidentAccessQuery,
  ListIncidentAccessQueryVariables,
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
      role
    }
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
