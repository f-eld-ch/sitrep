import { useState } from "react";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAccessUsers, useGlobalRoles, useGrantGlobalRole, useRevokeGlobalRole } from "api";
import { Spinner } from "components";
import { useRedirectIfForbidden } from "utils";
import type { GlobalRole } from "types";

function GlobalRoles() {
  const rolesResult = useGlobalRoles();
  const usersResult = useAccessUsers();
  const [subject, setSubject] = useState("");
  const [role, setRole] = useState<GlobalRole>("GROUP_ADMIN");
  const [grantRole, grantState] = useGrantGlobalRole();
  const [revokeRole, revokeState] = useRevokeGlobalRole();
  const [pendingRevokes, setPendingRevokes] = useState<Set<string>>(new Set());

  useRedirectIfForbidden(rolesResult.status === "error" ? rolesResult.error : undefined);

  if (rolesResult.status === "loading") return <Spinner />;
  if (rolesResult.status === "error") {
    if (rolesResult.error.code === "FORBIDDEN") return null;
    return <div className="notification is-danger">{rolesResult.error.message}</div>;
  }

  const grant = async () => {
    if (!subject) return;
    await grantRole({ subject, role });
    setSubject("");
  };

  const revoke = (grantSubject: string, grantRoleValue: GlobalRole) => {
    const key = `${grantSubject}:${grantRoleValue}`;
    if (
      !window.confirm(
        "Revoke this global role? The user immediately loses the permissions it grants.",
      )
    )
      return;

    setPendingRevokes((pending) => new Set(pending).add(key));
    void revokeRole({ subject: grantSubject, role: grantRoleValue }).finally(() => {
      setPendingRevokes((pending) => {
        const remaining = new Set(pending);
        remaining.delete(key);
        return remaining;
      });
    });
  };

  return (
    <>
      <div className="level mb-5">
        <div>
          <h2 className="title is-4">Global roles</h2>
        </div>
        <button type="button" className="button" onClick={rolesResult.refresh}>
          Refresh
        </button>
      </div>

      {(grantState.error ?? revokeState.error) && (
        <div className="notification is-danger">
          {(grantState.error ?? revokeState.error)?.message}
        </div>
      )}

      <div className="box">
        <h3 className="title is-5">Grant a role</h3>
        <div className="columns is-variable is-2">
          <div className="column is-half">
            <label className="label" htmlFor="global-role-subject">
              User
            </label>
            <div className="select is-fullwidth">
              <select
                id="global-role-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                <option value="">Select a user</option>
                {usersResult.status === "ready" &&
                  usersResult.data.users.map((user) => (
                    <option key={user.sub} value={user.sub}>
                      {user.name || "Unnamed user"} ({user.email})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="column">
            <label className="label" htmlFor="global-role-role">
              Role
            </label>
            <div className="select is-fullwidth">
              <select
                id="global-role-role"
                value={role}
                onChange={(event) => setRole(event.target.value as GlobalRole)}
              >
                <option value="GROUP_ADMIN">Group admin</option>
                <option value="SYSTEM_ADMIN">System admin</option>
              </select>
            </div>
          </div>
          <div className="column is-narrow is-flex is-align-items-flex-end">
            <button
              type="button"
              className="button is-primary"
              disabled={!subject || grantState.loading}
              onClick={() => void grant()}
            >
              {grantState.loading ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Granting
                </>
              ) : (
                "Grant"
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="box">
        <h3 className="title is-5">Current holders</h3>
        {rolesResult.data.grants.length === 0 ? (
          <p className="has-text-grey">No global roles granted yet.</p>
        ) : (
          <table className="table is-fullwidth">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rolesResult.data.grants.map((grantRow) => {
                const key = `${grantRow.subject}:${grantRow.role}`;
                return (
                  <tr key={key}>
                    <td>
                      {grantRow.name || "Unnamed user"} ({grantRow.email || grantRow.subject})
                    </td>
                    <td>{grantRow.role === "SYSTEM_ADMIN" ? "System admin" : "Group admin"}</td>
                    <td className="has-text-right">
                      <button
                        type="button"
                        className="button is-small is-danger is-light"
                        disabled={pendingRevokes.has(key)}
                        onClick={() => revoke(grantRow.subject, grantRow.role)}
                      >
                        {pendingRevokes.has(key) ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} spin /> Revoking
                          </>
                        ) : (
                          "Revoke"
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default GlobalRoles;
