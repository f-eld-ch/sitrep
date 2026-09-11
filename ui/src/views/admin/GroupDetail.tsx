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
import { Button, Notification } from "components/ui";
import { clsx } from "clsx";
import { useRedirectIfForbidden } from "utils";

const inputBase =
  "w-full rounded border px-3 py-1.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";
const inputSm =
  "w-full rounded border px-2 py-0.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";

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
    return <Notification variant="danger">{groupsResult.error.message}</Notification>;
  }

  const group = groupsResult.data.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    return <Notification variant="warning">{t("adminGroupDetail.groupNotFound")}</Notification>;
  }

  const isArchived = Boolean(group.archivedAt);
  const canManage = !isArchived;

  const memberSubs =
    membersResult.status === "ready" ? new Set(membersResult.data.subjects) : new Set<string>();
  const allUsers = usersResult.status === "ready" ? usersResult.data.users : [];
  const userBySub = new Map(allUsers.map((u) => [u.sub, u]));

  const currentMembers =
    membersResult.status === "ready"
      ? membersResult.data.subjects.map(
          (sub) => userBySub.get(sub) ?? { sub, name: sub, email: "" },
        )
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
          <div className="mb-1 flex gap-2">
            <div className="flex-1">
              <input
                className={clsx(
                  inputBase,
                  renameValue.length === 64 ? "border-danger" : "border-border",
                )}
                placeholder={t("adminGroupDetail.groupNamePlaceholder")}
                maxLength={64}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setIsRenaming(false);
                }}
              />
              {renameValue.length >= 54 && (
                <p
                  className={clsx(
                    "mt-0.5 text-xs",
                    renameValue.length === 64 ? "text-danger" : "text-warning",
                  )}
                >
                  {64 - renameValue.length} / 64
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={() => void commitRename()}
              disabled={renameState.loading}
            >
              {renameState.loading ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                t("adminGroupDetail.save")
              )}
            </Button>
            <Button type="button" variant="light" onClick={() => setIsRenaming(false)}>
              {t("adminGroupDetail.cancel")}
            </Button>
          </div>
        ) : (
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-2xl font-bold">{group.name}</h2>
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-fg-muted"
                onClick={startRename}
                title={t("adminGroupDetail.renameGroup")}
              >
                <FontAwesomeIcon icon={faEdit} />
              </Button>
            )}
          </div>
        )}

        {isEditingDescription ? (
          <div className="mt-1 mb-1 flex gap-2">
            <input
              className={clsx(inputSm, "flex-1 border-border")}
              placeholder={t("adminGroupDetail.groupDescriptionPlaceholder")}
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitDescription();
                if (e.key === "Escape") setIsEditingDescription(false);
              }}
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void commitDescription()}
              disabled={updateDescriptionState.loading}
            >
              {updateDescriptionState.loading ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                t("adminGroupDetail.save")
              )}
            </Button>
            <Button
              type="button"
              variant="light"
              size="sm"
              onClick={() => setIsEditingDescription(false)}
            >
              {t("adminGroupDetail.cancel")}
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-1">
            <p className="text-fg-muted">
              {group.description || (canManage ? t("adminGroupDetail.noDescriptionClick") : "")}
            </p>
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-fg-muted"
                onClick={startEditDescription}
                title={t("adminGroupDetail.editDescription")}
              >
                <FontAwesomeIcon icon={faEdit} />
              </Button>
            )}
          </div>
        )}

        {membersResult.status === "ready" && (
          <p className="mt-1 text-xs text-fg-muted">
            {t("adminGroupDetail.memberCount", { count: membersResult.data.subjects.length })}
          </p>
        )}
      </div>

      {mutationError && (
        <Notification variant="danger" className="mb-4">
          {mutationError.message}
        </Notification>
      )}

      {isArchived && (
        <Notification variant="warning" light className="mb-4">
          {t("adminGroupDetail.groupArchived")}
        </Notification>
      )}

      {/* Archive action */}
      {canManage && (
        <div className="mb-5">
          {confirmingArchive ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg-muted">{t("adminGroupDetail.archiveConfirm")}</span>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={archiveState.loading}
                onClick={() => {
                  void archiveGroup({ groupId: group.id }).then(() =>
                    navigate("/admin/access/groups"),
                  );
                }}
              >
                {archiveState.loading ? (
                  <FontAwesomeIcon icon={faSpinner} spin />
                ) : (
                  t("adminGroupDetail.confirmArchive")
                )}
              </Button>
              <Button
                type="button"
                variant="light"
                size="sm"
                onClick={() => setConfirmingArchive(false)}
              >
                {t("adminGroupDetail.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="danger"
              size="sm"
              light
              onClick={() => setConfirmingArchive(true)}
            >
              {t("adminGroupDetail.archiveGroup")}
            </Button>
          )}
        </div>
      )}

      {/* Current members */}
      <h3 className="mt-5 mb-3 text-xl font-bold">{t("adminGroupDetail.members")}</h3>
      {membersResult.status === "loading" && <Spinner />}
      {membersResult.status === "error" && (
        <Notification variant="danger">{membersResult.error.message}</Notification>
      )}
      {membersResult.status === "ready" && currentMembers.length === 0 && (
        <p className="mb-5 text-fg-muted">{t("adminGroupDetail.noMembersYet")}</p>
      )}
      {membersResult.status === "ready" && currentMembers.length > 0 && (
        <div className="mb-5 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {currentMembers.map((user) => (
                <tr key={user.sub} className="border-b border-border">
                  <td className="py-1.5">
                    <span title={user.sub}>{user.name || user.email || user.sub}</span>
                    {user.email && user.name && (
                      <span className="ml-2 text-xs text-fg-muted">{user.email}</span>
                    )}
                  </td>
                  <td className="w-12 py-1.5 text-right">
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-danger!"
                        disabled={pendingRemovals.has(user.sub)}
                        onClick={() => doRemove(user.sub)}
                        title={t("adminGroupDetail.removeFromGroup")}
                      >
                        {pendingRemovals.has(user.sub) ? (
                          <FontAwesomeIcon icon={faSpinner} spin />
                        ) : (
                          <FontAwesomeIcon icon={faTrash} />
                        )}
                      </Button>
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
          <h3 className="mb-3 text-xl font-bold">{t("adminGroupDetail.addMembers")}</h3>
          <div className="mb-3">
            <input
              className={clsx(inputBase, "border-border")}
              placeholder={t("adminGroupDetail.searchMembersPlaceholder")}
              value={addFilter}
              onChange={(e) => setAddFilter(e.target.value)}
            />
          </div>
          {usersResult.status === "loading" && <Spinner />}
          {usersResult.status === "error" && (
            <Notification variant="danger">{usersResult.error.message}</Notification>
          )}
          {usersResult.status === "ready" && addableUsers.length === 0 && addQuery && (
            <p className="text-fg-muted">{t("adminGroupDetail.noUsersMatch")}</p>
          )}
          {usersResult.status === "ready" && addableUsers.length === 0 && !addQuery && (
            <p className="text-fg-muted">{t("adminGroupDetail.allUsersMembers")}</p>
          )}
          {usersResult.status === "ready" && addableUsers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {addableUsers.map((user) => (
                    <tr key={user.sub} className="border-b border-border hover:bg-bg-subtle">
                      <td className="py-1">
                        <span title={user.sub}>{user.name || user.email || user.sub}</span>
                        {user.email && user.name && (
                          <span className="ml-2 text-xs text-fg-muted">{user.email}</span>
                        )}
                      </td>
                      <td className="w-20 py-1.5 text-right">
                        <Button
                          type="button"
                          variant="success"
                          size="sm"
                          disabled={pendingMembers.has(user.sub)}
                          onClick={() => doAdd(user.sub)}
                        >
                          {pendingMembers.has(user.sub) ? (
                            <FontAwesomeIcon icon={faSpinner} spin />
                          ) : (
                            t("adminGroupDetail.add")
                          )}
                        </Button>
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
