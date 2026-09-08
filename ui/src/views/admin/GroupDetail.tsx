import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faEdit, faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  useUpdateAccessGroupDescription,
} from "api";
import { Spinner } from "components";
import { useRedirectIfForbidden } from "utils";

function GroupDetail() {
  const { t } = useTranslation();
  const { groupId } = useParams();
  const navigate = useNavigate();
  const groupsResult = useAccessGroups();
  const usersResult = useAccessUsers();
  const membersResult = useGroupMembers(groupId);

  const [addFilter, setAddFilter] = useState("");
  const [pendingMembers, setPendingMembers] = useState<Set<string>>(new Set());
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState("");
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const [renameGroup, renameState] = useRenameAccessGroup();
  const [updateDescription, updateDescriptionState] = useUpdateAccessGroupDescription();
  const [archiveGroup, archiveState] = useArchiveAccessGroup();
  const [addMember, addMemberState] = useAddGroupMember();
  const [removeMember, removeMemberState] = useRemoveGroupMember();

  useRedirectIfForbidden(groupsResult.status === "error" ? groupsResult.error : undefined);

  if (groupsResult.status === "loading") return <Spinner />;
  if (groupsResult.status === "error") {
    if (groupsResult.error.code === "FORBIDDEN") return null;
    return <div className="notification is-danger">{groupsResult.error.message}</div>;
  }

  const group = groupsResult.data.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    return <div className="notification is-warning">{t("adminGroupDetail.groupNotFound")}</div>;
  }

  const isArchived = Boolean(group.archivedAt);
  const canManage = !isArchived;

  const memberSubs =
    membersResult.status === "ready" ? new Set(membersResult.data.subjects) : new Set<string>();
  const allUsers = usersResult.status === "ready" ? usersResult.data.users : [];
  const userBySub = new Map(allUsers.map((u) => [u.sub, u]));

  const currentMembers =
    membersResult.status === "ready"
      ? membersResult.data.subjects.map((sub) => userBySub.get(sub) ?? { sub, name: sub, email: "" })
      : [];

  const addQuery = addFilter.trim().toLowerCase();
  const addableUsers = allUsers.filter((u) => {
    if (memberSubs.has(u.sub)) return false;
    if (!addQuery) return true;
    return (
      u.name.toLowerCase().includes(addQuery) ||
      u.email.toLowerCase().includes(addQuery) ||
      u.sub.toLowerCase().includes(addQuery)
    );
  });

  const mutationError =
    renameState.error ??
    updateDescriptionState.error ??
    archiveState.error ??
    addMemberState.error ??
    removeMemberState.error;

  const startEditDescription = () => {
    setDescriptionValue(group.description);
    setIsEditingDescription(true);
  };

  const commitDescription = async () => {
    if (descriptionValue === group.description) {
      setIsEditingDescription(false);
      return;
    }
    await updateDescription({ groupId: group.id, description: descriptionValue });
    setIsEditingDescription(false);
  };

  const startRename = () => {
    setRenameValue(group.name);
    setIsRenaming(true);
  };

  const commitRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === group.name) {
      setIsRenaming(false);
      return;
    }
    await renameGroup({ groupId: group.id, name: renameValue.trim() });
    setIsRenaming(false);
  };

  const doAdd = (sub: string) => {
    if (pendingMembers.has(sub)) return;
    setPendingMembers((prev) => new Set(prev).add(sub));
    void addMember({ groupId: group.id, subject: sub })
      .catch(() => undefined)
      .finally(() => {
        setPendingMembers((prev) => {
          const next = new Set(prev);
          next.delete(sub);
          return next;
        });
      });
  };

  const doRemove = (sub: string) => {
    if (pendingRemovals.has(sub)) return;
    setPendingRemovals((prev) => new Set(prev).add(sub));
    void removeMember({ groupId: group.id, subject: sub })
      .catch(() => undefined)
      .finally(() => {
        setPendingRemovals((prev) => {
          const next = new Set(prev);
          next.delete(sub);
          return next;
        });
      });
  };

  return (
    <>
      {/* Header */}
      <div className="mb-4">
        {isRenaming ? (
          <div className="field has-addons mb-1">
            <div className="control is-expanded">
              <input
                className="input"
                placeholder={t("adminGroupDetail.groupNamePlaceholder")}
                autoFocus
                maxLength={64}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setIsRenaming(false);
                }}
              />
            </div>
            <div className="control">
              <button
                type="button"
                className="button is-primary"
                onClick={() => void commitRename()}
                disabled={renameState.loading}
              >
                {renameState.loading ? <FontAwesomeIcon icon={faSpinner} spin /> : t("adminGroupDetail.save")}
              </button>
            </div>
            <div className="control">
              <button
                type="button"
                className="button is-light"
                onClick={() => setIsRenaming(false)}
              >
                {t("adminGroupDetail.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="is-flex is-align-items-center mb-1" style={{ gap: "0.5rem" }}>
            <h2 className="title is-4 mb-0">{group.name}</h2>
            {canManage && (
              <button
                type="button"
                className="button is-ghost is-small has-text-grey"
                onClick={startRename}
                title={t("adminGroupDetail.renameGroup")}
              >
                <FontAwesomeIcon icon={faEdit} />
              </button>
            )}
          </div>
        )}
        {isEditingDescription ? (
          <div className="field has-addons mt-1 mb-1">
            <div className="control is-expanded">
              <input
                className="input is-small"
                placeholder={t("adminGroupDetail.groupDescriptionPlaceholder")}
                autoFocus
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitDescription();
                  if (e.key === "Escape") setIsEditingDescription(false);
                }}
              />
            </div>
            <div className="control">
              <button
                type="button"
                className="button is-small is-primary"
                onClick={() => void commitDescription()}
                disabled={updateDescriptionState.loading}
              >
                {updateDescriptionState.loading ? (
                  <FontAwesomeIcon icon={faSpinner} spin />
                ) : (
                  t("adminGroupDetail.save")
                )}
              </button>
            </div>
            <div className="control">
              <button
                type="button"
                className="button is-small is-light"
                onClick={() => setIsEditingDescription(false)}
              >
                {t("adminGroupDetail.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="is-flex is-align-items-center mt-1" style={{ gap: "0.4rem" }}>
            <p className="has-text-grey">
              {group.description || (canManage ? t("adminGroupDetail.noDescriptionClick") : "")}
            </p>
            {canManage && (
              <button
                type="button"
                className="button is-ghost is-small has-text-grey"
                onClick={startEditDescription}
                title={t("adminGroupDetail.editDescription")}
              >
                <FontAwesomeIcon icon={faEdit} />
              </button>
            )}
          </div>
        )}
        {membersResult.status === "ready" && (
          <p className="help mt-1">
            {t("adminGroupDetail.memberCount", { count: membersResult.data.subjects.length })}
          </p>
        )}
      </div>

      {mutationError && <div className="notification is-danger">{mutationError.message}</div>}

      {isArchived && (
        <div className="notification is-warning is-light">
          {t("adminGroupDetail.groupArchived")}
        </div>
      )}

      {/* Archive action */}
      {canManage && (
        <div className="mb-5">
          {confirmingArchive ? (
            <div className="is-flex is-align-items-center" style={{ gap: "0.5rem" }}>
              <span className="has-text-grey is-size-7">
                {t("adminGroupDetail.archiveConfirm")}
              </span>
              <button
                type="button"
                className="button is-danger is-small"
                disabled={archiveState.loading}
                onClick={() => {
                  void archiveGroup({ groupId: group.id }).then(() =>
                    navigate("/admin/access/groups"),
                  );
                }}
              >
                {archiveState.loading ? <FontAwesomeIcon icon={faSpinner} spin /> : t("adminGroupDetail.confirmArchive")}
              </button>
              <button
                type="button"
                className="button is-small is-light"
                onClick={() => setConfirmingArchive(false)}
              >
                {t("adminGroupDetail.cancel")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="button is-danger is-light is-small"
              onClick={() => setConfirmingArchive(true)}
            >
              {t("adminGroupDetail.archiveGroup")}
            </button>
          )}
        </div>
      )}

      {/* Current members */}
      <h3 className="title is-5 mt-5 mb-3">{t("adminGroupDetail.members")}</h3>
      {membersResult.status === "loading" && <Spinner />}
      {membersResult.status === "error" && (
        <div className="notification is-danger">{membersResult.error.message}</div>
      )}
      {membersResult.status === "ready" && currentMembers.length === 0 && (
        <p className="has-text-grey mb-5">{t("adminGroupDetail.noMembersYet")}</p>
      )}
      {membersResult.status === "ready" && currentMembers.length > 0 && (
        <div className="table-container mb-5">
          <table className="table is-fullwidth">
            <tbody>
              {currentMembers.map((user) => (
                <tr key={user.sub}>
                  <td>
                    <span title={user.sub}>{user.name || user.email || user.sub}</span>
                    {user.email && user.name && (
                      <span className="has-text-grey ml-2 is-size-7">{user.email}</span>
                    )}
                  </td>
                  <td className="has-text-right" style={{ width: "3rem" }}>
                    {canManage && (
                      <button
                        type="button"
                        className="button is-ghost is-small has-text-danger"
                        disabled={pendingRemovals.has(user.sub)}
                        onClick={() => doRemove(user.sub)}
                        title={t("adminGroupDetail.removeFromGroup")}
                      >
                        {pendingRemovals.has(user.sub) ? (
                          <FontAwesomeIcon icon={faSpinner} spin />
                        ) : (
                          <FontAwesomeIcon icon={faTrash} />
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add members */}
      {canManage && membersResult.status === "ready" && (
        <>
          <h3 className="title is-5 mb-3">{t("adminGroupDetail.addMembers")}</h3>
          <div className="field mb-3">
            <div className="control">
              <input
                className="input"
                placeholder={t("adminGroupDetail.searchMembersPlaceholder")}
                value={addFilter}
                onChange={(e) => setAddFilter(e.target.value)}
              />
            </div>
          </div>
          {usersResult.status === "loading" && <Spinner />}
          {usersResult.status === "error" && (
            <div className="notification is-danger">{usersResult.error.message}</div>
          )}
          {usersResult.status === "ready" && addableUsers.length === 0 && addQuery && (
            <p className="has-text-grey">{t("adminGroupDetail.noUsersMatch")}</p>
          )}
          {usersResult.status === "ready" && addableUsers.length === 0 && !addQuery && (
            <p className="has-text-grey">{t("adminGroupDetail.allUsersMembers")}</p>
          )}
          {usersResult.status === "ready" && addableUsers.length > 0 && (
            <div className="table-container">
              <table className="table is-fullwidth is-hoverable">
                <tbody>
                  {addableUsers.map((user) => (
                    <tr key={user.sub}>
                      <td>
                        <span title={user.sub}>{user.name || user.email || user.sub}</span>
                        {user.email && user.name && (
                          <span className="has-text-grey ml-2 is-size-7">{user.email}</span>
                        )}
                      </td>
                      <td className="has-text-right" style={{ width: "5rem" }}>
                        <button
                          type="button"
                          className="button is-success is-small"
                          disabled={pendingMembers.has(user.sub)}
                          onClick={() => doAdd(user.sub)}
                        >
                          {pendingMembers.has(user.sub) ? (
                            <FontAwesomeIcon icon={faSpinner} spin />
                          ) : (
                            t("adminGroupDetail.add")
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
