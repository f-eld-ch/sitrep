/* eslint-disable jsx-a11y/control-has-associated-label -- filler cells in history rows have no content by design */
import dayjs from "dayjs";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import type { Resource, ResourceDeploymentPeriod } from "api";
import { qualifiedFormation } from "views/journal/TriageView";

interface ResourceTableProps {
  resources: Resource[];
  incidentName?: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  return dayjs(iso).format("DD.MM.YYYY HH:mm");
}

function deploymentLabel(r: Resource): string {
  const ongoing = r.deploymentHistory.find((p) => p.endedAt === null);
  if (ongoing) return r.deploymentLocation?.label ?? ongoing.deploymentLabel ?? "–";
  return r.deploymentLocation?.label || "–";
}

function ResourcePrimaryRow({
  r,
  primaryPeriod,
}: {
  r: Resource;
  primaryPeriod: ResourceDeploymentPeriod | null;
}) {
  const { t } = useTranslation();
  const deployedAt = primaryPeriod ? primaryPeriod.startedAt : r.deployedAt;
  const relievedAt = primaryPeriod?.endedAt ?? (primaryPeriod === null ? r.relievedAt : null);
  const hauptaufgabe = primaryPeriod ? primaryPeriod.hauptaufgabe || "–" : r.hauptaufgabe || "–";
  const location = primaryPeriod?.endedAt
    ? primaryPeriod.deploymentLabel || "–"
    : deploymentLabel(r);
  return (
    <tr>
      <td className="py-0.5 pr-2">
        {qualifiedFormation(t(`resource.formation.${r.formation}`), r.homeLocation?.name)}
      </td>
      <td className="py-0.5 pr-2 font-medium">{r.name || "–"}</td>
      <td className="py-0.5 pr-2 text-right tabular-nums">{r.personnelCount}</td>
      <td className="py-0.5 pr-2">{t(`resource.status.${r.status}`)}</td>
      <td className="py-0.5 pr-2 text-nowrap tabular-nums">{formatDate(r.alertedAt)}</td>
      <td className="py-0.5 pr-2 text-nowrap tabular-nums">{formatDate(r.readyAt)}</td>
      <td className="py-0.5 pr-2 text-nowrap tabular-nums">{formatDate(deployedAt)}</td>
      <td className="py-0.5 pr-2 text-nowrap tabular-nums">{formatDate(relievedAt)}</td>
      <td className="max-w-[8rem] py-0.5 pr-2">{hauptaufgabe}</td>
      <td className="max-w-[8rem] py-0.5">{location}</td>
    </tr>
  );
}

function ResourceHistoryRow({ period }: { period: ResourceDeploymentPeriod }) {
  return (
    <tr className="text-fg-muted">
      <td className="py-0.5 pr-2" />
      <td className="py-0.5 pr-2" />
      <td className="py-0.5 pr-2" />
      <td className="py-0.5 pr-2" />
      <td className="py-0.5 pr-2" />
      <td className="py-0.5 pr-2" />
      <td className="py-0.5 pr-2 text-nowrap tabular-nums">{formatDate(period.startedAt)}</td>
      <td className="py-0.5 pr-2 text-nowrap tabular-nums">{formatDate(period.endedAt)}</td>
      <td className="max-w-[8rem] py-0.5 pr-2">{period.hauptaufgabe || "–"}</td>
      <td className="max-w-[8rem] py-0.5">{period.deploymentLabel || "–"}</td>
    </tr>
  );
}

const ResourceTable = (props: ResourceTableProps, ref: React.Ref<HTMLDivElement>) => {
  const { t } = useTranslation();
  const { resources, incidentName } = props;

  const sorted = [...resources].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <div ref={ref} className="p-4 text-[10px]">
      <h1 className="mb-1 text-sm font-bold">
        {t("resource.mitteltabelle")}
        {incidentName ? ` — ${incidentName}` : ""}
      </h1>
      <p className="mb-3 text-[10px] text-gray-500">
        {t("state")}: {dayjs().format("DD.MM.YYYY HH:mm")}
      </p>

      <table className="w-full border-collapse [&_td]:border-b [&_td]:border-gray-200 [&_th]:border-b [&_th]:border-gray-400 [&_th]:py-0.5 [&_th]:pr-2 [&_th]:text-left [&_th]:font-semibold">
        <thead>
          <tr>
            <th>{t("resource.fields.partner")}</th>
            <th>{t("resource.fields.name")}</th>
            <th className="text-right">{t("resource.fields.personnelCount")}</th>
            <th>{t("resource.fields.status")}</th>
            <th>{t("resource.alertedAt")}</th>
            <th>{t("resource.readyAt")}</th>
            <th>{t("resource.deployedAt")}</th>
            <th>{t("resource.relievedAt")}</th>
            <th>{t("resource.fields.hauptaufgabe")}</th>
            <th>{t("resource.fields.deploymentLocation")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const completed = r.deploymentHistory.filter((p) => p.endedAt !== null);
            const ongoing = r.deploymentHistory.find((p) => p.endedAt === null) ?? null;
            // For EINGESETZT: ongoing period is primary; all completed periods are history.
            // For ABGELOEST/others: most recent completed period is primary; earlier ones are history.
            const primaryPeriod =
              ongoing ??
              (completed.length > 0
                ? completed.reduce((latest, p) =>
                    new Date(p.startedAt) > new Date(latest.startedAt) ? p : latest,
                  )
                : null);
            const historyPeriods = completed.filter((p) => p !== primaryPeriod);
            return (
              <>
                <ResourcePrimaryRow key={r.id} r={r} primaryPeriod={primaryPeriod} />
                {historyPeriods.map((period, i) => (
                  <ResourceHistoryRow key={`${r.id}-${i}`} period={period} />
                ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default forwardRef(ResourceTable);
