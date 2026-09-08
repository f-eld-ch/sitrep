import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAccessGroups, useCreateAccessGroup } from "api";
import { Spinner } from "components";
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
    return <div className="notification is-danger">{groupsResult.error.message}</div>;
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
      <div className="level mb-4">
        <div className="level-left">
          <h2 className="title is-4 mb-0">{t("adminGroups.title")}</h2>
        </div>
        <div className="level-right">
          {!showCreate && (
            <button
              type="button"
              className="button is-primary"
              onClick={() => setShowCreate(true)}
            >
              {t("adminGroups.newGroup")}
            </button>
          )}
        </div>
      </div>

      {createState.error && (
        <div className="notification is-danger">{createState.error.message}</div>
      )}

      {showCreate && (
        <div className="box mb-5">
          <h3 className="title is-6 mb-3">{t("adminGroups.newGroup")}</h3>
          <div className="field">
            <label className="label" htmlFor="group-name">
              {t("adminGroups.name")}
            </label>
            <div className="control">
              <input
                id="group-name"
                className={`input${name.length === 64 ? " is-danger" : ""}`}
                maxLength={64}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                  if (e.key === "Escape") cancelCreate();
                }}
              />
            </div>
            {name.length >= 54 && (
              <p className={`help${name.length === 64 ? " is-danger" : " is-warning"}`}>
                {64 - name.length} / 64
              </p>
            )}
          </div>
          <div className="field">
            <label className="label" htmlFor="group-description">
              {t("adminGroups.description")}
            </label>
            <div className="control">
              <textarea
                id="group-description"
                className="textarea"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="field is-grouped">
            <div className="control">
              <button
                type="button"
                className="button is-success"
                onClick={() => void create()}
                disabled={createState.loading || !name.trim()}
              >
                {t("adminGroups.create")}
              </button>
            </div>
            <div className="control">
              <button type="button" className="button is-light" onClick={cancelCreate}>
                {t("adminGroups.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeGroups.length === 0 ? (
        <p className="has-text-grey">{t("adminGroups.noGroupsYet")}</p>
      ) : (
        <div className="table-container">
          <table className="table is-fullwidth is-hoverable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {activeGroups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <Link to={group.id}>{group.name}</Link>
                  </td>
                  <td className="has-text-grey">{group.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {archivedGroups.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            className="button is-ghost is-small has-text-grey px-0"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "▾" : "▸"}&ensp;{t("adminGroups.archived", { count: archivedGroups.length })}
          </button>
          {showArchived && (
            <div className="table-container mt-2">
              <table className="table is-fullwidth">
                <tbody>
                  {archivedGroups.map((group) => (
                    <tr key={group.id} className="has-text-grey">
                      <td>
                        <Link to={group.id} className="has-text-grey">
                          {group.name}
                        </Link>
                      </td>
                      <td>{group.description || "—"}</td>
                      <td className="has-text-right">
                        <span className="tag">{t("adminGroups.archivedTag")}</span>
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
