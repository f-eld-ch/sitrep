import { useState } from "react";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  useAccessGroups,
  useAccessUsers,
  useChangeIncidentAccessMode,
  useGrantIncidentRole,
  useIncidentAccess,
  useIncidentAccessMode,
  useRevokeIncidentRole,
} from "api";
import { useRedirectIfForbidden } from "utils";
import type { AccessPrincipalKind, IncidentRole } from "types";

interface Principal {
  id: string;
  label: string;
}

/** RBAC section of the incident editor: access mode toggle and per-principal grants. */
function IncidentAccessSection({ incidentId }: { incidentId: string }) {
  const modeResult = useIncidentAccessMode(incidentId);
  const accessResult = useIncidentAccess(incidentId);
  const usersResult = useAccessUsers();
  const groupsResult = useAccessGroups();
  const [changeMode, modeState] = useChangeIncidentAccessMode();
  const [grantRole, grantState] = useGrantIncidentRole();
  const [revokeRole, revokeState] = useRevokeIncidentRole();
  const [principalKind, setPrincipalKind] = useState<AccessPrincipalKind>("USER");
  const [principalId, setPrincipalId] = useState("");
  const [role, setRole] = useState<IncidentRole>("VIEWER");

  useRedirectIfForbidden(accessResult.status === "error" ? accessResult.error : undefined);

  const principals: Principal[] =
    principalKind === "USER"
      ? usersResult.status === "ready"
        ? usersResult.data.users.map((user) => ({
            id: user.sub,
            label: `${user.name || "Unnamed user"} (${user.email})`,
          }))
        : []
      : groupsResult.status === "ready"
        ? groupsResult.data.groups
            .filter((group) => !group.archivedAt)
            .map((group) => ({ id: group.id, label: group.name }))
        : [];

  const principalName = (kind: AccessPrincipalKind, id: string, fallback: string): string => {
    if (kind === "GROUP") {
      return groupsResult.status === "ready"
        ? (groupsResult.data.groups.find((group) => group.id === id)?.name ?? fallback)
        : fallback;
    }

    return usersResult.status === "ready"
      ? (usersResult.data.users.find((user) => user.sub === id)?.name ?? fallback)
      : fallback;
  };

  return (
    <>
      {modeResult.status === "ready" && (
        <div className="box">
          <div className="level mb-2">
            <div>
              <p className="heading">Access mode</p>
              <p className="title is-5">
                {modeResult.data.mode === "RESTRICTED" ? "Restricted" : "Open operational"}
              </p>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={modeResult.data.mode === "RESTRICTED"}
                disabled={modeState.loading}
                onChange={() => {
                  const nextMode =
                    modeResult.data.mode === "RESTRICTED" ? "OPEN_OPERATIONAL" : "RESTRICTED";
                  if (
                    nextMode === "RESTRICTED" &&
                    !window.confirm(
                      "Restrict this incident? Users without an explicit grant will lose access.",
                    )
                  )
                    return;
                  void changeMode({ incidentId, mode: nextMode }).then(modeResult.refresh);
                }}
              />{" "}
              Restrict incident
            </label>
          </div>
          <p className="help">
            {modeResult.data.mode === "RESTRICTED"
              ? "Only the principals granted below can view or edit this incident."
              : "Every authenticated user can view and edit this incident. Grants below only control who can manage access."}
          </p>
          {modeState.error && (
            <div className="notification is-danger mt-3">{modeState.error.message}</div>
          )}
        </div>
      )}

      <div className="box">
        <h4 className="title is-5">Incident access</h4>
        {accessResult.status === "error" && accessResult.error.code !== "FORBIDDEN" && (
          <div className="notification is-danger">{accessResult.error.message}</div>
        )}
        {accessResult.status === "ready" && (
          <>
            <div className="columns is-variable is-2">
              <div className="column">
                <label className="label" htmlFor="access-principal-kind">
                  Principal
                </label>
                <div className="select is-fullwidth">
                  <select
                    id="access-principal-kind"
                    value={principalKind}
                    onChange={(event) => {
                      setPrincipalKind(event.target.value as AccessPrincipalKind);
                      setPrincipalId("");
                    }}
                  >
                    <option value="USER">User</option>
                    <option value="GROUP">Group</option>
                  </select>
                </div>
              </div>
              <div className="column is-two-fifths">
                <label className="label" htmlFor="access-principal">
                  Name
                </label>
                <div className="select is-fullwidth">
                  <select
                    id="access-principal"
                    value={principalId}
                    onChange={(event) => setPrincipalId(event.target.value)}
                  >
                    <option value="">Select a principal</option>
                    {principals.map((principal) => (
                      <option key={principal.id} value={principal.id}>
                        {principal.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="column">
                <label className="label" htmlFor="access-role">
                  Role
                </label>
                <div className="select is-fullwidth">
                  <select
                    id="access-role"
                    value={role}
                    onChange={(event) => setRole(event.target.value as IncidentRole)}
                  >
                    <option value="VIEWER">Viewer</option>
                    <option value="EDITOR">Editor</option>
                    <option value="MANAGER">Manager</option>
                    <option value="OWNER">Owner</option>
                  </select>
                </div>
              </div>
              <div className="column is-narrow is-flex is-align-items-flex-end">
                <button
                  type="button"
                  className="button is-primary"
                  disabled={!principalId || grantState.loading}
                  onClick={() => void grantRole({ incidentId, principalKind, principalId, role })}
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
            {accessResult.data.grants.length === 0 ? (
              <p className="has-text-grey">No explicit grants yet.</p>
            ) : (
              <table className="table is-fullwidth">
                <thead>
                  <tr>
                    <th>Principal</th>
                    <th>Role</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {accessResult.data.grants.map((grant) => (
                    <tr key={`${grant.principalKind}-${grant.principalId}-${grant.role}`}>
                      <td>
                        {principalName(grant.principalKind, grant.principalId, grant.principalName)}{" "}
                        ({grant.principalKind === "GROUP" ? "Group" : "User"})
                        <br />
                        <small>{grant.principalId}</small>
                      </td>
                      <td>{grant.role}</td>
                      <td className="has-text-right">
                        <button
                          type="button"
                          className="button is-small is-danger is-light"
                          disabled={revokeState.loading}
                          onClick={() => void revokeRole(grant)}
                        >
                          {revokeState.loading ? (
                            <>
                              <FontAwesomeIcon icon={faSpinner} spin /> Revoking
                            </>
                          ) : (
                            "Revoke"
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default IncidentAccessSection;
