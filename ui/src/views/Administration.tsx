import { useState } from "react";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  useAccessGroups,
  useAccessUsers,
  useAddGroupMember,
  useArchiveAccessGroup,
  useCreateAccessGroup,
  useGroupMembers,
  useRemoveGroupMember,
  useRenameAccessGroup,
} from "api";
import { Spinner } from "components";

function Administration() {
  const groupsResult = useAccessGroups();
  const usersResult = useAccessUsers();
  const [selectedGroupId, setSelectedGroupId] = useState<string>();
  const membersResult = useGroupMembers(selectedGroupId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [pendingMembers, setPendingMembers] = useState<Set<string>>(new Set());
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [createGroup, createState] = useCreateAccessGroup();
  const [renameGroup, renameState] = useRenameAccessGroup();
  const [archiveGroup, archiveState] = useArchiveAccessGroup();
  const [addMember, addMemberState] = useAddGroupMember();
  const [removeMember, removeMemberState] = useRemoveGroupMember();

  const selectedMembers =
    membersResult.status === "ready" ? new Set(membersResult.data.subjects) : new Set<string>();

  if (groupsResult.status === "loading") return <Spinner />;
  if (groupsResult.status === "error") {
    return <div className="notification is-danger">{groupsResult.error.message}</div>;
  }

  const selectedGroup = groupsResult.data.groups.find((group) => group.id === selectedGroupId);
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
    createState.error ??
    renameState.error ??
    archiveState.error ??
    addMemberState.error ??
    removeMemberState.error;

  const create = async () => {
    if (!name.trim()) return;
    const result = await createGroup({ name: name.trim(), description: description.trim() });
    setName("");
    setDescription("");
    setSelectedGroupId(result.groupId);
  };

  const rename = async () => {
    if (!selectedGroup || !groupName.trim()) return;
    await renameGroup({ groupId: selectedGroup.id, name: groupName.trim() });
    setGroupName("");
  };

  return (
    <div className="container">
      <div className="level mb-5">
        <div>
          <h1 className="title is-3">Administration</h1>
        </div>
        <button type="button" className="button" onClick={groupsResult.refresh}>
          Refresh
        </button>
      </div>

      {mutationError && <div className="notification is-danger">{mutationError.message}</div>}

      <div className="columns is-variable is-5">
        <div className="column is-one-third">
          <div className="box">
            <h2 className="title is-5">Create group</h2>
            <div className="field">
              <label className="label" htmlFor="group-name">
                Name
              </label>
              <div className="control">
                <input
                  id="group-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="group-description">
                Description
              </label>
              <div className="control">
                <textarea
                  id="group-description"
                  className="textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="button is-success"
              onClick={() => void create()}
              disabled={createState.loading}
            >
              Create group
            </button>
          </div>

          <nav className="panel" aria-label="Access groups">
            <p className="panel-heading">Groups</p>
            {groupsResult.data.groups.length === 0 && (
              <div className="panel-block">No groups yet</div>
            )}
            {groupsResult.data.groups.map((group) => (
              <button
                type="button"
                className={`panel-block ${group.id === selectedGroupId ? "is-active" : ""}`}
                key={group.id}
                onClick={() => {
                  setPendingMembers(new Set());
                  setSelectedGroupId(group.id);
                }}
              >
                <span>{group.name}</span>
                {group.archivedAt && <span className="tag ml-auto">Archived</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="column">
          {!selectedGroup && <div className="box">Select a group to manage its members.</div>}
          {selectedGroup && (
            <div className="box">
              <div className="level">
                <div>
                  <h2 className="title is-4 mb-1">{selectedGroup.name}</h2>
                  <p>{selectedGroup.description || "No description"}</p>
                  {membersResult.status === "ready" && (
                    <p className="help">
                      {membersResult.data.subjects.length}{" "}
                      {membersResult.data.subjects.length === 1 ? "member" : "members"}
                    </p>
                  )}
                </div>
                {!selectedGroup.archivedAt && (
                  <button
                    type="button"
                    className="button is-danger is-light"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Archive "${selectedGroup.name}"? Archived groups can no longer be renamed or granted incident access.`,
                        )
                      ) {
                        void archiveGroup({ groupId: selectedGroup.id });
                      }
                    }}
                    disabled={archiveState.loading}
                  >
                    Archive
                  </button>
                )}
              </div>

              {selectedGroup.archivedAt && (
                <div className="notification is-warning is-light">
                  This group is archived and read-only. Membership can no longer be changed.
                </div>
              )}

              {!selectedGroup.archivedAt && (
                <div className="field has-addons mt-5">
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
                        disabled={Boolean(selectedGroup.archivedAt)}
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
                            <th>Email</th>
                            <th>Subject</th>
                            <th aria-label="Actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((user) => (
                            <tr key={user.sub}>
                              <td>{user.name || "Unnamed user"}</td>
                              <td>{user.email}</td>
                              <td>
                                <code>{user.sub}</code>
                              </td>
                              <td className="has-text-right">
                                <button
                                  type="button"
                                  className={`button is-small ${selectedMembers.has(user.sub) ? "is-danger" : "is-success"}`}
                                  onClick={() => {
                                    if (selectedMembers.has(user.sub)) {
                                      setPendingRemovals((pending) =>
                                        new Set(pending).add(user.sub),
                                      );
                                      void removeMember({
                                        groupId: selectedGroup.id,
                                        subject: user.sub,
                                      })
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
                                    void addMember({
                                      groupId: selectedGroup.id,
                                      subject: user.sub,
                                    })
                                      .catch(() => {
                                        setPendingMembers((pending) => {
                                          const remaining = new Set(pending);
                                          remaining.delete(user.sub);
                                          return remaining;
                                        });
                                      })
                                      .then(() => {
                                        setPendingMembers((pending) => {
                                          const remaining = new Set(pending);
                                          remaining.delete(user.sub);
                                          return remaining;
                                        });
                                      });
                                  }}
                                  disabled={
                                    Boolean(selectedGroup.archivedAt) ||
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Administration;
