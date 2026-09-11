import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Notification, PageTitle } from "components/ui";
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
    return <Notification variant="danger">{rolesResult.error.message}</Notification>;
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
      <PageTitle level={2}>{t("adminGlobalRoles.title")}</PageTitle>

      {(grantState.error ?? revokeState.error) && (
        <Notification variant="danger" className="mb-4">
          {(grantState.error ?? revokeState.error)?.message}
        </Notification>
      )}

      <div className="mb-5 rounded border border-border bg-bg-elevated p-5">
        <PageTitle level={3}>{t("adminGlobalRoles.grantRole")}</PageTitle>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-sm font-semibold" htmlFor="global-role-subject">
              {t("adminGlobalRoles.userLabel")}
            </label>
            <select
              id="global-role-subject"
              className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm text-fg focus:ring-1 focus:ring-primary focus:outline-none"
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
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-sm font-semibold" htmlFor="global-role-role">
              {t("adminGlobalRoles.roleLabel")}
            </label>
            <select
              id="global-role-role"
              className="w-full rounded border border-border bg-bg px-3 py-1.5 text-sm text-fg focus:ring-1 focus:ring-primary focus:outline-none"
              value={role}
              onChange={(event) => setRole(event.target.value as GlobalRole)}
            >
              <option value="GROUP_ADMIN">{t("adminGlobalRoles.groupAdmin")}</option>
              <option value="SYSTEM_ADMIN">{t("adminGlobalRoles.systemAdmin")}</option>
            </select>
          </div>
          <div className="flex shrink-0 items-end">
            <Button
              variant="primary"
              disabled={!subject || grantState.loading}
              onClick={() => void grant()}
            >
              {grantState.loading ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                  {t("adminGlobalRoles.granting")}
                </>
              ) : (
                t("adminGlobalRoles.grant")
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded border border-border bg-bg-elevated p-5">
        <PageTitle level={3}>{t("adminGlobalRoles.currentHolders")}</PageTitle>
        {rolesResult.data.grants.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("adminGlobalRoles.noRolesGranted")}</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left font-semibold">
                  {t("adminGlobalRoles.userLabel")}
                </th>
                <th className="py-2 pr-4 text-left font-semibold">
                  {t("adminGlobalRoles.roleLabel")}
                </th>
                <th aria-label={t("actions")} />
              </tr>
            </thead>
            <tbody>
              {rolesResult.data.grants.map((grantRow) => {
                const key = `${grantRow.subject}:${grantRow.role}`;
                const isPending = pendingRevokes.has(key);
                const isConfirming = confirmingRevoke === key;
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4">
                      {grantRow.name || t("adminGlobalRoles.unnamedUser")} (
                      {grantRow.email || grantRow.subject})
                    </td>
                    <td className="py-2 pr-4">
                      {grantRow.role === "SYSTEM_ADMIN"
                        ? t("adminGlobalRoles.systemAdmin")
                        : t("adminGlobalRoles.groupAdmin")}
                    </td>
                    <td className="py-2 text-right">
                      {isConfirming ? (
                        <span className="flex items-center justify-end gap-2">
                          <span className="text-xs text-fg-muted">
                            {t("adminGlobalRoles.revokeConfirm")}
                          </span>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={isPending}
                            onClick={() => revoke(grantRow.subject, grantRow.role)}
                          >
                            {isPending ? (
                              <FontAwesomeIcon icon={faSpinner} spin />
                            ) : (
                              t("adminGlobalRoles.confirm")
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="light"
                            onClick={() => setConfirmingRevoke(null)}
                          >
                            {t("adminGlobalRoles.cancel")}
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          light
                          disabled={isPending}
                          onClick={() => setConfirmingRevoke(key)}
                        >
                          {isPending ? (
                            <FontAwesomeIcon icon={faSpinner} spin />
                          ) : (
                            t("adminGlobalRoles.revoke")
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  );
}

export default GlobalRoles;
