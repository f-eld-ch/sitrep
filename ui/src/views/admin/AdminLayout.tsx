import { NavLink, Outlet } from "react-router";
import { useGlobalRoles } from "api";

/** Two-column admin shell: a left-hand section menu plus the routed section content. */
function AdminLayout() {
  // Only reveal the link if the query actually succeeds — same signal the server uses to authorize it.
  const globalRolesResult = useGlobalRoles();

  return (
    <div className="container">
      <h1 className="title is-3 mb-5">Administration</h1>
      <div className="columns is-variable is-5">
        <div className="column is-2">
          <aside className="menu">
            <p className="menu-label">Access control</p>
            <ul className="menu-list">
              <li>
                <NavLink to="groups" className={({ isActive }) => (isActive ? "is-active" : "")}>
                  Groups
                </NavLink>
              </li>
              {globalRolesResult.status === "ready" && (
                <li>
                  <NavLink
                    to="global-roles"
                    className={({ isActive }) => (isActive ? "is-active" : "")}
                  >
                    Global roles
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
