import { Spinner } from "components";
import { Notification, PageTitle, Tag } from "components/ui";
import { useIncidentMessages, useIncidentResources } from "api";
import type { Resource, ResourceFormation, ResourceStatus } from "api";
import { BabsIcon, BabsIconProvider } from "@f-eld-ch/babs-react";
import { useBabsIcons } from "components/babs/useBabsIcons";
import { Map as IncidentMap } from "views/map";
import { FilterableMessageStack } from "views/journal/FilterableMessageStack";
import JournalMessage from "views/journal/Message";
import { CasualtyList } from "views/casualties/CasualtyList";
import { ZERO_CASUALTIES, addCasualties, type CasualtyTotals } from "views/casualties/categories";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { Message } from "types/journal";
import { clsx } from "clsx";
import dayjs from "dayjs";
import { useContext, useState } from "react";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { PriorityStatus } from "types";
import { buildMessageList } from "views/journal/listUtils";
import { IncidentContext } from "utils";
import { TimelineSlider } from "views/map/controls/TimelineSlider";
import { useFeatureMessageIds } from "views/map/useFeatureMessageIds";
import { deployedPersonnel } from "views/resource/personnel";

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

function PriorityMessageStack({
  messages,
  selectedMessageId,
  onSelect,
  focusMessageIds,
  onClearFocus,
}: {
  messages: Message[];
  selectedMessageId: string | undefined;
  onSelect: (id: string | undefined) => void;
  /** Messages of the feature selected on the map; they replace the stack's own filters. */
  focusMessageIds: string[] | undefined;
  onClearFocus: () => void;
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
        focusMessageIds={focusMessageIds}
        onClearFocus={onClearFocus}
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
    <aside
      aria-busy={resourcesResult.isRefreshing}
      className={clsx(
        "flex min-h-0 flex-col gap-3 overflow-y-auto transition-opacity duration-300",
        // The previous values stay in place, dimmed, until the new ones fade in.
        resourcesResult.isRefreshing && "opacity-50",
      )}
    >
      <section className="rounded border border-border bg-bg-elevated p-3">
        <h2 className="mb-3 text-sm font-semibold text-fg">{t("casualties.overview")}</h2>
        <CasualtyList totals={casualties} iconsLoaded={iconsLoaded} />
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
                      {deployedPersonnel(group.resources)}
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
  // The point in time the whole dashboard shows; undefined is live.
  const [asOf, setAsOf] = useState<Date | undefined>();
  const resourcesResult = useIncidentResources(incidentId, asOf);
  const messagesResult = useIncidentMessages(incidentId ?? "");
  const { state: incidentState } = useContext(IncidentContext);
  const showTimeline = useBooleanFlagValue("new-triage-view", false);
  // The feature selected on the map: its messages take over the stack until it is deselected.
  const [focusFeatureId, setFocusFeatureId] = useState<string | undefined>();
  const [deselectToken, setDeselectToken] = useState(0);
  const featureMessageIds = useFeatureMessageIds(focusFeatureId);
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

  // Messages that existed at the shown point in time; later ones appear as the slider moves on.
  const allMessages = (
    messagesResult.status === "ready" ? messagesResult.data.messages : []
  ).filter((message) => asOf === undefined || message.time.getTime() <= asOf.getTime());

  // Messages carry the time of the event they report, which can precede the incident's record
  // (recorded late), so the slider starts at the earliest of the two.
  const earliestMessage = (
    messagesResult.status === "ready" ? messagesResult.data.messages : []
  ).reduce<Date | undefined>(
    (earliest, message) =>
      earliest === undefined || message.time < earliest ? message.time : earliest,
    undefined,
  );
  const timelineStart = [incidentState.incident?.createdAt, earliestMessage]
    .filter((date): date is Date => date !== undefined)
    .reduce<Date | undefined>(
      (earliest, date) => (earliest === undefined || date < earliest ? date : earliest),
      undefined,
    );

  const keyMessages = buildMessageList(allMessages, {
    triage: "triaged_only",
    priority: PriorityStatus.High,
    assignment: "all",
    author: "all",
  });

  const latestKeyMessage = keyMessages[0];

  const latestKeyMessageId = latestKeyMessage?.id;

  // Auto-select only if the latest key message arrived within the last 30 minutes of the shown
  // point in time. dayjs() is evaluated on each render; messagesResult updates keep this fresh.
  const isLatestStale =
    latestKeyMessage != null && dayjs(asOf).diff(dayjs(latestKeyMessage.time), "minute") > 30;

  // With a feature selected the newest of its messages is shown, unless one was picked in the stack.
  const [focusPick, setFocusPick] = useState<{ featureId: string; messageId: string } | null>(null);
  const focusedMessages =
    featureMessageIds === undefined
      ? undefined
      : buildMessageList(
          allMessages.filter((message) => featureMessageIds.includes(message.id)),
          { triage: "all", priority: "all", assignment: "all", author: "all" },
        );

  const effectiveSelectedId = (() => {
    if (focusedMessages !== undefined) {
      const picked =
        focusPick?.featureId === focusFeatureId
          ? focusedMessages.find((message) => message.id === focusPick?.messageId)
          : undefined;

      return (picked ?? focusedMessages[0])?.id;
    }

    if (userOverride !== null && userOverride.keyId === latestKeyMessageId) {
      // Honour explicit user selection or explicit deselection (null).
      return userOverride.selectedId ?? undefined;
    }
    // Auto-select: skip if the message is older than 30 minutes.
    return isLatestStale ? undefined : latestKeyMessageId;
  })();

  const handleSelect = (id: string | undefined) => {
    if (focusedMessages !== undefined && focusFeatureId !== undefined) {
      setFocusPick(id === undefined ? null : { featureId: focusFeatureId, messageId: id });
      return;
    }

    setUserOverride({ keyId: latestKeyMessageId, selectedId: id ?? null });
  };

  const clearFocus = () => {
    setFocusFeatureId(undefined);
    setDeselectToken((token) => token + 1);
  };

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
                focusMessageIds={featureMessageIds}
                onClearFocus={clearFocus}
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
              <IncidentMap
                embedded
                readOnly
                asOf={asOf}
                onFeatureSelect={setFocusFeatureId}
                deselectToken={deselectToken}
              />
            </div>
            {showTimeline && (
              <TimelineSlider
                framed={false}
                asOf={asOf}
                onAsOfChange={setAsOf}
                start={timelineStart}
                tickTimes={keyMessages.map((message) => message.time.getTime())}
              />
            )}
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
