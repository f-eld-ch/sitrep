import { Spinner } from "components";
import { useState } from "react";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import {
  useAccessGroups,
  useAccessUsers,
  useChangeIncidentAccessMode,
  useGrantIncidentRole,
  useIncidentAccess,
  useIncidentAccessMode,
  useIncidentDetails,
  useRevokeIncidentRole,
} from "api";
import { IncidentForm } from "./New";

function Editor() {
  const { incidentId } = useParams();
  const { t } = useTranslation();

  const result = useIncidentDetails(incidentId);
  const modeResult = useIncidentAccessMode(incidentId);
  const accessResult = useIncidentAccess(incidentId);
  const usersResult = useAccessUsers();
  const groupsResult = useAccessGroups();
  const [changeMode, modeState] = useChangeIncidentAccessMode();
  const [grantRole, grantState] = useGrantIncidentRole();
  const [revokeRole, revokeState] = useRevokeIncidentRole();
  const [principalKind, setPrincipalKind] = useState<"USER" | "GROUP">("USER");
  const [principalId, setPrincipalId] = useState("");
  const [role, setRole] = useState<"OWNER" | "MANAGER" | "EDITOR" | "VIEWER">("VIEWER");

  if (result.status === "error") {
    return <div className="notification is-danger">{t(`errors.${result.error.code}`)}</div>;
  }

  if (result.status === "loading") return <Spinner />;

  return (
    <>
      <h3 className="title is-size-3 is-capitalized">{t("editIncident")}</h3>
      {modeResult.status === "ready" && incidentId && (
        <div className="box">
          <div className="level">
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
          {modeState.error && (
            <div className="notification is-danger">{modeState.error.message}</div>
          )}
        </div>
      )}
      {incidentId && (
        <IncidentAccessPanel
          incidentId={incidentId}
          accessResult={accessResult}
          usersResult={usersResult}
          groupsResult={groupsResult}
          principalKind={principalKind}
          setPrincipalKind={setPrincipalKind}
          principalId={principalId}
          setPrincipalId={setPrincipalId}
          role={role}
          setRole={setRole}
          grantRole={grantRole}
          grantState={grantState}
          revokeRole={revokeRole}
          revokeState={revokeState}
        />
      )}
      <div className="box">
        <IncidentForm incident={result.data.incident} />
      </div>
    </>
  );
}

function IncidentAccessPanel({
  incidentId,
  accessResult,
  usersResult,
  groupsResult,
  principalKind,
  setPrincipalKind,
  principalId,
  setPrincipalId,
  role,
  setRole,
  grantRole,
  grantState,
  revokeRole,
  revokeState,
}: any) {
  const principals =
    principalKind === "USER"
      ? usersResult.status === "ready"
        ? usersResult.data.users.map((user: any) => ({
            id: user.sub,
            label: `${user.name || "Unnamed user"} (${user.email})`,
          }))
        : []
      : groupsResult.status === "ready"
        ? groupsResult.data.groups
            .filter((group: any) => !group.archivedAt)
            .map((group: any) => ({ id: group.id, label: group.name }))
        : [];

  return (
    <div className="box">
      <h4 className="title is-5">Incident access</h4>
      {accessResult.status === "error" && (
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
                    setPrincipalKind(event.target.value);
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
                  {principals.map((principal: any) => (
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
                  onChange={(event) => setRole(event.target.value)}
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
          <table className="table is-fullwidth">
            <thead>
              <tr>
                <th>Principal</th>
                <th>Role</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {accessResult.data.grants.map((grant: any) => (
                <tr key={`${grant.principalKind}-${grant.principalId}-${grant.role}`}>
                  <td>
                    {grant.principalKind === "GROUP"
                      ? groupsResult.status === "ready"
                        ? groupsResult.data.groups.find(
                            (group: any) => group.id === grant.principalId,
                          )?.name || grant.principalName
                        : grant.principalName
                      : usersResult.status === "ready"
                        ? usersResult.data.users.find((user: any) => user.sub === grant.principalId)
                            ?.name || grant.principalName
                        : grant.principalName}{" "}
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
                      onClick={() => void revokeRole({ incidentId, ...grant })}
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
        </>
      )}
    </div>
  );
}

export default Editor;
