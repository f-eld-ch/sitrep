import { useState } from "react";
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
import { useRedirectIfForbidden } from "utils";
import type { AccessPrincipalKind, IncidentRole } from "types";

const ALL_PRINCIPAL_ID = "*";

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

  // Grant form state
  const [principalKind, setPrincipalKind] = useState<"USER" | "GROUP">("USER");
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

  const doRevoke = (grantKey: string, principalKindArg: AccessPrincipalKind, principalId: string, role: IncidentRole) => {
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

  const doRoleChange = (principalKey: string, principalKindArg: AccessPrincipalKind, principalId: string, role: IncidentRole) => {
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
        <div className="box mb-4">
          <p className="heading mb-3">{t("incidentAccess.accessMode")}</p>
          <div className="field">
            <div className="control">
              <label className="radio" style={{ alignItems: "flex-start", display: "flex", gap: "0.5rem" }}>
                <input
                  type="radio"
                  name={`access-mode-${incidentId}`}
                  checked={!isRestricted}
                  disabled={modeState.loading}
                  style={{ marginTop: "0.2rem", flexShrink: 0 }}
                  onChange={() => {
                    if (isRestricted) {
                      void changeMode({ incidentId, mode: "OPEN_OPERATIONAL" });
                    }
                  }}
                />
                <div>
                  <strong>{t("incidentAccess.openAccess")}</strong>
                  <p className="help mt-0">{t("incidentAccess.openAccessHelp")}</p>
                </div>
              </label>
            </div>
            <div className="control mt-3">
              <label className="radio" style={{ alignItems: "flex-start", display: "flex", gap: "0.5rem" }}>
                <input
                  type="radio"
                  name={`access-mode-${incidentId}`}
                  checked={isRestricted}
                  disabled={modeState.loading}
                  style={{ marginTop: "0.2rem", flexShrink: 0 }}
                  onChange={() => {
                    if (!isRestricted) {
                      setConfirmingRestrict(true);
                    }
                  }}
                />
                <div>
                  <strong>{t("incidentAccess.restricted")}</strong>
                  <p className="help mt-0">{t("incidentAccess.restrictedHelp")}</p>
                </div>
              </label>
            </div>
          </div>

          {confirmingRestrict && (
            <div className="notification is-warning is-light mt-3 py-3">
              <strong>{t("incidentAccess.headsUp")}</strong> {t("incidentAccess.confirmRestrictWarning")}
              <div className="mt-2" style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="button is-danger is-small"
                  disabled={modeState.loading}
                  onClick={() => {
                    setConfirmingRestrict(false);
                    void changeMode({ incidentId, mode: "RESTRICTED" });
                  }}
                >
                  {modeState.loading ? <FontAwesomeIcon icon={faSpinner} spin /> : t("incidentAccess.confirmRestrict")}
                </button>
                <button
                  type="button"
                  className="button is-small"
                  onClick={() => setConfirmingRestrict(false)}
                >
                  {t("incidentAccess.cancel")}
                </button>
              </div>
            </div>
          )}

          {modeState.error && (
            <div className="notification is-danger mt-3">{modeState.error.message}</div>
          )}
        </div>
      )}

      {/* Grants box */}
      <div className="box">
        <h4 className="title is-5 mb-4">{t("incidentAccess.title")}</h4>

        {accessResult.status === "error" && accessResult.error.code !== "FORBIDDEN" && (
          <div className="notification is-danger">{accessResult.error.message}</div>
        )}
        {mutationError && (
          <div className="notification is-danger is-light">
            <button className="delete" onClick={() => setMutationError(null)} />
            {mutationError}
          </div>
        )}

        {accessResult.status === "ready" && (
          <>
            {(isRestricted || grants.length > 0) && (
              <div className="table-container mb-5">
                <table className="table is-fullwidth">
                  <thead>
                    <tr>
                      <th>{t("incidentAccess.principal")}</th>
                      <th>{t("incidentAccess.role")}</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {/* All-users row — only shown on restricted incidents */}
                    {isRestricted && (
                      <tr>
                        <td>
                          <span className="has-text-weight-medium">{t("incidentAccess.allUsers")}</span>
                          <p className="help mt-0">{t("incidentAccess.allUsersHelp")}</p>
                        </td>
                        <td>
                          <RoleRadios
                            name="all-users-role"
                            options={["NONE", "VIEWER", "EDITOR"]}
                            value={allGrant?.role ?? "NONE"}
                            disabled={pendingGrants.has("ALL:*")}
                            onChange={(next) => {
                              if (next === "NONE") {
                                if (allGrant) {
                                  doRevoke(`ALL:*:${allGrant.role}`, "ALL", ALL_PRINCIPAL_ID, allGrant.role);
                                }
                              } else {
                                doAllGrant(next as IncidentRole);
                              }
                            }}
                          />
                        </td>
                        <td />
                      </tr>
                    )}

                    {/* Group grants (alpha) then user grants (alpha) */}
                    {[...grants]
                      .map((grant) => {
                        const user = grant.principalKind === "USER" ? userBySub.get(grant.principalId) : undefined;
                        const displayName =
                          grant.principalKind === "GROUP"
                            ? (groupsResult.status === "ready"
                                ? (groupsResult.data.groups.find((g) => g.id === grant.principalId)?.name ?? grant.principalName)
                                : grant.principalName)
                            : (user?.name || user?.email || grant.principalName);
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
                          <tr key={principalKey}>
                            <td>
                              <span title={grant.principalKind === "USER" ? grant.principalId : undefined}>
                                {displayName}
                              </span>
                              {grant.principalKind === "USER" && user?.email && user.name && (
                                <span className="has-text-grey ml-2 is-size-7">{user.email}</span>
                              )}
                              {grant.principalKind === "GROUP" && (
                                <span className="tag is-light is-small ml-2">{t("incidentAccess.groupTag")}</span>
                              )}
                            </td>
                            <td>
                              <RoleRadios
                                options={ROLE_OPTIONS}
                                value={grant.role}
                                disabled={isBusy}
                                name={principalKey}
                                onChange={(newRole) => {
                                  if (newRole === grant.role) return;
                                  doRoleChange(principalKey, grant.principalKind, grant.principalId, newRole as IncidentRole);
                                }}
                              />
                            </td>
                            <td className="has-text-right" style={{ width: "3rem" }}>
                              <button
                                type="button"
                                className="button is-ghost is-small has-text-danger"
                                disabled={isBusy}
                                onClick={() => doRevoke(revokeKey, grant.principalKind, grant.principalId, grant.role)}
                                title={t("incidentAccess.revoke")}
                              >
                                {isRevoking ? (
                                  <FontAwesomeIcon icon={faSpinner} spin />
                                ) : (
                                  <FontAwesomeIcon icon={faTrash} />
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add grant */}
            <h5 className="title is-6 mb-3">{t("incidentAccess.addGrant")}</h5>
            <div className="field is-grouped mb-3">
              <div className="control">
                <div className="buttons has-addons">
                  <button
                    type="button"
                    className={`button is-small ${principalKind === "USER" ? "is-primary is-selected" : ""}`}
                    onClick={() => { setPrincipalKind("USER"); setSearchQuery(""); }}
                  >
                    {t("incidentAccess.user")}
                  </button>
                  <button
                    type="button"
                    className={`button is-small ${principalKind === "GROUP" ? "is-primary is-selected" : ""}`}
                    onClick={() => { setPrincipalKind("GROUP"); setSearchQuery(""); }}
                  >
                    {t("incidentAccess.group")}
                  </button>
                </div>
              </div>
              <div className="control is-expanded">
                <input
                  className="input is-small"
                  placeholder={principalKind === "USER" ? t("incidentAccess.searchByNameOrEmail") : t("incidentAccess.searchByName")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {(principalKind === "USER" ? usersResult.status : groupsResult.status) === "loading" && (
              <Spinner />
            )}

            {availablePrincipals.length === 0 && query && (
              <p className="has-text-grey is-size-7">{t("incidentAccess.noMatches")}</p>
            )}
            {availablePrincipals.length === 0 && !query && (principalKind === "USER" ? usersResult.status : groupsResult.status) === "ready" && (
              <p className="has-text-grey is-size-7">
                {principalKind === "USER" ? t("incidentAccess.allUsersHaveGrants") : t("incidentAccess.noActiveGroups")}
              </p>
            )}

            {availablePrincipals.length > 0 && (
              <div className="table-container">
                <table className="table is-hoverable is-narrow">
                  <tbody>
                    {availablePrincipals.map((p) => {
                      const id = "sub" in p ? p.sub : p.id;
                      const key = `${principalKind}:${id}`;
                      const isPending = pendingGrants.has(key);
                      return (
                        <GrantRow
                          key={id}
                          label={"sub" in p ? (p.name || p.email || p.sub) : p.name}
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
    <div className="is-flex" style={{ gap: "0.25rem", flexWrap: "nowrap" }}>
      {options.map((opt) => (
        <label
          key={opt}
          className="radio"
          title={descriptions[opt]}
          style={{
            cursor: disabled ? "default" : "pointer",
            minWidth: "5.5rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="radio"
            name={name}
            value={opt}
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
    <tr>
      <td>
        <span title={tooltip}>{label}</span>
        {sublabel && <span className="has-text-grey ml-2 is-size-7">{sublabel}</span>}
      </td>
      <td>
        <div className="field has-addons mb-0">
          <div className="control is-expanded">
            <div className="select is-small is-fullwidth">
              <select
                value={role}
                disabled={loading}
                title={roleDescriptions[role]}
                onChange={(e) => setRole(e.target.value as IncidentRole)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{roleLabels[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="control">
            <button
              type="button"
              className="button is-success is-small"
              disabled={loading}
              onClick={() => onGrant(role)}
            >
              {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : t("incidentAccess.grant")}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default IncidentAccessSection;
