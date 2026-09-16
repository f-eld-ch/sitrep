import { Spinner } from "components";
import { Notification, PageTitle, Tag } from "components/ui";
import { useIncidentMessages, useIncidentResources } from "api";
import type { Resource, ResourceFormation, ResourceStatus, SchadenplatzWithResources } from "api";
import { BabsIcon, BabsIconProvider } from "@f-eld-ch/babs-react";
import { useBabsIcons } from "components/babs/useBabsIcons";
import { Map as IncidentMap } from "views/map";
import { MessageStack } from "views/journal/MessageStack";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { PriorityStatus } from "types";
import { useState } from "react";

const RESOURCE_STATUS_ORDER: ResourceStatus[] = ["AUFGEBOTEN", "EINSATZBEREIT", "EINGESETZT", "ABGELOEST"];
const FORMATION_ORDER: ResourceFormation[] = ["FW", "SAN", "POL", "ZS", "TECHNB", "ARMEE", "OTHER"];
const FORMATION_ICON: Record<ResourceFormation, string> = {
  FW: "4702", SAN: "4703", ZS: "4704", POL: "4701",
  TECHNB: "4705", ARMEE: "4706", OTHER: "4802",
};

type CasualtyTotals = SchadenplatzWithResources["casualties"];

type CasualtyCategory = {
  key: keyof CasualtyTotals;
  labelKey: string;
  babsId: string;
};

const CASUALTY_CATEGORIES: CasualtyCategory[] = [
  { key: "tote",            labelKey: "casualties.tote",            babsId: "1305" },
  { key: "verletzte",       labelKey: "casualties.verletzte",       babsId: "1301" },
  { key: "vermisste",       labelKey: "casualties.vermisste",       babsId: "1302" },
  { key: "eingeschlossene", labelKey: "casualties.eingeschlossene", babsId: "1304" },
  { key: "obdachlose",      labelKey: "casualties.obdachlose",      babsId: "1303" },
];

const ZERO_CASUALTIES: CasualtyTotals = {
  vermisste: 0,
  tote: 0,
  verletzte: 0,
  obdachlose: 0,
  eingeschlossene: 0,
};

function addCasualties(left: CasualtyTotals, right: CasualtyTotals): CasualtyTotals {
  return {
    vermisste: left.vermisste + right.vermisste,
    tote: left.tote + right.tote,
    verletzte: left.verletzte + right.verletzte,
    obdachlose: left.obdachlose + right.obdachlose,
    eingeschlossene: left.eingeschlossene + right.eingeschlossene,
  };
}

function casualtyTotals(resourcesResult: ReturnType<typeof useIncidentResources>): CasualtyTotals {
  if (resourcesResult.status !== "ready") return ZERO_CASUALTIES;

  const ownTotals = resourcesResult.data.schadenplaetze
    .filter((sp) => !sp.isMerged)
    .reduce((acc, sp) => addCasualties(acc, sp.casualties), ZERO_CASUALTIES);
  const childTotals = resourcesResult.data.childIncidents.reduce(
    (acc, child) => addCasualties(acc, child.casualties),
    ZERO_CASUALTIES,
  );

  return addCasualties(ownTotals, childTotals);
}

function resourcesByFormation(resources: Resource[]) {
  return FORMATION_ORDER.map((formation) => ({
    formation,
    resources: resources.filter((resource) => resource.formation === formation),
  })).filter((group) => group.resources.length > 0);
}

function personnelByStatus(resources: Resource[]) {
  return RESOURCE_STATUS_ORDER.map((status) => ({
    status,
    total: resources
      .filter((resource) => resource.status === status)
      .reduce((sum, resource) => sum + resource.personnelCount, 0),
  })).filter((row) => row.total > 0);
}

function totalPersonnel(resources: Resource[]) {
  return resources.reduce((sum, resource) => sum + resource.personnelCount, 0);
}

function PriorityMessageStack({ incidentId }: { incidentId: string }) {
  const { t } = useTranslation();
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>(undefined);
  const result = useIncidentMessages(incidentId);

  if (result.status === "loading") return <Spinner />;
  if (result.status === "error") {
    return <Notification variant="danger">{t(`errors.${result.error.code}`)}</Notification>;
  }

  const messages = result.data.messages.filter((message) => message.priorityId === PriorityStatus.High);

  return (
    <section className="flex min-h-0 flex-col rounded border border-border bg-bg-elevated">
      <header className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-fg">{t("dashboard.priorityMessages")}</h2>
      </header>
      <MessageStack
        messages={messages}
        effectiveId={selectedMessageId}
        onSelect={setSelectedMessageId}
        className="min-h-0 w-full flex-1 shrink lg:w-full"
      />
    </section>
  );
}

function DashboardKpis({ resourcesResult, iconsLoaded }: {
  resourcesResult: ReturnType<typeof useIncidentResources>;
  iconsLoaded: boolean;
}) {
  const { t } = useTranslation();

  if (resourcesResult.status === "loading") return <Spinner />;
  if (resourcesResult.status === "error") {
    return <Notification variant="danger">{t(`errors.${resourcesResult.error.code}`)}</Notification>;
  }

  const casualties = casualtyTotals(resourcesResult);
  const formationGroups = resourcesByFormation(resourcesResult.data.resources);

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <section className="rounded border border-border bg-bg-elevated p-3">
        <h2 className="mb-3 text-sm font-semibold text-fg">{t("casualties.overview")}</h2>
        <div className="space-y-2">
          {CASUALTY_CATEGORIES.map((cat) => (
            <div key={cat.key} className="flex items-center gap-2 rounded border border-border bg-bg px-2 py-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                {iconsLoaded ? <BabsIcon icon={cat.babsId} size={24} fallback={null} /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{t(cat.labelKey)}</span>
              <span className="text-lg font-bold tabular-nums text-danger">{casualties[cat.key]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-border bg-bg-elevated p-3">
        <h2 className="mb-3 text-sm font-semibold text-fg">{t("resources")}</h2>
        <div className="space-y-2">
          {formationGroups.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("resource.noResources")}</p>
          ) : (
            formationGroups.map((group) => (
              <div key={group.formation} className="rounded border border-border bg-bg p-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                    {iconsLoaded ? (
                      <BabsIcon icon={FORMATION_ICON[group.formation]} size={24} fallback={null} />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                    {t(`resource.formation.${group.formation}`)}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-fg">
                    {totalPersonnel(group.resources)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {personnelByStatus(group.resources).map((row) => (
                    <Tag key={row.status} light size="sm">
                      {row.total} {t(`resource.status.${row.status}`)}
                    </Tag>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}

export default function Dashboard() {
  const { incidentId } = useParams();
  const { t, i18n } = useTranslation();
  const resourcesResult = useIncidentResources(incidentId);
  const iconsLoaded = useBabsIcons();

  if (!incidentId) return <Spinner />;

  return (
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <PageTitle className="shrink-0">{t("dashboard.title")}</PageTitle>
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[22rem_minmax(0,1fr)_18rem]">
          <PriorityMessageStack incidentId={incidentId} />
          <section className="min-h-[24rem] overflow-hidden rounded border border-border bg-bg-elevated xl:min-h-0">
            <IncidentMap embedded readOnly />
          </section>
          <DashboardKpis resourcesResult={resourcesResult} iconsLoaded={iconsLoaded} />
        </div>
      </div>
    </BabsIconProvider>
  );
}
