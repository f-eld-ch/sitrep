import { Spinner } from "components";
import { Notification, PageTitle, Tag } from "components/ui";
import { useIncidentMessages, useIncidentResources } from "api";
import type { Resource, ResourceFormation, ResourceStatus, SchadenplatzWithResources } from "api";
import { BabsIcon, BabsIconProvider } from "@f-eld-ch/babs-react";
import { useBabsIcons } from "components/babs/useBabsIcons";
import { Map as IncidentMap } from "views/map";
import { FilterableMessageStack } from "views/journal/FilterableMessageStack";
import JournalMessage from "views/journal/Message";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Message } from "types/journal";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { PriorityStatus } from "types";
import { buildMessageList } from "views/journal/listUtils";

const RESOURCE_STATUS_ORDER: ResourceStatus[] = [
  "AUFGEBOTEN",
  "EINSATZBEREIT",
  "EINGESETZT",
  "ABGELOEST",
];
const FORMATION_ORDER: ResourceFormation[] = ["FW", "SAN", "POL", "ZS", "TECHNB", "ARMEE", "OTHER"];
const FORMATION_ICON: Record<ResourceFormation, string> = {
  FW: "4702",
  SAN: "4703",
  ZS: "4704",
  POL: "4701",
  TECHNB: "4705",
  ARMEE: "4706",
  OTHER: "4802",
};

type CasualtyTotals = SchadenplatzWithResources["casualties"];

type CasualtyCategory = {
  key: keyof CasualtyTotals;
  labelKey: string;
  babsId: string;
};

const CASUALTY_CATEGORIES: CasualtyCategory[] = [
  { key: "tote", labelKey: "casualties.tote", babsId: "1305" },
  { key: "verletzte", labelKey: "casualties.verletzte", babsId: "1301" },
  { key: "vermisste", labelKey: "casualties.vermisste", babsId: "1302" },
  { key: "eingeschlossene", labelKey: "casualties.eingeschlossene", babsId: "1304" },
  { key: "obdachlose", labelKey: "casualties.obdachlose", babsId: "1303" },
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
    resources: resources.filter(
      (resource) => resource.formation === formation && resource.status !== "ABGELOEST",
    ),
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

function PriorityMessageStack({
  messages,
  selectedMessageId,
  onSelect,
}: {
  messages: Message[];
  selectedMessageId: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      <FilterableMessageStack
        messages={messages}
        effectiveId={selectedMessageId}
        onSelect={onSelect}
        initialFilters={{ highPriority: true }}
        enabledFilters={{ untriaged: false, mine: false }}
        baseFilter={{ triage: "triaged_only" }}
        className="min-h-0 w-full flex-1 shrink"
      />
    </section>
  );
}

function DashboardKpis({
  resourcesResult,
  iconsLoaded,
}: {
  resourcesResult: ReturnType<typeof useIncidentResources>;
  iconsLoaded: boolean;
}) {
  const { t } = useTranslation();

  if (resourcesResult.status === "loading") return <Spinner />;
  if (resourcesResult.status === "error") {
    return (
      <Notification variant="danger">{t(`errors.${resourcesResult.error.code}`)}</Notification>
    );
  }

  const casualties = casualtyTotals(resourcesResult);
  const formationGroups = resourcesByFormation(resourcesResult.data.resources);

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <section className="rounded border border-border bg-bg-elevated p-3">
        <h2 className="mb-3 text-sm font-semibold text-fg">{t("casualties.overview")}</h2>
        <div className="space-y-2">
          {CASUALTY_CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              className="flex items-center gap-2 rounded border border-border px-2 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">
                {t(cat.labelKey)}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="flex h-8 w-8 items-center justify-center">
                  {iconsLoaded ? <BabsIcon icon={cat.babsId} size={24} fallback={null} /> : null}
                </span>
                <span className="text-lg font-bold text-danger tabular-nums">
                  {casualties[cat.key]}
                </span>
              </span>
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
              <div key={group.formation} className="rounded border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">
                    {t(`resource.formation.${group.formation}`)}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="flex h-8 w-8 items-center justify-center">
                      {iconsLoaded ? (
                        <BabsIcon
                          icon={FORMATION_ICON[group.formation]}
                          size={24}
                          fallback={null}
                        />
                      ) : null}
                    </span>
                    <span className="text-lg font-bold text-fg tabular-nums">
                      {totalPersonnel(group.resources)}
                    </span>
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
  const messagesResult = useIncidentMessages(incidentId ?? "");
  const iconsLoaded = useBabsIcons();
  const showResources = useBooleanFlagValue("show-resources", false);
  // Tracks a user's explicit selection together with the key message that was
  // active when they made it. If a new key message arrives (keyId changes),
  // the override is invalidated and we fall back to the latest key message.
  // selectedId === null means the user explicitly deselected.
  const [userOverride, setUserOverride] = useState<{
    keyId: string | undefined;
    selectedId: string | null;
  } | null>(null);

  const allMessages = messagesResult.status === "ready" ? messagesResult.data.messages : [];

  const latestKeyMessage = useMemo(() => {
    const messages = messagesResult.status === "ready" ? messagesResult.data.messages : [];
    const keyMessages = buildMessageList(messages, {
      triage: "triaged_only",
      priority: PriorityStatus.High,
      assignment: "all",
      author: "all",
    });
    return keyMessages[0];
  }, [messagesResult]);

  const latestKeyMessageId = latestKeyMessage?.id;

  // Auto-select only if the latest key message arrived within the last 30 minutes.
  // dayjs() is evaluated on each render; messagesResult updates keep this fresh.
  const isLatestStale =
    latestKeyMessage != null && dayjs().diff(dayjs(latestKeyMessage.time), "minute") > 30;

  const effectiveSelectedId = (() => {
    if (userOverride !== null && userOverride.keyId === latestKeyMessageId) {
      // Honour explicit user selection or explicit deselection (null).
      return userOverride.selectedId ?? undefined;
    }
    // Auto-select: skip if the message is older than 30 minutes.
    return isLatestStale ? undefined : latestKeyMessageId;
  })();

  const handleSelect = (id: string | undefined) =>
    setUserOverride({ keyId: latestKeyMessageId, selectedId: id ?? null });

  const title =
    resourcesResult.status === "ready"
      ? `${t("incident")} ${resourcesResult.data.incidentName}`
      : t("dashboard.title");

  if (!incidentId) return <Spinner />;

  const selectedMessage = allMessages.find((message) => message.id === effectiveSelectedId);

  return (
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      <div className="flex flex-1 flex-col pt-[3.5rem] pr-3 pb-3 xl:min-h-0">
        <PageTitle className="mb-0 shrink-0 pl-3">{title}</PageTitle>
        <div className="grid gap-1 xl:min-h-0 xl:flex-1 xl:grid-cols-[28rem_minmax(0,1fr)_18rem]">
          {/* Message stack — last on mobile, first column on desktop */}
          <div className="order-3 flex min-h-0 flex-col xl:order-1">
            {messagesResult.status === "loading" ? (
              <Spinner />
            ) : messagesResult.status === "error" ? (
              <Notification variant="danger">
                {t(`errors.${messagesResult.error.code}`)}
              </Notification>
            ) : (
              <PriorityMessageStack
                messages={allMessages}
                selectedMessageId={effectiveSelectedId}
                onSelect={handleSelect}
              />
            )}
          </div>
          {/* Map — second on mobile, middle column on desktop */}
          <section className="order-2 flex min-h-[24rem] min-w-0 flex-col gap-3 xl:order-2 xl:min-h-0 xl:pt-[28px]">
            {selectedMessage && (
              <div className="max-h-[38vh] shrink-0 overflow-y-auto rounded bg-bg-elevated">
                <JournalMessage
                  id={selectedMessage.id}
                  incidentId={incidentId}
                  message={selectedMessage}
                  divisions={selectedMessage.divisions.map((entry) => entry.division)}
                  showControls={false}
                  stabilizeActionBar
                />
              </div>
            )}
            <div className="min-h-[18rem] flex-1 overflow-hidden rounded border border-border bg-bg-elevated">
              <IncidentMap embedded readOnly />
            </div>
          </section>
          {/* KPIs — first on mobile, last column on desktop */}
          {showResources && (
            <div className="order-1 xl:order-3 xl:pt-[28px]">
              <DashboardKpis resourcesResult={resourcesResult} iconsLoaded={iconsLoaded} />
            </div>
          )}
        </div>
      </div>
    </BabsIconProvider>
  );
}
