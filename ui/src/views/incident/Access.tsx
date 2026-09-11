import { useState } from "react";
import { clsx } from "clsx";
import { faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import {
  useAccessGroups,
  useAccessUsers,
  useChangeIncidentAccessMode,
  useGrantIncidentRole,
  useIncidentAccess,
  useIncidentAccessMode,
  useRevokeIncidentRole,
} from "api";
import { Spinner } from "components";
import { Button, Notification, Tag } from "components/ui";
import { useRedirectIfForbidden } from "utils";
import type { AccessPrincipalKind, IncidentRole } from "types";

const ALL_PRINCIPAL_ID = "*";

const inputSm =
  "w-full rounded border border-border px-2 py-0.5 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";

const box = "bg-bg-elevated border border-border rounded p-5 mb-4 shadow-sm";

/** RBAC section of the incident editor: access mode toggle and per-principal grants. */
function IncidentAccessSection({ incidentId }: { incidentId: string }) {
  const { t } = useTranslation();
  const modeResult = useIncidentAccessMode(incidentId);
  const accessResult = useIncidentAccess(incidentId);
  const usersResult = useAccessUsers();
  const groupsResult = useAccessGroups();
  const [changeMode, modeState] = useChangeIncidentAccessMode();
  const [grantRole] = useGrantIncidentRole();
  const [revokeRole] = useRevokeIncidentRole();

  const [confirmingRestrict, setConfirmingRestrict] = useState(false);
  const [pendingRevokes, setPendingRevokes] = useState<Set<string>>(new Set());
  const [mutationError, setMutationError] = useState<string | null>(null);

  const canListUsers = usersResult.status === "ready" || usersResult.status === "loading";
  const [principalKind, setPrincipalKind] = useState<"USER" | "GROUP">("GROUP");
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingGrants, setPendingGrants] = useState<Set<string>>(new Set());

  useRedirectIfForbidden(accessResult.status === "error" ? accessResult.error : undefined);

  const isRestricted = modeResult.status === "ready" && modeResult.data.mode === "RESTRICTED";

  const allGrant =
    accessResult.status === "ready"
      ? accessResult.data.grants.find((g) => g.principalKind === "ALL")
      : undefined;

  const userBySub =
    usersResult.status === "ready"
      ? new Map(usersResult.data.users.map((u) => [u.sub, u]))
      : new Map<string, { sub: string; name: string; email: string }>();

  const grantedPrincipalKeys =
    accessResult.status === "ready"
      ? new Set(accessResult.data.grants.map((g) => `${g.principalKind}:${g.principalId}`))
      : new Set<string>();

  const query = searchQuery.trim().toLowerCase();

  const availablePrincipals =
    principalKind === "USER"
      ? usersResult.status === "ready"
        ? usersResult.data.users.filter((u) => {
            if (grantedPrincipalKeys.has(`USER:${u.sub}`)) return false;
            if (!query) return true;
            return (
              u.name.toLowerCase().includes(query) ||
              u.email.toLowerCase().includes(query) ||
              u.sub.toLowerCase().includes(query)
            );
          })
        : []
      : groupsResult.status === "ready"
        ? groupsResult.data.groups.filter((g) => {
            if (g.archivedAt) return false;
            if (grantedPrincipalKeys.has(`GROUP:${g.id}`)) return false;
            if (!query) return true;
            return g.name.toLowerCase().includes(query);
          })
        : [];

  const doRevoke = (
    grantKey: string,
    principalKindArg: AccessPrincipalKind,
    principalId: string,
    role: IncidentRole,
  ) => {
    if (pendingRevokes.has(grantKey)) return;
    setMutationError(null);
    setPendingRevokes((prev) => new Set(prev).add(grantKey));
    void revokeRole({ incidentId, principalKind: principalKindArg, principalId, role })
      .catch((err: unknown) => {
        setMutationError(err instanceof Error ? err.message : t("incidentAccess.revokeFailed"));
      })
      .finally(() => {
        setPendingRevokes((prev) => {
          const next = new Set(prev);
          next.delete(grantKey);
          return next;
        });
      });
  };

  const doGrant = (principalId: string, role: IncidentRole) => {
    const key = `${principalKind}:${principalId}`;
    if (pendingGrants.has(key)) return;
    setMutationError(null);
    setPendingGrants((prev) => new Set(prev).add(key));
    void grantRole({ incidentId, principalKind, principalId, role })
      .catch((err: unknown) => {
        setMutationError(err instanceof Error ? err.message : t("incidentAccess.grantFailed"));
      })
      .finally(() => {
        setPendingGrants((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  };

  const doRoleChange = (
    principalKey: string,
    principalKindArg: AccessPrincipalKind,
    principalId: string,
    role: IncidentRole,
  ) => {
    setMutationError(null);
    setPendingGrants((prev) => new Set(prev).add(principalKey));
    void grantRole({ incidentId, principalKind: principalKindArg, principalId, role })
      .catch((err: unknown) => {
        setMutationError(err instanceof Error ? err.message : t("incidentAccess.roleChangeFailed"));
      })
      .finally(() => {
        setPendingGrants((prev) => {
          const next = new Set(prev);
          next.delete(principalKey);
          return next;
        });
      });
  };

  const doAllGrant = (role: IncidentRole) => {
    const key = "ALL:*";
    setMutationError(null);
    setPendingGrants((prev) => new Set(prev).add(key));
    void grantRole({ incidentId, principalKind: "ALL", principalId: ALL_PRINCIPAL_ID, role })
      .catch((err: unknown) => {
        setMutationError(err instanceof Error ? err.message : t("incidentAccess.grantFailed"));
      })
      .finally(() => {
        setPendingGrants((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  };

  const grants =
    accessResult.status === "ready"
      ? accessResult.data.grants.filter((g) => g.principalKind !== "ALL")
      : [];

  return (
    <>
      {/* Access mode */}
      {modeResult.status === "ready" && (
        <div className={box}>
          <h4 className="mb-4 text-xl font-bold">{t("incidentAccess.accessMode")}</h4>
          <div className="space-y-3">
            <label
              className="flex cursor-pointer items-start gap-2"
              aria-label={t("incidentAccess.openAccess")}
            >
              <input
                type="radio"
                name={`access-mode-${incidentId}`}
                checked={!isRestricted}
                disabled={modeState.loading}
                className="mt-0.5 shrink-0"
                onChange={() => {
                  if (isRestricted) {
                    void changeMode({ incidentId, mode: "OPEN_OPERATIONAL" });
                  }
                }}
              />
              <div>
                <strong>{t("incidentAccess.openAccess")}</strong>
                <p className="mt-0 text-xs text-fg-muted">{t("incidentAccess.openAccessHelp")}</p>
              </div>
            </label>
            <label
              className="flex cursor-pointer items-start gap-2"
              aria-label={t("incidentAccess.restricted")}
            >
              <input
                type="radio"
                name={`access-mode-${incidentId}`}
                checked={isRestricted}
                disabled={modeState.loading}
                className="mt-0.5 shrink-0"
                onChange={() => {
                  if (!isRestricted) {
                    setConfirmingRestrict(true);
                  }
                }}
              />
              <div>
                <strong>{t("incidentAccess.restricted")}</strong>
                <p className="mt-0 text-xs text-fg-muted">{t("incidentAccess.restrictedHelp")}</p>
              </div>
            </label>
          </div>

          {confirmingRestrict && (
            <Notification variant="warning" light className="mt-3">
              <strong>{t("incidentAccess.headsUp")}</strong>{" "}
              {t("incidentAccess.confirmRestrictWarning")}
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={modeState.loading}
                  onClick={() => {
                    setConfirmingRestrict(false);
                    void changeMode({ incidentId, mode: "RESTRICTED" });
                  }}
                >
                  {modeState.loading ? (
                    <FontAwesomeIcon icon={faSpinner} spin />
                  ) : (
                    t("incidentAccess.confirmRestrict")
                  )}
                </Button>
                <Button
                  type="button"
                  variant="light"
                  size="sm"
                  onClick={() => setConfirmingRestrict(false)}
                >
                  {t("incidentAccess.cancel")}
                </Button>
              </div>
            </Notification>
          )}

          {modeState.error && (
            <Notification variant="danger" className="mt-3">
              {modeState.error.message}
            </Notification>
          )}
        </div>
      )}

      {/* Grants box */}
      <div className={box}>
        <h4 className="mb-4 text-xl font-bold">{t("incidentAccess.title")}</h4>

        {accessResult.status === "error" && accessResult.error.code !== "FORBIDDEN" && (
          <Notification variant="danger" className="mb-3">
            {accessResult.error.message}
          </Notification>
        )}
        {mutationError && (
          <Notification variant="danger" light className="mb-3 flex items-start justify-between">
            <span>{mutationError}</span>
            <button
              className="ml-3 leading-none font-bold text-danger"
              aria-label={t("close")}
              onClick={() => setMutationError(null)}
            >
              ×
            </button>
          </Notification>
        )}

        {accessResult.status === "ready" && (
          <>
            {(isRestricted || grants.length > 0) && (
              <div className="mb-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-semibold">{t("incidentAccess.principal")}</th>
                      <th className="pb-2 font-semibold">{t("incidentAccess.role")}</th>
                      <th className="w-12 pb-2" aria-label={t("actions")} />
                    </tr>
                  </thead>
                  <tbody>
                    {/* All-users row — only shown on restricted incidents */}
                    {isRestricted && (
                      <tr className="border-b border-border">
                        <td className="py-2 pr-4">
                          <span className="font-medium">{t("incidentAccess.allUsers")}</span>
                          <p className="mt-0 text-xs text-fg-muted">
                            {t("incidentAccess.allUsersHelp")}
                          </p>
                        </td>
                        <td className="py-2">
                          <RoleRadios
                            name="all-users-role"
                            options={["NONE", "VIEWER", "EDITOR"]}
                            value={allGrant?.role ?? "NONE"}
                            disabled={pendingGrants.has("ALL:*")}
                            onChange={(next) => {
                              if (next === "NONE") {
                                if (allGrant) {
                                  doRevoke(
                                    `ALL:*:${allGrant.role}`,
                                    "ALL",
                                    ALL_PRINCIPAL_ID,
                                    allGrant.role,
                                  );
                                }
                              } else {
                                doAllGrant(next as IncidentRole);
                              }
                            }}
                          />
                        </td>
                        <td aria-hidden="true" />
                      </tr>
                    )}

                    {[...grants]
                      .map((grant) => {
                        const user =
                          grant.principalKind === "USER"
                            ? userBySub.get(grant.principalId)
                            : undefined;
                        const displayName =
                          grant.principalKind === "GROUP"
                            ? groupsResult.status === "ready"
                              ? (groupsResult.data.groups.find((g) => g.id === grant.principalId)
                                  ?.name ?? grant.principalName)
                              : grant.principalName
                            : user?.name || user?.email || grant.principalName || grant.principalId;
                        return { grant, displayName, user };
                      })
                      .sort((a, b) => {
                        if (a.grant.principalKind !== b.grant.principalKind) {
                          return a.grant.principalKind === "GROUP" ? -1 : 1;
                        }
                        return a.displayName.localeCompare(b.displayName);
                      })
                      .map(({ grant, displayName, user }) => {
                        const principalKey = `${grant.principalKind}:${grant.principalId}`;
                        const revokeKey = `${principalKey}:${grant.role}`;
                        const isRevoking = pendingRevokes.has(revokeKey);
                        const isChangingRole = pendingGrants.has(principalKey);
                        const isBusy = isRevoking || isChangingRole;

                        return (
                          <tr key={principalKey} className="border-b border-border">
                            <td className="py-2 pr-4">
                              <span
                                title={
                                  grant.principalKind === "USER"
                                    ? !user
                                      ? t("incidentAccess.userDetailsRestricted")
                                      : grant.principalId
                                    : undefined
                                }
                              >
                                {displayName}
                              </span>
                              {grant.principalKind === "USER" && user?.email && user.name && (
                                <span className="ml-2 text-xs text-fg-muted">{user.email}</span>
                              )}
                              {grant.principalKind === "USER" && !user && (
                                <Tag
                                  size="sm"
                                  light
                                  className="ml-2"
                                  title={t("incidentAccess.userDetailsRestricted")}
                                >
                                  {t("incidentAccess.user")}
                                </Tag>
                              )}
                              {grant.principalKind === "GROUP" && (
                                <Tag size="sm" light className="ml-2">
                                  {t("incidentAccess.groupTag")}
                                </Tag>
                              )}
                            </td>
                            <td className="py-2">
                              <RoleRadios
                                options={ROLE_OPTIONS}
                                value={grant.role}
                                disabled={isBusy}
                                name={principalKey}
                                onChange={(newRole) => {
                                  if (newRole === grant.role) return;
                                  doRoleChange(
                                    principalKey,
                                    grant.principalKind,
                                    grant.principalId,
                                    newRole as IncidentRole,
                                  );
                                }}
                              />
                            </td>
                            <td className="w-12 py-2 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-danger!"
                                disabled={isBusy}
                                onClick={() =>
                                  doRevoke(
                                    revokeKey,
                                    grant.principalKind,
                                    grant.principalId,
                                    grant.role,
                                  )
                                }
                                title={t("incidentAccess.revoke")}
                              >
                                {isRevoking ? (
                                  <FontAwesomeIcon icon={faSpinner} spin />
                                ) : (
                                  <FontAwesomeIcon icon={faTrash} />
                                )}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add grant */}
            <h5 className="mb-3 text-lg font-bold">{t("incidentAccess.addGrant")}</h5>
            <div className="mb-3 flex gap-2">
              <div className="flex overflow-hidden rounded border border-border">
                {canListUsers && (
                  <Button
                    type="button"
                    variant={principalKind === "USER" ? "primary" : "ghost"}
                    size="sm"
                    className="rounded-none border-0"
                    onClick={() => {
                      setPrincipalKind("USER");
                      setSearchQuery("");
                    }}
                  >
                    {t("incidentAccess.user")}
                  </Button>
                )}
                <Button
                  type="button"
                  variant={principalKind === "GROUP" ? "primary" : "ghost"}
                  size="sm"
                  className="rounded-none border-0"
                  onClick={() => {
                    setPrincipalKind("GROUP");
                    setSearchQuery("");
                  }}
                >
                  {t("incidentAccess.group")}
                </Button>
              </div>
              <input
                className={inputSm + " flex-1"}
                placeholder={
                  principalKind === "USER"
                    ? t("incidentAccess.searchByNameOrEmail")
                    : t("incidentAccess.searchByName")
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {(principalKind === "USER" ? usersResult.status : groupsResult.status) ===
              "loading" && <Spinner />}

            {availablePrincipals.length === 0 && query && (
              <p className="text-xs text-fg-muted">{t("incidentAccess.noMatches")}</p>
            )}
            {availablePrincipals.length === 0 &&
              !query &&
              (principalKind === "USER" ? usersResult.status : groupsResult.status) === "ready" && (
                <p className="text-xs text-fg-muted">
                  {principalKind === "USER"
                    ? t("incidentAccess.allUsersHaveGrants")
                    : t("incidentAccess.noActiveGroups")}
                </p>
              )}

            {availablePrincipals.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {availablePrincipals.map((p) => {
                      const id = "sub" in p ? p.sub : p.id;
                      const key = `${principalKind}:${id}`;
                      const isPending = pendingGrants.has(key);
                      return (
                        <GrantRow
                          key={id}
                          label={"sub" in p ? p.name || p.email || p.sub : p.name}
                          sublabel={"sub" in p && p.name ? p.email : undefined}
                          tooltip={"sub" in p ? p.sub : undefined}
                          loading={isPending}
                          onGrant={(role) => doGrant(id, role)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

const ROLE_OPTIONS: IncidentRole[] = ["VIEWER", "EDITOR", "MANAGER", "OWNER"];

interface RoleRadiosProps {
  options: string[];
  value: string;
  name?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

function RoleRadios({ options, value, name = "role", disabled, onChange }: RoleRadiosProps) {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    NONE: t("incidentAccess.roles.NONE"),
    VIEWER: t("incidentAccess.roles.VIEWER"),
    EDITOR: t("incidentAccess.roles.EDITOR"),
    MANAGER: t("incidentAccess.roles.MANAGER"),
    OWNER: t("incidentAccess.roles.OWNER"),
  };
  const descriptions: Record<string, string> = {
    NONE: t("incidentAccess.roleDescriptions.NONE"),
    VIEWER: t("incidentAccess.roleDescriptions.VIEWER"),
    EDITOR: t("incidentAccess.roleDescriptions.EDITOR"),
    MANAGER: t("incidentAccess.roleDescriptions.MANAGER"),
    OWNER: t("incidentAccess.roleDescriptions.OWNER"),
  };
  return (
    <div className="flex flex-nowrap gap-5">
      {options.map((opt) => (
        <label
          key={opt}
          className={clsx("inline-flex min-w-[5.5rem] items-center gap-1.5 whitespace-nowrap", disabled ? "cursor-default" : "cursor-pointer")}
          title={descriptions[opt]}
        >
          <input
            type="radio"
            name={name}
            value={opt}
            aria-label={labels[opt] ?? opt}
            checked={value === opt}
            disabled={disabled}
            onChange={() => onChange(opt)}
          />
          {labels[opt] ?? opt}
        </label>
      ))}
    </div>
  );
}

interface GrantRowProps {
  label: string;
  sublabel?: string;
  tooltip?: string;
  loading: boolean;
  onGrant: (role: IncidentRole) => void;
}

function GrantRow({ label, sublabel, tooltip, loading, onGrant }: GrantRowProps) {
  const { t } = useTranslation();
  const [role, setRole] = useState<IncidentRole>("VIEWER");

  const roleLabels: Record<IncidentRole, string> = {
    OWNER: t("incidentAccess.roles.OWNER"),
    MANAGER: t("incidentAccess.roles.MANAGER"),
    EDITOR: t("incidentAccess.roles.EDITOR"),
    VIEWER: t("incidentAccess.roles.VIEWER"),
  };
  const roleDescriptions: Record<string, string> = {
    NONE: t("incidentAccess.roleDescriptions.NONE"),
    VIEWER: t("incidentAccess.roleDescriptions.VIEWER"),
    EDITOR: t("incidentAccess.roleDescriptions.EDITOR"),
    MANAGER: t("incidentAccess.roleDescriptions.MANAGER"),
    OWNER: t("incidentAccess.roleDescriptions.OWNER"),
  };

  return (
    <tr className="border-b border-border hover:bg-bg-subtle">
      <td className="py-1.5 pr-4">
        <span title={tooltip}>{label}</span>
        {sublabel && <span className="ml-2 text-xs text-fg-muted">{sublabel}</span>}
      </td>
      <td className="py-1.5" aria-label={label}>
        <div className="flex justify-end gap-1">
          <select
            className="w-32 rounded border border-border bg-bg px-2 py-0.5 text-sm text-fg focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50"
            value={role}
            disabled={loading}
            aria-label={label}
            title={roleDescriptions[role]}
            onChange={(e) => setRole(e.target.value as IncidentRole)}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="success"
            size="sm"
            disabled={loading}
            aria-label={t("incidentAccess.grant")}
            onClick={() => onGrant(role)}
          >
            {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : t("incidentAccess.grant")}
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default IncidentAccessSection;
