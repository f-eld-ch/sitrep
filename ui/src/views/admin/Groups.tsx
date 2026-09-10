import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import classNames from "classnames";
import { useAccessGroups, useCreateAccessGroup } from "api";
import { Spinner } from "components";
import { Button, Notification, Tag } from "components/ui";
import { useRedirectIfForbidden } from "utils";

function Groups() {
  const { t } = useTranslation();
  const groupsResult = useAccessGroups();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [createGroup, createState] = useCreateAccessGroup();

  useRedirectIfForbidden(groupsResult.status === "error" ? groupsResult.error : undefined);

  if (groupsResult.status === "loading") return <Spinner />;
  if (groupsResult.status === "error") {
    if (groupsResult.error.code === "FORBIDDEN") return null;
    return <Notification variant="danger">{groupsResult.error.message}</Notification>;
  }

  const create = async () => {
    if (!name.trim()) return;
    const result = await createGroup({ name: name.trim(), description: description.trim() });
    setName("");
    setDescription("");
    setShowCreate(false);
    void navigate(`${result.groupId}`);
  };

  const cancelCreate = () => {
    setShowCreate(false);
    setName("");
    setDescription("");
  };

  const activeGroups = groupsResult.data.groups.filter((g) => !g.archivedAt);
  const archivedGroups = groupsResult.data.groups.filter((g) => g.archivedAt);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">{t("adminGroups.title")}</h2>
        {!showCreate && (
          <Button type="button" variant="primary" size="md" onClick={() => setShowCreate(true)}>
            {t("adminGroups.newGroup")}
          </Button>
        )}
      </div>

      {createState.error && (
        <Notification variant="danger" className="mb-4">
          {createState.error.message}
        </Notification>
      )}

      {showCreate && (
        <div className="bg-bg-elevated border border-border rounded-lg p-5 mb-5 shadow-sm">
          <h3 className="text-base font-bold mb-3">{t("adminGroups.newGroup")}</h3>

          <div className="mb-4">
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="group-name">
              {t("adminGroups.name")}
            </label>
            <input
              id="group-name"
              className={classNames(
                "w-full rounded border px-3 py-1.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary",
                name.length === 64 ? "border-danger" : "border-border",
              )}
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
                if (e.key === "Escape") cancelCreate();
              }}
            />
            {name.length >= 54 && (
              <p className={classNames("text-xs mt-1", name.length === 64 ? "text-danger" : "text-warning")}>
                {64 - name.length} / 64
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-fg mb-1" htmlFor="group-description">
              {t("adminGroups.description")}
            </label>
            <textarea
              id="group-description"
              className="w-full rounded border border-border px-3 py-1.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="success"
              size="md"
              onClick={() => void create()}
              disabled={createState.loading || !name.trim()}
            >
              {t("adminGroups.create")}
            </Button>
            <Button type="button" variant="light" size="md" onClick={cancelCreate}>
              {t("adminGroups.cancel")}
            </Button>
          </div>
        </div>
      )}

      {activeGroups.length === 0 ? (
        <p className="text-fg-muted">{t("adminGroups.noGroupsYet")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 font-semibold text-fg">Name</th>
                <th className="pb-2 font-semibold text-fg">Description</th>
              </tr>
            </thead>
            <tbody>
              {activeGroups.map((group) => (
                <tr key={group.id} className="border-b border-border hover:bg-bg-subtle">
                  <td className="py-2">
                    <Link to={group.id}>{group.name}</Link>
                  </td>
                  <td className="py-2 text-fg-muted">{group.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archivedGroups.length > 0 && (
        <div className="mt-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-fg-muted px-0"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "▾" : "▸"}&ensp;
            {t("adminGroups.archived", { count: archivedGroups.length })}
          </Button>
          {showArchived && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <tbody>
                  {archivedGroups.map((group) => (
                    <tr key={group.id} className="border-b border-border text-fg-muted">
                      <td className="py-2">
                        <Link to={group.id} className="text-fg-muted">
                          {group.name}
                        </Link>
                      </td>
                      <td className="py-2">{group.description || "—"}</td>
                      <td className="py-2 text-right">
                        <Tag size="sm">{t("adminGroups.archivedTag")}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default Groups;
