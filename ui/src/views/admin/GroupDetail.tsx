import { useState } from "react";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "react-router";
import {
  useAccessGroups,
  useAccessUsers,
  useAddGroupMember,
  useArchiveAccessGroup,
  useGroupMembers,
  useRemoveGroupMember,
  useRenameAccessGroup,
} from "api";
import { Spinner } from "components";
import { useRedirectIfForbidden } from "utils";

function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const groupsResult = useAccessGroups();
  const usersResult = useAccessUsers();
  const membersResult = useGroupMembers(groupId);
  const [userFilter, setUserFilter] = useState("");
  const [pendingMembers, setPendingMembers] = useState<Set<string>>(new Set());
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [renameGroup, renameState] = useRenameAccessGroup();
  const [archiveGroup, archiveState] = useArchiveAccessGroup();
  const [addMember, addMemberState] = useAddGroupMember();
  const [removeMember, removeMemberState] = useRemoveGroupMember();

  const selectedMembers =
    membersResult.status === "ready" ? new Set(membersResult.data.subjects) : new Set<string>();

  useRedirectIfForbidden(groupsResult.status === "error" ? groupsResult.error : undefined);

  if (groupsResult.status === "loading") return <Spinner />;
  if (groupsResult.status === "error") {
    if (groupsResult.error.code === "FORBIDDEN") return null;
    return <div className="notification is-danger">{groupsResult.error.message}</div>;
  }

  const group = groupsResult.data.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    return <div className="notification is-warning">This group no longer exists.</div>;
  }

  const filteredUsers =
    usersResult.status === "ready"
      ? usersResult.data.users.filter((user) => {
          const query = userFilter.trim().toLowerCase();
          return (
            !query ||
            user.name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query) ||
            user.sub.toLowerCase().includes(query)
          );
        })
      : [];
  const mutationError =
    renameState.error ?? archiveState.error ?? addMemberState.error ?? removeMemberState.error;

  const rename = async () => {
    if (!groupName.trim()) return;
    await renameGroup({ groupId: group.id, name: groupName.trim() });
    setGroupName("");
  };

  return (
    <>
      <div className="level">
        <div>
          <h2 className="title is-4 mb-1">{group.name}</h2>
          <p>{group.description || "No description"}</p>
          {membersResult.status === "ready" && (
            <p className="help">
              {membersResult.data.subjects.length}{" "}
              {membersResult.data.subjects.length === 1 ? "member" : "members"}
            </p>
          )}
        </div>
        {!group.archivedAt && (
          <button
            type="button"
            className="button is-danger is-light"
            onClick={() => {
              if (
                window.confirm(
                  `Archive "${group.name}"? Archived groups can no longer be renamed or granted incident access.`,
                )
              ) {
                void archiveGroup({ groupId: group.id }).then(() =>
                  navigate("/admin/access/groups"),
                );
              }
            }}
            disabled={archiveState.loading}
          >
            Archive
          </button>
        )}
      </div>

      {mutationError && <div className="notification is-danger">{mutationError.message}</div>}

      {group.archivedAt && (
        <div className="notification is-warning is-light">
          This group is archived and read-only. Membership can no longer be changed.
        </div>
      )}

      {!group.archivedAt && (
        <div className="field has-addons">
          <div className="control is-expanded">
            <input
              className="input"
              placeholder="New group name"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
            />
          </div>
          <div className="control">
            <button
              type="button"
              className="button"
              onClick={() => void rename()}
              disabled={renameState.loading}
            >
              Rename
            </button>
          </div>
        </div>
      )}

      <h3 className="title is-5 mt-5">Members</h3>
      {membersResult.status === "loading" && <Spinner />}
      {membersResult.status === "error" && (
        <div className="notification is-danger">{membersResult.error.message}</div>
      )}
      {membersResult.status === "ready" && (
        <>
          <div className="field">
            <label className="label" htmlFor="user-filter">
              Add users
            </label>
            <div className="control">
              <input
                id="user-filter"
                className="input"
                placeholder="Search by name, email, or subject"
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
                disabled={Boolean(group.archivedAt)}
              />
            </div>
          </div>
          {usersResult.status === "loading" && <Spinner />}
          {usersResult.status === "error" && (
            <div className="notification is-danger">{usersResult.error.message}</div>
          )}
          {usersResult.status === "ready" && filteredUsers.length === 0 && (
            <p className="has-text-grey">No users match your search.</p>
          )}
          {usersResult.status === "ready" && filteredUsers.length > 0 && (
            <div className="table-container">
              <table className="table is-fullwidth is-hoverable">
                <thead>
                  <tr>
                    <th>User</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.sub}>
                      <td>
                        {user.name || "Unnamed user"} ({user.email})
                        <br />
                        <small>{user.sub}</small>
                      </td>
                      <td className="has-text-right">
                        <button
                          type="button"
                          className={`button is-small ${selectedMembers.has(user.sub) ? "is-danger" : "is-success"}`}
                          onClick={() => {
                            if (selectedMembers.has(user.sub)) {
                              setPendingRemovals((pending) => new Set(pending).add(user.sub));
                              void removeMember({ groupId: group.id, subject: user.sub })
                                .catch(() => undefined)
                                .finally(() => {
                                  setPendingRemovals((pending) => {
                                    const remaining = new Set(pending);
                                    remaining.delete(user.sub);
                                    return remaining;
                                  });
                                });
                              return;
                            }

                            if (pendingMembers.has(user.sub)) return;
                            setPendingMembers((pending) => new Set(pending).add(user.sub));
                            void addMember({ groupId: group.id, subject: user.sub })
                              .catch(() => undefined)
                              .finally(() => {
                                setPendingMembers((pending) => {
                                  const remaining = new Set(pending);
                                  remaining.delete(user.sub);
                                  return remaining;
                                });
                              });
                          }}
                          disabled={
                            Boolean(group.archivedAt) ||
                            pendingMembers.has(user.sub) ||
                            pendingRemovals.has(user.sub)
                          }
                        >
                          {pendingMembers.has(user.sub) ? (
                            <>
                              <FontAwesomeIcon icon={faSpinner} spin /> Adding
                            </>
                          ) : pendingRemovals.has(user.sub) ? (
                            <>
                              <FontAwesomeIcon icon={faSpinner} spin /> Removing
                            </>
                          ) : selectedMembers.has(user.sub) ? (
                            "Remove"
                          ) : (
                            "Add"
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default GroupDetail;
