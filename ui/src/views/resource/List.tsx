/* eslint-disable jsx-a11y/control-has-associated-label -- expandable table buttons are labelled; oxlint flags filler/detail table cells. */
import { Fragment, useState } from "react";
import dayjs from "dayjs";
import { Spinner } from "components";
import { Notification, PageTitle, Tag } from "components/ui";
import type { TagVariant } from "components/ui/Tag";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useIncidentResources } from "api";
import type {
  Resource,
  ResourceDeploymentPeriod,
  ResourceFormation,
  ResourceStatus,
  ResourceUnitSize,
} from "api";
import { BabsIcon, BabsIconProvider } from "@f-eld-ch/babs-react";
import { useBabsIcons } from "components/babs/useBabsIcons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";

const statusVariant: Record<ResourceStatus, TagVariant> = {
  AUFGEBOTEN: "warning",
  EINSATZBEREIT: "primary",
  EINGESETZT: "success",
  ABGELOEST: "gray",
};

const STATUS_ORDER: ResourceStatus[] = ["AUFGEBOTEN", "EINSATZBEREIT", "EINGESETZT", "ABGELOEST"];

const FORMATION_PREFIX: Record<ResourceFormation, string> = {
  POL: "41",
  FW: "42",
  SAN: "43",
  ZS: "44",
  TECHNB: "45",
  ARMEE: "46",
  OTHER: "48",
};
const SIZE_OFFSET: Record<ResourceUnitSize, string> = {
  TRUPP: "01",
  GRUPPE: "02",
  ZUG: "03",
  KOMPANIE: "04",
  BATAILLON: "05",
};
const FORMATION_ORDER: ResourceFormation[] = ["FW", "SAN", "POL", "ZS", "TECHNB", "ARMEE", "OTHER"];

// Generic partner-level BABS icon (no unit size)
const FORMATION_ICON: Record<ResourceFormation, string> = {
  FW: "4702",
  SAN: "4703",
  ZS: "4704",
  POL: "4701",
  TECHNB: "4705",
  ARMEE: "4706",
  OTHER: "4802",
};

function combinedBabsId(
  formation: ResourceFormation | null,
  size: ResourceUnitSize | null,
): string | null {
  if (!formation || !size) return null;
  return FORMATION_PREFIX[formation] + SIZE_OFFSET[size];
}

type StatusPersonnel = Partial<Record<ResourceStatus, number>>;
type ResourceSourceLabels = Record<string, string>;

interface IncidentResourceGroup {
  incidentId: string;
  incidentName: string;
  resources: Resource[];
  formationGroups: ResourceFormationGroup[];
}

interface ResourceFormationGroup {
  formation: ResourceFormation;
  resources: Resource[];
  homeLocationGroups: ResourceHomeLocationGroup[];
}

interface ResourceHomeLocationGroup {
  homeLocation: string | null;
  resources: Resource[];
}

function personnelByStatus(resources: Resource[]): StatusPersonnel {
  const totals: StatusPersonnel = {};
  for (const resource of resources) {
    totals[resource.status] = (totals[resource.status] ?? 0) + resource.personnelCount;
  }
  return totals;
}

function totalPersonnel(resources: Resource[]): number {
  return resources.reduce((total, resource) => total + resource.personnelCount, 0);
}

function StatusBadges({ totals }: { totals: StatusPersonnel }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1">
      {STATUS_ORDER.filter((status) => totals[status]).map((status) => (
        <Tag key={status} variant={statusVariant[status]} light size="sm">
          {totals[status]} {t(`resource.status.${status}`)}
        </Tag>
      ))}
    </span>
  );
}

function FormationKpis({
  resources,
  iconsLoaded,
}: {
  resources: Resource[];
  iconsLoaded: boolean;
}) {
  const { t } = useTranslation();
  const formationGroups = FORMATION_ORDER.map((formation) => ({
    formation,
    resources: resources.filter(
      (resource) => resource.formation === formation && resource.status !== "ABGELOEST",
    ),
  })).filter((group) => group.resources.length > 0);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
      {formationGroups.map((group) => (
        <section key={group.formation} className="rounded border border-border bg-bg-elevated p-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-fg">
                {t(`resource.formation.${group.formation}`)}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center">
                {iconsLoaded ? (
                  <BabsIcon icon={FORMATION_ICON[group.formation]} size={30} fallback={null} />
                ) : (
                  group.formation
                )}
              </span>
              <p className="text-2xl font-bold text-fg tabular-nums">
                {totalPersonnel(group.resources)}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <StatusBadges totals={personnelByStatus(group.resources)} />
          </div>
        </section>
      ))}
    </div>
  );
}

function buildIncidentResourceGroups({
  resources,
  incidentId,
  incidentName,
  sourceLabels,
}: {
  resources: Resource[];
  incidentId: string;
  incidentName: string;
  sourceLabels: ResourceSourceLabels;
}): IncidentResourceGroup[] {
  const incidentNames = { [incidentId]: incidentName, ...sourceLabels };
  const byIncident = new Map<string, Resource[]>();

  for (const resource of resources) {
    const incidentResources = byIncident.get(resource.incidentId) ?? [];
    incidentResources.push(resource);
    byIncident.set(resource.incidentId, incidentResources);
  }

  const incidentOrder = [incidentId, ...Object.keys(sourceLabels)];

  return incidentOrder
    .filter((id) => byIncident.has(id))
    .map((id) => {
      const incidentResources = byIncident.get(id)!;
      const formationGroups = FORMATION_ORDER.filter((formation) =>
        incidentResources.some((resource) => resource.formation === formation),
      ).map((formation) => {
        const formationResources = incidentResources.filter(
          (resource) => resource.formation === formation,
        );
        const byHomeLocation = new Map<string, ResourceHomeLocationGroup>();

        for (const resource of formationResources) {
          const key = resource.homeLocation?.name ?? "__none__";
          const group = byHomeLocation.get(key) ?? {
            homeLocation: resource.homeLocation?.name ?? null,
            resources: [],
          };
          group.resources.push(resource);
          byHomeLocation.set(key, group);
        }

        const homeLocationGroups = [...byHomeLocation.values()].sort((a, b) =>
          (a.homeLocation ?? "").localeCompare(b.homeLocation ?? ""),
        );

        return {
          formation,
          resources: formationResources,
          homeLocationGroups,
        };
      });

      return {
        incidentId: id,
        incidentName: incidentNames[id] ?? id,
        resources: incidentResources,
        formationGroups,
      };
    });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return dayjs(iso).format("DD.MM.YYYY HH:mm");
}

function ResourceTableRow({
  resource,
  period,
  iconsLoaded,
  successor,
  historyOpen,
  onToggleHistory,
}: {
  resource: Resource;
  period?: ResourceDeploymentPeriod;
  iconsLoaded: boolean;
  successor?: Resource;
  historyOpen?: boolean;
  onToggleHistory?: () => void;
}) {
  const { t } = useTranslation();
  const formation = period?.formation ?? resource.formation;
  const size = period ? resource.size : resource.size;
  const babsId = combinedBabsId(formation, size);
  const isHistory = period !== undefined;
  const status = isHistory ? "EINGESETZT" : resource.status;
  const name = period?.name || resource.name || t(`resource.size.${size}`);

  return (
    <tr className="hover:bg-bg-elevated/40">
      <td className={isHistory ? "px-2 py-1.5 pl-24" : "px-2 py-1.5 pl-18"}>
        {!isHistory && (
          <span className="flex items-center gap-2">
            {resource.deploymentHistory.length > 1 && onToggleHistory && (
              <button
                type="button"
                className="shrink-0 text-fg-muted/60"
                aria-label={name}
                onClick={onToggleHistory}
              >
                <FontAwesomeIcon
                  icon={historyOpen ? faChevronDown : faChevronRight}
                  className="w-3"
                />
              </button>
            )}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-bg">
              {babsId && iconsLoaded ? (
                <BabsIcon icon={babsId} size={20} fallback={null} />
              ) : (
                <span className="text-[10px] font-bold text-fg-muted">{formation}</span>
              )}
            </span>
            <span className="font-medium text-fg">{name}</span>
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right text-fg tabular-nums">
        {!isHistory && resource.personnelCount}
      </td>
      <td className="px-2 py-1.5">
        {!isHistory && (
          <Tag variant={statusVariant[status]} light size="sm">
            {t(`resource.status.${status}`)}
          </Tag>
        )}
      </td>
      <td className="max-w-[12rem] truncate px-2 py-1.5 text-fg">
        {!isHistory && resource.contact
          ? `${t(`medium.${resource.contact.medium}`)}${resource.contact.detail ? `: ${resource.contact.detail}` : ""}`
          : !isHistory
            ? "–"
            : null}
      </td>
      <td className="px-2 py-1.5 text-center text-fg tabular-nums">
        {!isHistory && formatDateTime(resource.alertedAt)}
      </td>
      <td className="px-2 py-1.5 text-center text-fg tabular-nums">
        {!isHistory && formatDateTime(resource.readyAt)}
      </td>
      <td className="px-2 py-1.5 text-center text-fg tabular-nums">
        {formatDateTime(isHistory ? period.startedAt : resource.deployedAt)}
      </td>
      <td className="px-2 py-1.5 text-left text-fg tabular-nums">
        {formatDateTime(isHistory ? period.endedAt : resource.relievedAt)}
        {!isHistory && resource.status === "ABGELOEST" && successor && (
          <span className="block text-left text-xs font-normal text-fg-muted">
            {t("resource.fields.relievedThrough")}:{" "}
            {successor.name || t(`resource.size.${successor.size}`)}
          </span>
        )}
      </td>
      <td className="max-w-[12rem] truncate px-2 py-1.5 text-fg">
        {period?.hauptaufgabe || resource.hauptaufgabe || "–"}
      </td>
      <td className="max-w-[10rem] truncate px-2 py-1.5 text-fg">
        {isHistory ? period.deploymentLabel || "–" : resource.deploymentLocation?.label || "–"}
      </td>
    </tr>
  );
}

function Mitteltabelle({
  resources,
  iconsLoaded,
  sourceLabels,
  incidentId,
  incidentName,
}: {
  resources: Resource[];
  iconsLoaded: boolean;
  sourceLabels: ResourceSourceLabels;
  incidentId: string;
  incidentName: string;
}) {
  const { t } = useTranslation();
  const [openIncidentIds, setOpenIncidentIds] = useState<Set<string>>(
    () => new Set(resources.filter((r) => r.incidentId !== incidentId).map((r) => r.incidentId)),
  );
  const [openFormationIds, setOpenFormationIds] = useState<Set<string>>(
    () =>
      new Set(
        resources
          .filter((r) => r.incidentId === incidentId)
          .map((r) => `${incidentId}:${r.formation}`),
      ),
  );
  const [openHomeLocationIds, setOpenHomeLocationIds] = useState<Set<string>>(
    () =>
      new Set(
        resources
          .filter((r) => r.incidentId === incidentId)
          .map((r) => `${incidentId}:${r.formation}:${r.homeLocation?.name ?? "__none__"}`),
      ),
  );
  const [openResourceIds, setOpenResourceIds] = useState<Set<string>>(new Set());
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));

  const incidentGroups = buildIncidentResourceGroups({
    resources,
    incidentId,
    incidentName,
    sourceLabels,
  });

  const toggleIncident = (id: string) =>
    setOpenIncidentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleFormation = (id: string) =>
    setOpenFormationIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleHomeLocation = (id: string) =>
    setOpenHomeLocationIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleResource = (id: string) =>
    setOpenResourceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="min-w-full text-xs">
        <thead className="bg-bg-elevated">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold text-fg-muted">{t("resources")}</th>
            <th className="px-2 py-1.5 text-right font-semibold text-fg-muted">
              {t("resource.fields.personnelCount")}
            </th>
            <th className="px-2 py-1.5 text-left font-semibold text-fg-muted">
              {t("resource.fields.status")}
            </th>
            <th className="px-2 py-1.5 text-left font-semibold text-fg-muted">
              {t("resource.fields.reachability")}
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-fg-muted">
              {t("resource.alertedAt")}
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-fg-muted">
              {t("resource.readyAt")}
            </th>
            <th className="px-2 py-1.5 text-center font-semibold text-fg-muted">
              {t("resource.deployedAt")}
            </th>
            <th className="px-2 py-1.5 text-left font-semibold text-fg-muted">
              {t("resource.relievedAt")}
            </th>
            <th className="px-2 py-1.5 text-left font-semibold text-fg-muted">
              {t("resource.fields.hauptaufgabe")}
            </th>
            <th className="px-2 py-1.5 text-left font-semibold text-fg-muted">
              {t("resource.fields.deploymentLocation")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {incidentGroups.map((group) => {
            const incidentOpen =
              group.incidentId === incidentId || openIncidentIds.has(group.incidentId);

            return (
              <Fragment key={group.incidentId}>
                <tr className="bg-bg-elevated/70 hover:bg-bg-elevated">
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 text-left"
                      aria-label={group.incidentName}
                      onClick={() => toggleIncident(group.incidentId)}
                    >
                      <FontAwesomeIcon
                        icon={incidentOpen ? faChevronDown : faChevronRight}
                        className="w-3 shrink-0 text-xs text-fg-muted/60"
                      />
                      <span className="font-semibold text-fg">{group.incidentName}</span>
                      {sourceLabels[group.incidentId] && (
                        <Tag variant="primary" light size="sm">
                          {t("resource.childIncident")}
                        </Tag>
                      )}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-fg tabular-nums">
                    {totalPersonnel(group.resources)}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadges totals={personnelByStatus(group.resources)} />
                  </td>
                  <td className="px-2 py-1.5" colSpan={7} />
                </tr>

                {incidentOpen &&
                  group.formationGroups.map((formationGroup) => {
                    const formationKey = `${group.incidentId}:${formationGroup.formation}`;
                    const formationOpen = openFormationIds.has(formationKey);
                    const partnerIcon = FORMATION_ICON[formationGroup.formation];

                    return (
                      <Fragment key={formationKey}>
                        <tr className="hover:bg-bg-elevated/40">
                          <td className="px-2 py-1.5 pl-6">
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 text-left"
                              aria-label={t(`resource.formation.${formationGroup.formation}`)}
                              onClick={() => toggleFormation(formationKey)}
                            >
                              <FontAwesomeIcon
                                icon={formationOpen ? faChevronDown : faChevronRight}
                                className="w-3 shrink-0 text-xs text-fg-muted/60"
                              />
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-bg">
                                {iconsLoaded ? (
                                  <BabsIcon icon={partnerIcon} size={20} fallback={null} />
                                ) : (
                                  <span className="text-[10px] font-bold text-fg-muted">
                                    {formationGroup.formation}
                                  </span>
                                )}
                              </span>
                              <span className="font-medium text-fg">
                                {t(`resource.formation.${formationGroup.formation}`)}
                              </span>
                            </button>
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium text-fg tabular-nums">
                            {totalPersonnel(formationGroup.resources)}
                          </td>
                          <td className="px-2 py-1.5">
                            <StatusBadges totals={personnelByStatus(formationGroup.resources)} />
                          </td>
                          <td className="px-2 py-1.5" colSpan={7} />
                        </tr>

                        {formationOpen &&
                          formationGroup.homeLocationGroups.map((homeLocationGroup) => {
                            const homeLocationKey = `${formationKey}:${homeLocationGroup.homeLocation ?? "__none__"}`;
                            const homeLocationOpen = openHomeLocationIds.has(homeLocationKey);

                            return (
                              <Fragment key={homeLocationKey}>
                                <tr className="hover:bg-bg-elevated/40">
                                  <td className="px-2 py-1.5 pl-12">
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 text-left"
                                      aria-label={homeLocationGroup.homeLocation ?? "–"}
                                      onClick={() => toggleHomeLocation(homeLocationKey)}
                                    >
                                      <FontAwesomeIcon
                                        icon={homeLocationOpen ? faChevronDown : faChevronRight}
                                        className="w-3 shrink-0 text-xs text-fg-muted/60"
                                      />
                                      <span className="font-medium text-fg">
                                        {homeLocationGroup.homeLocation ?? "–"}
                                      </span>
                                    </button>
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-medium text-fg tabular-nums">
                                    {totalPersonnel(homeLocationGroup.resources)}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <StatusBadges
                                      totals={personnelByStatus(homeLocationGroup.resources)}
                                    />
                                  </td>
                                  <td className="px-2 py-1.5" colSpan={7} />
                                </tr>

                                {homeLocationOpen &&
                                  [...homeLocationGroup.resources]
                                    .sort((a, b) => a.alertedAt.localeCompare(b.alertedAt))
                                    .flatMap((r) => {
                                      const babsId = combinedBabsId(r.formation, r.size);
                                      const successor = r.successorId
                                        ? resourceById.get(r.successorId)
                                        : undefined;
                                      const historyOpen = openResourceIds.has(r.id);
                                      return [
                                        <tr key={r.id} className="hover:bg-bg-elevated/40">
                                          <td className="px-2 py-1.5 pl-18">
                                            <span className="flex items-center gap-2">
                                              {r.deploymentHistory.length > 1 && (
                                                <button
                                                  type="button"
                                                  className="shrink-0 text-fg-muted/60"
                                                  aria-label={
                                                    r.name || t(`resource.size.${r.size}`)
                                                  }
                                                  onClick={() => toggleResource(r.id)}
                                                >
                                                  <FontAwesomeIcon
                                                    icon={
                                                      historyOpen ? faChevronDown : faChevronRight
                                                    }
                                                    className="w-3"
                                                  />
                                                </button>
                                              )}
                                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-bg">
                                                {babsId && iconsLoaded ? (
                                                  <BabsIcon
                                                    icon={babsId}
                                                    size={20}
                                                    fallback={null}
                                                  />
                                                ) : (
                                                  <span className="text-[10px] font-bold text-fg-muted">
                                                    {r.formation}
                                                  </span>
                                                )}
                                              </span>
                                              <span className="font-medium text-fg">
                                                {r.name || t(`resource.size.${r.size}`)}
                                              </span>
                                            </span>
                                          </td>
                                          <td className="px-2 py-1.5 text-right text-fg tabular-nums">
                                            {r.personnelCount}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            <div className="flex flex-wrap gap-1">
                                              <Tag
                                                variant={statusVariant[r.status]}
                                                light
                                                size="sm"
                                              >
                                                {t(`resource.status.${r.status}`)}
                                              </Tag>
                                            </div>
                                          </td>
                                          <td className="max-w-[12rem] truncate px-2 py-1.5 text-fg">
                                            {r.contact
                                              ? `${t(`medium.${r.contact.medium}`)}${r.contact.detail ? `: ${r.contact.detail}` : ""}`
                                              : "–"}
                                          </td>
                                          <td className="px-2 py-1.5 text-center text-fg tabular-nums">
                                            {formatDateTime(r.alertedAt)}
                                          </td>
                                          <td className="px-2 py-1.5 text-center text-fg tabular-nums">
                                            {formatDateTime(r.readyAt)}
                                          </td>
                                          <td className="px-2 py-1.5 text-center text-fg tabular-nums">
                                            {formatDateTime(r.deployedAt)}
                                          </td>
                                          <td className="px-2 py-1.5 text-left text-fg tabular-nums">
                                            {formatDateTime(r.relievedAt)}
                                            {r.status === "ABGELOEST" && successor && (
                                              <span className="block text-left text-xs font-normal text-fg-muted">
                                                {t("resource.fields.relievedThrough")}:{" "}
                                                {[
                                                  [
                                                    t(`resource.formation.${successor.formation}`),
                                                    successor.homeLocation?.name,
                                                  ]
                                                    .filter(Boolean)
                                                    .join(" "),
                                                  successor.name ||
                                                    t(`resource.size.${successor.size}`),
                                                ]
                                                  .filter(Boolean)
                                                  .join(", ")}
                                              </span>
                                            )}
                                          </td>
                                          <td className="max-w-[12rem] truncate px-2 py-1.5 text-fg">
                                            {r.hauptaufgabe || "–"}
                                          </td>
                                          <td className="max-w-[10rem] truncate px-2 py-1.5 text-fg">
                                            {r.deploymentLocation?.label || "–"}
                                          </td>
                                        </tr>,
                                        ...(historyOpen ? r.deploymentHistory : []).map(
                                          (period, index) => (
                                            <ResourceTableRow
                                              key={`${r.id}-${period.startedAt}-${index}`}
                                              resource={r}
                                              period={period}
                                              iconsLoaded={iconsLoaded}
                                            />
                                          ),
                                        ),
                                      ];
                                    })}
                              </Fragment>
                            );
                          })}
                      </Fragment>
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function List() {
  const { incidentId } = useParams();
  const { t, i18n } = useTranslation();
  const iconsLoaded = useBabsIcons();
  const result = useIncidentResources(incidentId);

  if (result.status === "loading") return <Spinner />;

  if (result.status === "error") {
    return (
      <div>
        <PageTitle>{t("resources")}</PageTitle>
        <Notification variant="danger">{t(`errors.${result.error.code}`)}</Notification>
      </div>
    );
  }

  const allResources = result.data.resources;
  const sourceLabels = Object.fromEntries(
    result.data.childIncidents.map((child) => [child.id, child.name]),
  );

  return (
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      <div className="space-y-3">
        <PageTitle>{t("resources")}</PageTitle>
        {allResources.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("resource.noResources")}</p>
        ) : (
          <>
            <FormationKpis resources={allResources} iconsLoaded={iconsLoaded} />
            <div className="space-y-2 pt-2">
              <h2 className="text-sm font-semibold text-fg">{t("resource.mitteltabelle")}</h2>
              <Mitteltabelle
                resources={allResources}
                iconsLoaded={iconsLoaded}
                sourceLabels={sourceLabels}
                incidentId={result.data.incidentId}
                incidentName={result.data.incidentName}
              />
            </div>
          </>
        )}
      </div>
    </BabsIconProvider>
  );
}

export default List;
