import { useState } from "react";
import { useTranslation } from "react-i18next";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAccessUsers, useGlobalRoles, useGrantGlobalRole, useRevokeGlobalRole } from "api";
import { Spinner } from "components";
import { useRedirectIfForbidden } from "utils";
import type { GlobalRole } from "types";

function GlobalRoles() {
  const { t } = useTranslation();
  const rolesResult = useGlobalRoles();
  const usersResult = useAccessUsers();
  const [subject, setSubject] = useState("");
  const [role, setRole] = useState<GlobalRole>("GROUP_ADMIN");
  const [grantRole, grantState] = useGrantGlobalRole();
  const [revokeRole, revokeState] = useRevokeGlobalRole();
  const [pendingRevokes, setPendingRevokes] = useState<Set<string>>(new Set());
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

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
    setPendingRevokes((pending) => new Set(pending).add(key));
    setConfirmingRevoke(null);
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
      <h2 className="title is-4 mb-5">{t("adminGlobalRoles.title")}</h2>

      {(grantState.error ?? revokeState.error) && (
        <div className="notification is-danger">
          {(grantState.error ?? revokeState.error)?.message}
        </div>
      )}

      <div className="box">
        <h3 className="title is-5">{t("adminGlobalRoles.grantRole")}</h3>
        <div className="columns is-variable is-2">
          <div className="column is-half">
            <label className="label" htmlFor="global-role-subject">
              {t("adminGlobalRoles.userLabel")}
            </label>
            <div className="select is-fullwidth">
              <select
                id="global-role-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                <option value="">{t("adminGlobalRoles.selectUser")}</option>
                {usersResult.status === "ready" &&
                  usersResult.data.users.map((user) => (
                    <option key={user.sub} value={user.sub}>
                      {user.name || t("adminGlobalRoles.unnamedUser")} ({user.email})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="column">
            <label className="label" htmlFor="global-role-role">
              {t("adminGlobalRoles.roleLabel")}
            </label>
            <div className="select is-fullwidth">
              <select
                id="global-role-role"
                value={role}
                onChange={(event) => setRole(event.target.value as GlobalRole)}
              >
                <option value="GROUP_ADMIN">{t("adminGlobalRoles.groupAdmin")}</option>
                <option value="SYSTEM_ADMIN">{t("adminGlobalRoles.systemAdmin")}</option>
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
                  <FontAwesomeIcon icon={faSpinner} spin /> {t("adminGlobalRoles.granting")}
                </>
              ) : (
                t("adminGlobalRoles.grant")
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="box">
        <h3 className="title is-5">{t("adminGlobalRoles.currentHolders")}</h3>
        {rolesResult.data.grants.length === 0 ? (
          <p className="has-text-grey">{t("adminGlobalRoles.noRolesGranted")}</p>
        ) : (
          <table className="table is-fullwidth">
            <thead>
              <tr>
                <th>{t("adminGlobalRoles.userLabel")}</th>
                <th>{t("adminGlobalRoles.roleLabel")}</th>
                <th aria-label={t("actions")} />
              </tr>
            </thead>
            <tbody>
              {rolesResult.data.grants.map((grantRow) => {
                const key = `${grantRow.subject}:${grantRow.role}`;
                const isPending = pendingRevokes.has(key);
                const isConfirming = confirmingRevoke === key;
                return (
                  <tr key={key}>
                    <td>
                      {grantRow.name || t("adminGlobalRoles.unnamedUser")} (
                      {grantRow.email || grantRow.subject})
                    </td>
                    <td>
                      {grantRow.role === "SYSTEM_ADMIN"
                        ? t("adminGlobalRoles.systemAdmin")
                        : t("adminGlobalRoles.groupAdmin")}
                    </td>
                    <td className="has-text-right">
                      {isConfirming ? (
                        <span
                          className="is-flex is-align-items-center is-justify-content-flex-end"
                          style={{ gap: "0.5rem" }}
                        >
                          <span className="is-size-7 has-text-grey">
                            {t("adminGlobalRoles.revokeConfirm")}
                          </span>
                          <button
                            type="button"
                            className="button is-small is-danger"
                            disabled={isPending}
                            onClick={() => revoke(grantRow.subject, grantRow.role)}
                          >
                            {isPending ? (
                              <FontAwesomeIcon icon={faSpinner} spin />
                            ) : (
                              t("adminGlobalRoles.confirm")
                            )}
                          </button>
                          <button
                            type="button"
                            className="button is-small is-light"
                            onClick={() => setConfirmingRevoke(null)}
                          >
                            {t("adminGlobalRoles.cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="button is-small is-danger is-light"
                          disabled={isPending}
                          onClick={() => setConfirmingRevoke(key)}
                        >
                          {isPending ? (
                            <FontAwesomeIcon icon={faSpinner} spin />
                          ) : (
                            t("adminGlobalRoles.revoke")
                          )}
                        </button>
                      )}
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
