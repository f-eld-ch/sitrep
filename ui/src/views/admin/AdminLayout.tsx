import { NavLink, Outlet, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useAccessGroups, useGlobalRoles } from "api";
import { PageTitle } from "components/ui";

/** Two-column admin shell: a left-hand section menu plus the routed section content. */
function AdminLayout() {
  const { t } = useTranslation();
  const groupsResult = useAccessGroups();
  const globalRolesResult = useGlobalRoles();
  const { groupId } = useParams();

  const activeGroups =
    groupsResult.status === "ready" ? groupsResult.data.groups.filter((g) => !g.archivedAt) : [];

  const linkClass =
    "flex items-center px-3 py-1.5 rounded text-sm text-fg hover:bg-bg-subtle transition-colors";
  const activeLinkClass = "flex items-center px-3 py-1.5 rounded text-sm bg-primary text-white";

  return (
    <div className="mx-auto max-w-7xl px-4">
      <PageTitle>{t("adminLayout.title")}</PageTitle>
      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        <aside className="md:w-48 md:shrink-0">
          <p className="text-xs uppercase tracking-wider font-semibold text-fg-muted mb-2">
            {t("adminLayout.accessControl")}
          </p>
          <ul className="flex flex-row flex-wrap gap-1 md:flex-col md:gap-0 md:space-y-0.5">
            <li>
              <NavLink
                to="groups"
                end
                className={({ isActive }) => (isActive ? activeLinkClass : linkClass)}
              >
                {t("adminLayout.groups")}
              </NavLink>
              {groupsResult.status === "ready" && activeGroups.length > 0 && (
                <ul className="hidden md:block ml-3 mt-0.5 space-y-0.5">
                  {activeGroups.map((group) => (
                    <li key={group.id}>
                      <NavLink
                        to={`groups/${group.id}`}
                        className={group.id === groupId ? activeLinkClass : linkClass}
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
                  className={({ isActive }) => (isActive ? activeLinkClass : linkClass)}
                >
                  {t("adminLayout.globalRoles")}
                </NavLink>
              </li>
            )}
          </ul>
        </aside>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;
