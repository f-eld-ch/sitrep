import { NavLink, Outlet, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useAccessGroups, useGlobalRoles } from "api";

/** Two-column admin shell: a left-hand section menu plus the routed section content. */
function AdminLayout() {
  const { t } = useTranslation();
  const groupsResult = useAccessGroups();
  const globalRolesResult = useGlobalRoles();
  const { groupId } = useParams();

  const activeGroups =
    groupsResult.status === "ready" ? groupsResult.data.groups.filter((g) => !g.archivedAt) : [];

  return (
    <div className="container">
      <h1 className="title is-3 mb-5">{t("adminLayout.title")}</h1>
      <div className="columns is-variable is-5">
        <div className="column is-2">
          <aside className="menu">
            <p className="menu-label">{t("adminLayout.accessControl")}</p>
            <ul className="menu-list">
              <li>
                <NavLink
                  to="groups"
                  end
                  className={({ isActive }) => (isActive ? "is-active" : "")}
                >
                  {t("adminLayout.groups")}
                </NavLink>
                {groupsResult.status === "ready" && activeGroups.length > 0 && (
                  <ul>
                    {activeGroups.map((group) => (
                      <li key={group.id}>
                        <NavLink
                          to={`groups/${group.id}`}
                          className={group.id === groupId ? "is-active" : ""}
                          style={{ whiteSpace: "normal", wordBreak: "break-word" }}
                        >
                          {group.name}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
              {globalRolesResult.status === "ready" && (
                <li>
                  <NavLink
                    to="global-roles"
                    className={({ isActive }) => (isActive ? "is-active" : "")}
                  >
                    {t("adminLayout.globalRoles")}
                  </NavLink>
                </li>
              )}
            </ul>
          </aside>
        </div>
        <div className="column">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;
