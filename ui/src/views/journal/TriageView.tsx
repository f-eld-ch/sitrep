import {
  faCheck,
  faChevronLeft,
  faMinus,
  faPen,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { clsx } from "clsx";
import reject from "lodash/reject";
import union from "lodash/union";
import {
  Fragment,
  Suspense,
  ViewTransition,
  lazy,
  useTransition,
  useState,
  useRef,
  useContext,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";

import { useParams } from "react-router";
import { type Division, PriorityStatus, TriageStatus } from "types";
import type { Message } from "types/journal";
import type { ResourceStatus } from "api";
import { Button, Notification, Tag } from "components/ui";
import type { TagVariant } from "components/ui/Tag";
import { Spinner } from "components";
import {
  useIncidentMessages,
  useTriageMessage,
  useIncidentResources,
  useCreateSchadenplatz,
  useMessageForTriage,
  useRecordCasualties,
  useAlertResource,
  useMarkResourceReady,
  useDeployResource,
  useHandOver,
  useStandDownResource,
  useRelieveResource,
  useReassignResource,
  useUpdateDeploymentLocation,
  useUpdateContact,
  useChangeHauptaufgabe,
} from "api";
import { ApiError, isApiError } from "api";
import type {
  SchadenplatzWithResources,
  Resource,
  ResourceFormation,
  ResourceUnitSize,
  ContactMedium,
  SchadenplatzCasualtyInput,
} from "api";
import { type MessageEditorFormHandle } from "./editorState";
import { type MessageFilters } from "./listUtils";
import { NewForm as TaskNew } from "../measures/tasks";
const MessageEditorForm = lazy(() =>
  import("./Editor").then((m) => ({ default: m.MessageEditorForm })),
);
import { default as JournalMessage } from "./Message";

import { buildMessageList } from "./listUtils";
import { FilterableMessageStack } from "./FilterableMessageStack";
import { TriageCanvas } from "./TriageCanvas";
import { IncidentContext } from "utils";
import { useBabsIcons } from "components/babs/useBabsIcons";
import { BabsIcon, BabsIconProvider } from "@f-eld-ch/babs-react";

export type InitialStrategy = "oldest-pending" | "newest" | "none";

type StepDef = { key: string; label: string };

function Stepper({
  steps,
  current,
  onChange,
}: {
  steps: StepDef[];
  current: number;
  onChange: (idx: number) => void;
}) {
  return (
    <nav
      aria-label="steps"
      className="scrollbar-none flex shrink-0 flex-col items-center border-r border-border px-3 py-4 lg:w-full lg:flex-row lg:items-center lg:gap-1 lg:overflow-x-auto lg:border-r-0 lg:px-5 lg:py-3"
    >
      {steps.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <Fragment key={step.key}>
            {idx > 0 && (
              <div
                className={clsx(
                  "w-px flex-1 lg:h-px lg:w-auto lg:min-w-2",
                  done ? "bg-primary/40" : "bg-border",
                )}
              />
            )}
            <button
              type="button"
              onClick={() => onChange(idx)}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 text-sm transition-colors",
                active
                  ? "font-semibold text-primary"
                  : done
                    ? "text-fg-muted hover:text-fg"
                    : "text-fg-muted/50 hover:text-fg-muted",
              )}
            >
              <span
                className={clsx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  active
                    ? "bg-primary text-white"
                    : done
                      ? "bg-primary/20 text-primary"
                      : "bg-border text-fg-muted",
                )}
              >
                {done ? (
                  <FontAwesomeIcon icon={faCheck} className="text-[11px]" />
                ) : (
                  <span className="translate-y-px text-xs leading-none font-bold">{idx + 1}</span>
                )}
              </span>
              <span className="hidden lg:inline">{step.label}</span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

interface ResourceSnapshot {
  status: ResourceStatus;
  personnelCount: number;
  hauptaufgabe: string;
  deploymentLabel: string | null;
  successorId: string | null;
}

function resourceStateAt(r: Resource, at: Date): ResourceSnapshot {
  const ts = at.getTime();

  // Check deployment history periods in chronological order
  const activePeriod = r.deploymentHistory.find((p) => {
    const start = new Date(p.startedAt).getTime();
    const end = p.endedAt ? new Date(p.endedAt).getTime() : Infinity;
    return ts >= start && ts < end;
  });
  if (activePeriod) {
    // For ongoing deployments (endedAt null) prefer the live resource fields —
    // the history entry's deploymentLabel was captured at deploy time and may
    // predate a subsequent updateDeploymentLocation call.
    const ongoing = activePeriod.endedAt === null;
    return {
      status: "EINGESETZT",
      personnelCount: activePeriod.personnelCount,
      hauptaufgabe: ongoing ? r.hauptaufgabe : activePeriod.hauptaufgabe,
      deploymentLabel: ongoing
        ? (r.deploymentLocation?.label ?? activePeriod.deploymentLabel ?? null)
        : (activePeriod.deploymentLabel ?? null),
      successorId: null,
    };
  }

  if (r.relievedAt && ts >= new Date(r.relievedAt).getTime()) {
    return {
      status: "ABGELOEST",
      personnelCount: r.personnelCount,
      hauptaufgabe: "",
      deploymentLabel: null,
      successorId: r.successorId ?? null,
    };
  }

  if (r.readyAt && ts >= new Date(r.readyAt).getTime()) {
    return {
      status: "EINSATZBEREIT",
      personnelCount: r.personnelCount,
      hauptaufgabe: "",
      deploymentLabel: null,
      successorId: null,
    };
  }

  return {
    status: "AUFGEBOTEN",
    personnelCount: r.personnelCount,
    hauptaufgabe: "",
    deploymentLabel: null,
    successorId: null,
  };
}

function TriageSummary(props: {
  message: Message;
  incidentId: string;
  incidentDivisions: Division[];
  casualties: SchadenplatzCasualtyInput[];
  linkedResourceIds: string[];
  schadenplaetze: SchadenplatzWithResources[];
  allResources: Resource[];
  iconsLoaded: boolean;
  onAdjust: () => void;
}) {
  const {
    message,
    incidentDivisions,
    casualties,
    linkedResourceIds,
    schadenplaetze,
    allResources,
    iconsLoaded,
    onAdjust,
  } = props;
  const { t, i18n } = useTranslation();

  // allResources is the flat incident-level list that includes ABGELOEST units;
  // fall back to schadenplaetze resources for any id not found there.
  const allResourcesById = new Map(allResources.map((r) => [r.id, r]));
  const spResources = schadenplaetze.flatMap((sp) => sp.resources);
  const linkedResources = linkedResourceIds
    .map((id) => allResourcesById.get(id) ?? spResources.find((r) => r.id === id))
    .filter(Boolean) as Resource[];

  const spCasualties = casualties
    .map((c) => {
      const sp = schadenplaetze.find((s) => s.id === c.schadenplatzId);
      return {
        ...c,
        isDefault: sp?.isDefault ?? false,
        name: sp?.name ?? "–",
      };
    })
    .filter(
      (c) =>
        c.vermisste !== 0 ||
        c.tote !== 0 ||
        c.verletzte !== 0 ||
        c.obdachlose !== 0 ||
        c.eingeschlossene !== 0,
    );
  const hasCasualties = spCasualties.length > 0;

  const assignedDivisions = message.divisions.map((d) => d.division);

  return (
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Message card */}
        <div className="max-h-[40%] overflow-y-auto px-5 pt-4 pb-3">
          <JournalMessage
            showControls={true}
            stabilizeActionBar
            id={message.id}
            incidentId={props.incidentId}
            message={message}
            divisions={incidentDivisions}
            setEditorMessage={undefined}
            setTriageMessage={undefined}
          />
        </div>

        {/* Summary body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Meldefluss */}
          {assignedDivisions.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t("messageFlow")}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {assignedDivisions.map((d) => (
                  <span
                    key={d.id}
                    className="rounded bg-primary px-2.5 py-0.5 text-xs font-semibold text-white"
                  >
                    {d.description || d.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Casualties */}
          {hasCasualties && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t("stepPersonen")}
              </h3>
              <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
                <div className="flex flex-wrap gap-3">
                  {spCasualties.map((sp) => (
                    <div
                      key={sp.schadenplatzId}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elevated"
                    >
                      <div className="border-b border-border px-3 py-1">
                        <p className="text-[10px] font-medium tracking-wide text-fg-muted/60 uppercase">
                          Schadenplatz
                        </p>
                        <p className="truncate text-xs font-semibold text-fg-muted">
                          {sp.isDefault ? t("schadenplatz.defaultHint") : sp.name}
                        </p>
                      </div>
                      <div className="divide-y divide-border px-3">
                        {CASUALTY_CATEGORIES.filter((cat) => sp[cat.key] !== 0).map((cat) => (
                          <div key={cat.key} className="flex items-center gap-2 py-1.5">
                            {cat.babsId && iconsLoaded ? (
                              <BabsIcon icon={cat.babsId} size={20} fallback={null} />
                            ) : cat.faIcon ? (
                              <FontAwesomeIcon
                                icon={cat.faIcon}
                                className="text-sm text-fg-muted"
                              />
                            ) : null}
                            <span className="w-6 text-right text-base font-bold text-danger tabular-nums">
                              {sp[cat.key]}
                            </span>
                            <span className="ml-2 text-sm text-fg-muted">{t(cat.labelKey)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </BabsIconProvider>
            </section>
          )}

          {/* Linked resources */}
          {linkedResources.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {t("stepMittel")}
              </h3>
              <div className="divide-y divide-border rounded-lg border border-border">
                {linkedResources.map((r) => {
                  const babsId = combinedBabsId(r.formation, r.size);
                  const snap = resourceStateAt(r, new Date(message.time));
                  return (
                    <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-bg">
                        {babsId && iconsLoaded ? (
                          <BabsIcon lang={i18n.language} icon={babsId} size={28} fallback={null} />
                        ) : (
                          <span className="text-xs font-bold text-fg-muted">{r.formation}</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {qualifiedFormation(
                            t(`resource.formation.${r.formation}`),
                            r.homeLocation?.name,
                          )}
                        </span>
                        {r.name && (
                          <span className="block truncate text-xs text-fg-muted">{r.name}</span>
                        )}
                        <span className="block truncate text-xs text-fg-muted/70">
                          {snap.personnelCount} {t("resource.fields.personnelCount")} ·{" "}
                          {t(`resource.status.${snap.status}`)}
                          {snap.hauptaufgabe && ` · ${snap.hauptaufgabe}`}
                          {snap.deploymentLabel && ` · ${snap.deploymentLabel}`}
                        </span>
                        {snap.status === "ABGELOEST" &&
                          snap.successorId &&
                          (() => {
                            const succ = allResourcesById.get(snap.successorId);
                            if (!succ) return null;
                            return (
                              <span className="block truncate text-xs text-fg-muted/50">
                                {t("resource.fields.relievedThrough")}{" "}
                                {qualifiedFormation(
                                  t(`resource.formation.${succ.formation}`),
                                  succ.homeLocation?.name,
                                )}
                                {succ.name ? ` — ${succ.name}` : ""}
                              </span>
                            );
                          })()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {!hasCasualties && linkedResources.length === 0 && assignedDivisions.length === 0 && (
            <p className="mt-8 text-center text-sm text-fg-muted/60">–</p>
          )}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="primary" size="sm" onClick={onAdjust}>
            {t("triageAdjust")}
          </Button>
        </footer>
      </div>
    </BabsIconProvider>
  );
}

function TriagePanel(props: { message: Message; incidentId: string; onSaved: () => void }) {
  const { message, incidentId, onSaved } = props;
  return <PanelForm key={message.id} message={message} incidentId={incidentId} onSaved={onSaved} />;
}

function PanelForm(props: { message: Message; incidentId: string; onSaved: () => void }) {
  const { message, incidentId, onSaved } = props;
  const { t, i18n } = useTranslation();
  const { state: incidentState } = useContext(IncidentContext);
  const incidentDivisions = incidentState.incident?.divisions ?? [];
  const showTasks = useBooleanFlagValue("show-tasks", false);
  const showResources = useBooleanFlagValue("show-resources", false);

  const [triageMessage, triageState] = useTriageMessage();
  const [recordCasualties] = useRecordCasualties();
  const resourcesResult = useIncidentResources(incidentId);
  const [createSchadenplatz] = useCreateSchadenplatz();
  const iconsLoaded = useBabsIcons();
  const [stepError, setStepError] = useState<ApiError | undefined>(undefined);

  const isTriaged =
    message.triageId !== TriageStatus.Pending && message.triageId !== TriageStatus.Reset;
  const [editing, setEditing] = useState(!isTriaged);

  const [priority, setPriority] = useState<PriorityStatus>(message.priorityId);
  // Named Schadenplätz selected in the dedicated Schadenplatz step. Default is never in this list.
  const [selectedSpIds, setSelectedSpIds] = useState<string[]>([]);
  // Per-Schadenplatz casualty deltas — pre-populated from previous triage when available.
  const [casualtiesBySpId, setCasualtiesBySpId] = useState<Record<string, CasualtyDeltas>>({});
  const casualtiesInitialized = useRef(false);
  const [assignments, setAssignments] = useState<Division[]>(
    message.divisions.map((d) => d.division),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [liveMessage, setLiveMessage] = useState<Message>(message);
  const messageForTriageResult = useMessageForTriage(message.id, incidentId);
  const previousCasualties = useMemo(
    () =>
      messageForTriageResult.status === "ready"
        ? messageForTriageResult.data.schadenplatzCasualties
        : [],
    [messageForTriageResult],
  );
  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());
  const resourcesInitialized = useRef(false);
  useEffect(() => {
    if (resourcesInitialized.current || messageForTriageResult.status !== "ready") return;
    resourcesInitialized.current = true;
    const linked = messageForTriageResult.data.linkedResourceIds;
    // eslint-disable-next-line react/set-state-in-effect -- initializes local edit state from async query data once.
    if (linked.length > 0) setSelectedResourceIds(new Set(linked));
  }, [messageForTriageResult]);

  const toggleResourceId = (id: string) =>
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const editorRef = useRef<MessageEditorFormHandle>(null);
  const savedAssignments = useRef<Division[] | null>(null);

  const isPending =
    message.triageId === TriageStatus.Pending || message.triageId === TriageStatus.Reset;

  const schadenplaetze =
    resourcesResult.status === "ready" ? resourcesResult.data.schadenplaetze : [];
  const defaultSp = schadenplaetze.find((s) => s.isDefault);
  const namedSchadenplaetze = schadenplaetze.filter((s) => !s.isDefault);

  // Pre-populate casualties and SP selection from previous triage (once per mount).
  // Waits for both previousCasualties and defaultSp so we can exclude the default from selectedSpIds.
  useEffect(() => {
    if (casualtiesInitialized.current || previousCasualties.length === 0 || !defaultSp) return;
    casualtiesInitialized.current = true;

    const initial: Record<string, CasualtyDeltas> = {};
    for (const entry of previousCasualties) {
      initial[entry.schadenplatzId] = {
        vermisste: entry.vermisste,
        tote: entry.tote,
        verletzte: entry.verletzte,
        obdachlose: entry.obdachlose,
        eingeschlossene: entry.eingeschlossene,
      };
    }
    // eslint-disable-next-line react/set-state-in-effect -- initializes local edit state from previous triage query data once.
    setCasualtiesBySpId(initial);

    const namedSpIds = previousCasualties
      .map((e) => e.schadenplatzId)
      .filter((id) => id !== defaultSp.id);
    // eslint-disable-next-line react/set-state-in-effect -- initializes local edit state from previous triage query data once.
    if (namedSpIds.length > 0) setSelectedSpIds(namedSpIds);
  }, [previousCasualties, defaultSp]);

  // Personen step: selected named SPs first (in selection order), then default SP.
  const personenSpIds: string[] = useMemo(
    () => [
      ...selectedSpIds.filter((id) => id !== defaultSp?.id),
      ...(defaultSp ? [defaultSp.id] : []),
    ],
    [defaultSp, selectedSpIds],
  );
  const toggleSpId = (id: string) =>
    setSelectedSpIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const getSpCasualties = useCallback(
    (spId: string): CasualtyDeltas =>
      casualtiesBySpId[spId] ?? {
        vermisste: 0,
        tote: 0,
        verletzte: 0,
        obdachlose: 0,
        eingeschlossene: 0,
      },
    [casualtiesBySpId],
  );

  const setSpCasualties = (spId: string, deltas: CasualtyDeltas) =>
    setCasualtiesBySpId((prev) => ({ ...prev, [spId]: deltas }));

  const steps: StepDef[] = [
    ...(isPending ? [{ key: "meldung", label: t("stepMeldung") }] : []),
    { key: "meldefluss", label: t("messageFlow") },
    ...(showResources ? [{ key: "schadenplatz", label: t("stepSchadenplatz") }] : []),
    ...(showResources ? [{ key: "personen", label: t("stepPersonen") }] : []),
    ...(showResources ? [{ key: "mittel", label: t("stepMittel") }] : []),
  ];

  // In the mittel step, restrict resource picker to selected named SPs plus the default SP.
  // When nothing is selected all SPs are available.
  const effectiveSchadenplaetze =
    selectedSpIds.length > 0
      ? schadenplaetze.filter((sp) => sp.isDefault || selectedSpIds.includes(sp.id))
      : schadenplaetze;

  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[safeIndex];
  const isLast = safeIndex === steps.length - 1;

  const previewMessage: Message = {
    ...liveMessage,
    priorityId: priority,
    triageId: priority === PriorityStatus.High ? TriageStatus.Triaged : liveMessage.triageId,
    divisions: assignments.map((division) => ({ division })),
  };

  const handleSave = useCallback(
    async (triage: TriageStatus) => {
      const effectivePriority = triage === TriageStatus.MoreInfo ? PriorityStatus.Normal : priority;
      const originalDivisionIds = message.divisions.map((d) => d.division.id).sort();
      const currentDivisionIds = assignments.map((d) => d.id).sort();
      const originalResourceIds = [
        ...(messageForTriageResult.status === "ready"
          ? messageForTriageResult.data.linkedResourceIds
          : []),
      ].sort();
      const currentResourceIds = Array.from(selectedResourceIds).sort();
      const unchanged =
        triage === message.triageId &&
        effectivePriority === message.priorityId &&
        originalDivisionIds.join() === currentDivisionIds.join() &&
        originalResourceIds.join() === currentResourceIds.join();
      if (unchanged) {
        onSaved();
        return;
      }
      try {
        await triageMessage({
          incidentId,
          messageId: message.id,
          priority: effectivePriority,
          triage,
          divisionIds: assignments.map((d) => d.id),
          divisions: assignments,
          linkedResourceIds: Array.from(selectedResourceIds),
        });
        onSaved();
      } catch {
        // triageState.error is set by useMutation and displayed in the step notification
      }
    },
    [
      onSaved,
      triageMessage,
      incidentId,
      message.id,
      message.triageId,
      message.priorityId,
      message.divisions,
      messageForTriageResult,
      priority,
      assignments,
      selectedResourceIds,
    ],
  );

  const handleNext = useCallback(async () => {
    setStepError(undefined);
    if (isLast) {
      void handleSave(TriageStatus.Triaged);
      return;
    }
    // Save casualties when leaving the Personen step — show errors in-place.
    if (currentStep.key === "personen") {
      try {
        for (const spId of personenSpIds) {
          const deltas = getSpCasualties(spId);
          if (Object.values(deltas).every((v) => v === 0)) continue;
          await recordCasualties({
            schadenplatzId: spId,
            messageId: message.id,
            deltas,
            occurredAt: message.time,
          });
        }
      } catch (e) {
        setStepError(isApiError(e) ? e : new ApiError("UNKNOWN"));
        return;
      }
    }
    if (currentStep.key === "meldung") void editorRef.current?.save();
    setStepIndex((i) => i + 1);
  }, [
    isLast,
    currentStep.key,
    handleSave,
    recordCasualties,
    message.id,
    message.time,
    getSpCasualties,
    personenSpIds,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        handleNext();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleNext]);

  if (isTriaged && !editing) {
    return (
      <TriageSummary
        message={message}
        incidentId={incidentId}
        incidentDivisions={incidentDivisions}
        casualties={previousCasualties}
        linkedResourceIds={
          messageForTriageResult.status === "ready"
            ? messageForTriageResult.data.linkedResourceIds
            : []
        }
        schadenplaetze={
          resourcesResult.status === "ready" ? resourcesResult.data.schadenplaetze : []
        }
        allResources={resourcesResult.status === "ready" ? resourcesResult.data.resources : []}
        iconsLoaded={iconsLoaded}
        onAdjust={() => setEditing(true)}
      />
    );
  }

  return (
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Message context — scrollable so tall content doesn't hide the stepper */}
        <div className="max-h-[40%] overflow-y-auto px-5 pt-4 pb-3">
          <JournalMessage
            showControls={!isPending}
            stabilizeActionBar
            id={message.id}
            incidentId={incidentId}
            message={previewMessage}
            divisions={incidentDivisions}
            setEditorMessage={undefined}
            setTriageMessage={undefined}
          />
        </div>

        {/* Step navigator (sidebar on mobile) + step content */}
        <div className="flex flex-1 overflow-hidden lg:flex-col">
          <Stepper steps={steps} current={safeIndex} onChange={setStepIndex} />

          {/* Step content */}
          <div className="flex-1 overflow-y-auto p-5">
            {(triageState.error ?? stepError) &&
              (() => {
                const err = triageState.error ?? stepError!;
                return (
                  <Notification variant="danger" className="mb-4">
                    <p>{t(`errors.${err.code}`)}</p>
                    {err.detail && <p className="mt-1 text-xs opacity-80">{err.detail}</p>}
                  </Notification>
                );
              })()}

            {currentStep.key === "meldung" && (
              <Suspense fallback={<Spinner />}>
                <MessageEditorForm
                  ref={editorRef}
                  message={message}
                  incidentId={incidentId}
                  onLiveMessage={setLiveMessage}
                  title={t("stepMeldungReview")}
                />
              </Suspense>
            )}

            {currentStep.key === "meldefluss" && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-bold">{t("keyMessage")}</h3>
                    <button
                      type="button"
                      role="switch"
                      aria-label={t("keyMessage")}
                      aria-checked={priority === PriorityStatus.High}
                      onClick={() => {
                        if (priority === PriorityStatus.High) {
                          setPriority(PriorityStatus.Normal);
                          setAssignments(savedAssignments.current ?? []);
                          savedAssignments.current = null;
                        } else {
                          savedAssignments.current = assignments;
                          setPriority(PriorityStatus.High);
                          setAssignments(incidentDivisions);
                        }
                      }}
                      className={clsx(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:ring-2 focus:ring-danger focus:ring-offset-2 focus:outline-none",
                        priority === PriorityStatus.High ? "bg-danger" : "bg-border",
                      )}
                    >
                      <span
                        className={clsx(
                          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200",
                          priority === PriorityStatus.High ? "translate-x-5" : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>

                  <div className="min-w-0">
                    <h3 className="mb-3 text-base font-bold">{t("messageFlow")}</h3>
                    <div className="flex flex-wrap gap-2">
                      {incidentDivisions.map((d) => {
                        const isPresent = assignments.some((e) => e.name === d.name);
                        return (
                          <div
                            key={d.name}
                            className="flex overflow-hidden rounded text-xs font-semibold"
                          >
                            <span
                              className={
                                isPresent
                                  ? "bg-primary px-3 py-0.5 text-white"
                                  : "bg-fg px-3 py-0.5 text-bg"
                              }
                            >
                              {d.description || d.name}
                            </span>
                            {isPresent ? (
                              <button
                                type="button"
                                className="bg-primary/20 px-2 py-0.5 text-primary transition-colors hover:bg-primary/30"
                                onClick={() =>
                                  setAssignments(reject(assignments, (e) => e.id === d.id))
                                }
                              >
                                <FontAwesomeIcon icon={faMinus} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="bg-success/20 px-2 py-0.5 text-success transition-colors hover:bg-success/30"
                                onClick={() => setAssignments(union(assignments, [d]))}
                              >
                                <FontAwesomeIcon icon={faPlus} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {showTasks && (
                  <div>
                    <h3 className="mb-3 text-base font-bold">{t("tasks")}</h3>
                    <TaskNew />
                  </div>
                )}
              </div>
            )}

            {currentStep.key === "schadenplatz" && (
              <SchadenplatzSelectStep
                namedSchadenplaetze={namedSchadenplaetze}
                selectedIds={selectedSpIds}
                onToggle={toggleSpId}
                incidentId={incidentId}
                onCreated={(id) => setSelectedSpIds((prev) => [...prev, id])}
                onReplaced={(tempId, realId) =>
                  setSelectedSpIds((prev) => prev.map((id) => (id === tempId ? realId : id)))
                }
                onCancelled={(tempId) =>
                  setSelectedSpIds((prev) => prev.filter((id) => id !== tempId))
                }
                createSchadenplatz={(args) =>
                  createSchadenplatz({ ...args, occurredAt: message.time })
                }
              />
            )}

            {currentStep.key === "personen" && (
              <div className="space-y-6">
                {personenSpIds.map((spId) => {
                  const sp = schadenplaetze.find((s) => s.id === spId);
                  const label = sp?.isDefault ? t("schadenplatz.defaultHint") : (sp?.name ?? spId);
                  return (
                    <div key={spId}>
                      <h3 className="mb-3 text-sm font-semibold tracking-wide text-fg-muted uppercase">
                        {label}
                      </h3>
                      <CasualtySection
                        value={getSpCasualties(spId)}
                        spCasualties={sp?.casualties}
                        onChange={(d) => setSpCasualties(spId, d)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {currentStep.key === "mittel" && (
              <div className="space-y-3">
                {resourcesResult.status === "loading" ? (
                  <Spinner />
                ) : (
                  <>
                    <ResourcePicker
                      schadenplaetze={schadenplaetze}
                      allResources={
                        resourcesResult.status === "ready" ? resourcesResult.data.resources : []
                      }
                      selectedIds={selectedResourceIds}
                      onToggle={toggleResourceId}
                      onAttach={(ids) =>
                        setSelectedResourceIds((previous) => new Set([...previous, ...ids]))
                      }
                      iconsLoaded={iconsLoaded}
                      messageTime={message.time}
                      prioritySpIds={selectedSpIds}
                    />
                    <AlertResourceForm
                      incidentId={incidentId}
                      schadenplaetze={effectiveSchadenplaetze}
                      sourceMessageId={message.id}
                      messageTime={message.time}
                      iconsLoaded={iconsLoaded}
                      existingResources={schadenplaetze.flatMap((sp) => sp.resources)}
                      onAlerted={(tempId) => {
                        setSelectedResourceIds((prev) => new Set([...prev, tempId]));
                      }}
                      onReplaced={(tempId, realId) => {
                        setSelectedResourceIds((prev) => {
                          const next = new Set(prev);
                          next.delete(tempId);
                          next.add(realId);
                          return next;
                        });
                        void resourcesResult.refresh();
                      }}
                      onCancelled={(tempId) => {
                        setSelectedResourceIds((prev) => {
                          const next = new Set(prev);
                          next.delete(tempId);
                          return next;
                        });
                      }}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer: back / next / triage actions */}
        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-4">
          {safeIndex > 0 && (
            <Button
              type="button"
              variant="light"
              size="sm"
              onClick={() => setStepIndex((i) => i - 1)}
            >
              {t("back")}
            </Button>
          )}
          {currentStep.key === "meldung" && (
            <Button
              type="button"
              variant="light"
              size="sm"
              disabled={triageState.loading}
              onClick={() => handleSave(TriageStatus.MoreInfo)}
            >
              {t("saveMoreInfo")}
            </Button>
          )}
          <div className="flex-1" />
          {!isLast ? (
            <Button type="button" variant="primary" size="sm" onClick={() => void handleNext()}>
              {t("next")}
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={triageState.loading}
              onClick={() => handleSave(TriageStatus.Triaged)}
            >
              {t("saveTriage")}
            </Button>
          )}
        </footer>
      </div>
    </BabsIconProvider>
  );
}

export interface TriageViewProps {
  /** Pre-filter the message stack. Defaults to showing all messages. */
  filters?: Partial<MessageFilters>;
  /** Which message to highlight on first load. Defaults to "oldest-pending". */
  initialStrategy?: InitialStrategy;
}

function TriageView({ filters, initialStrategy = "oldest-pending" }: TriageViewProps) {
  const { incidentId } = useParams();
  const { t } = useTranslation();
  const { state: incidentState } = useContext(IncidentContext);
  const incidentIsClosed = incidentState.incident?.closedAt != null;
  const [, startTransition] = useTransition();
  // undefined = no explicit selection; a string locks the view against polling changes
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [caughtUp, setCaughtUp] = useState(false);
  // Captures the first defaultId we see while selectedId is undefined, so that a
  // subsequent polling cycle delivering an older message doesn't silently switch the view.
  // Cleared whenever selectedId becomes a string (explicit choice), allowing a fresh
  // auto-selection after the next reset to undefined (e.g. caught-up → new arrivals).
  const [autoLockedId, setAutoLockedId] = useState<string | undefined>(undefined);
  // ID of the most-recently saved message. Auto-lock skips this ID so the cache's
  // stale pending status doesn't immediately re-lock to the just-triaged message.
  const [justSavedId, setJustSavedId] = useState<string | undefined>(undefined);

  const result = useIncidentMessages(incidentId ?? "");

  const resolvedFilters = useMemo<MessageFilters>(
    () => ({ triage: "all", priority: "all", assignment: "all", author: "all", ...filters }),
    // filters is a prop object; spread means we depend on its identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters],
  );

  const messages = useMemo(
    () =>
      result.status === "ready" ? buildMessageList(result.data.messages, resolvedFilters) : [],
    [result.status, result.data, resolvedFilters],
  );

  const pendingMessages = messages.filter(
    (m) => m.triageId === TriageStatus.Pending || m.triageId === TriageStatus.Reset,
  );

  const defaultId = (() => {
    switch (initialStrategy) {
      case "oldest-pending":
        return pendingMessages[pendingMessages.length - 1]?.id;
      case "newest":
        return messages[0]?.id;
      case "none":
        return undefined;
    }
  })();

  // When selectedId is an explicit string, clear the lock so a future reset to
  // undefined (caught-up) picks a fresh defaultId rather than the stale one.
  // React's derived-state pattern: setState during render triggers an immediate synchronous re-render.
  const [prevSelectedId, setPrevSelectedId] = useState<string | undefined>(undefined);
  const [prevDefaultId, setPrevDefaultId] = useState<string | undefined>(undefined);
  if (selectedId !== prevSelectedId || defaultId !== prevDefaultId) {
    setPrevSelectedId(selectedId);
    setPrevDefaultId(defaultId);
    if (selectedId !== undefined) {
      if (autoLockedId !== undefined) setAutoLockedId(undefined);
      if (justSavedId !== undefined) setJustSavedId(undefined);
    } else if (autoLockedId === undefined && defaultId !== undefined && defaultId !== justSavedId) {
      // First time a new defaultId resolves while in auto-mode: lock it in.
      // Skip the just-saved ID so the stale cache doesn't re-lock to it before the mutation lands.
      setAutoLockedId(defaultId);
    }
  }

  const effectiveId = selectedId ?? autoLockedId;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(undefined);
        return;
      }
      if (!e.ctrlKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const idx = messages.findIndex((m) => m.id === effectiveId);
      const next = e.key === "ArrowUp" ? messages[idx - 1] : messages[idx + 1];
      if (!next) return;
      startTransition(() => {
        setCaughtUp(false);
        setSelectedId(next.id);
      });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [messages, effectiveId, startTransition]);

  const handleSelect = useCallback(
    (id: string | undefined) => {
      startTransition(() => {
        setCaughtUp(false);
        // On mobile: tapping the auto-locked row calls onSelect(undefined) because it
        // already appears selected. Treat that as an explicit selection so the panel opens.
        if (
          id === undefined &&
          selectedId === undefined &&
          autoLockedId !== undefined &&
          !window.matchMedia("(min-width: 1024px)").matches
        ) {
          setSelectedId(autoLockedId);
        } else {
          setSelectedId(id);
        }
      });
    },
    [startTransition, selectedId, autoLockedId],
  );

  if (result.status === "loading") {
    return (
      <div className="mt-[2.75rem] flex grow items-center justify-center bg-bg">
        <Spinner />
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="mt-[2.75rem] grow bg-bg p-6">
        <Notification variant="danger" light>
          {t(`errors.${result.error.code}`)}
        </Notification>
      </div>
    );
  }

  // Oldest untriaged excluding the one being triaged (list is newest-first, so oldest is last).
  const getNextUntriaged = (currentId: string): string | undefined => {
    const next = pendingMessages.filter((m) => m.id !== currentId);
    return next[next.length - 1]?.id;
  };

  const handleSaved = (currentId: string) => {
    setJustSavedId(currentId);
    setAutoLockedId(undefined); // evict immediately so the stale cache can't keep it locked
    startTransition(() => {
      const nextId = getNextUntriaged(currentId);
      setSelectedId(nextId); // undefined → auto-selects new oldest pending via defaultId
      setCaughtUp(nextId === undefined);
    });
  };

  const selectedMessage = messages.find((m) => m.id === effectiveId);

  return (
    <div className="mt-[2.75rem] flex grow overflow-hidden bg-bg">
      {/* Stack: full-width on mobile when nothing selected, sidebar on desktop */}
      <FilterableMessageStack
        messages={messages}
        effectiveId={effectiveId}
        onSelect={handleSelect}
        initialFilters={{}}
        className={clsx(
          "shrink-0 lg:flex lg:w-[36rem]",
          selectedId !== undefined ? "hidden" : "w-full",
        )}
      />
      {/* Triage canvas: full-width on mobile when selected, always visible on desktop */}
      <div
        className={clsx(
          "min-w-0 flex-1 flex-col overflow-hidden",
          selectedId !== undefined ? "flex" : "hidden lg:flex",
        )}
      >
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-2 text-sm text-primary lg:hidden"
          onClick={() => setSelectedId(undefined)}
        >
          <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
          {t("back")}
        </button>
        <TriageCanvas incidentClosed={incidentIsClosed}>
          {selectedMessage && !caughtUp && (
            <ViewTransition key={selectedMessage.id} enter="auto" exit="auto">
              <TriagePanel
                message={selectedMessage}
                incidentId={incidentId ?? ""}
                onSaved={() => handleSaved(selectedMessage.id)}
              />
            </ViewTransition>
          )}
        </TriageCanvas>
      </div>
    </div>
  );
}

export type CasualtyDeltas = {
  vermisste: number;
  tote: number;
  verletzte: number;
  obdachlose: number;
  eingeschlossene: number;
};

type CasualtyCategory = {
  key: keyof CasualtyDeltas;
  labelKey: string;
  babsId?: string;
  faIcon?: import("@fortawesome/fontawesome-svg-core").IconDefinition;
};

const CASUALTY_CATEGORIES: CasualtyCategory[] = [
  { key: "vermisste", labelKey: "casualties.vermisste", babsId: "1302" },
  { key: "tote", labelKey: "casualties.tote", babsId: "1305" },
  { key: "verletzte", labelKey: "casualties.verletzte", babsId: "1301" },
  { key: "obdachlose", labelKey: "casualties.obdachlose", babsId: "1303" },
  { key: "eingeschlossene", labelKey: "casualties.eingeschlossene", babsId: "1304" },
];

function CasualtySection({
  value,
  spCasualties,
  onChange,
}: {
  value: CasualtyDeltas;
  spCasualties?: SchadenplatzWithResources["casualties"];
  onChange: (v: CasualtyDeltas) => void;
}) {
  const { t } = useTranslation();
  const iconsLoaded = useBabsIcons();

  const set = (key: keyof CasualtyDeltas, delta: number) => onChange({ ...value, [key]: delta });

  const nonZero = CASUALTY_CATEGORIES.filter((cat) => value[cat.key] !== 0);

  return (
    <div className="flex gap-3">
      {/* Counter list */}
      <div className="w-full divide-y divide-border lg:w-1/2">
        {CASUALTY_CATEGORIES.map((cat) => (
          <CasualtyRow
            key={cat.key}
            category={cat}
            delta={value[cat.key]}
            currentTotal={spCasualties?.[cat.key] ?? 0}
            iconsLoaded={iconsLoaded}
            onChange={(d) => set(cat.key, d)}
          />
        ))}
      </div>

      {/* Summary — hidden on mobile, shown on desktop */}
      <div className="hidden w-1/2 rounded-lg border border-border bg-bg p-3 lg:block">
        <p className="mb-2 text-sm font-semibold tracking-wide text-danger uppercase">
          {t("casualties.summary")}
        </p>
        {nonZero.length === 0 ? (
          <p className="mt-2 text-center text-sm text-fg-muted/50">–</p>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {nonZero.map((cat) => {
              const delta = value[cat.key];
              return (
                <div key={cat.key} className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {cat.babsId && iconsLoaded ? (
                      <BabsIcon icon={cat.babsId} size={30} fallback={null} />
                    ) : cat.faIcon ? (
                      <FontAwesomeIcon icon={cat.faIcon} className="text-lg text-fg-muted" />
                    ) : null}
                  </span>
                  <span
                    className={clsx(
                      "text-xl font-bold tabular-nums",
                      delta > 0 ? "text-danger" : "text-success",
                    )}
                  >
                    {delta}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CasualtyRow({
  category,
  delta,
  currentTotal,
  iconsLoaded,
  onChange,
}: {
  category: CasualtyCategory;
  delta: number;
  currentTotal: number;
  iconsLoaded: boolean;
  onChange: (delta: number) => void;
}) {
  const { t } = useTranslation();
  const label = t(category.labelKey);
  // minDelta is the most-negative delta that keeps the SP total ≥ 0
  const minDelta = -currentTotal;
  const adjust = (n: number) => onChange(Math.max(minDelta, delta + n));

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {category.babsId && iconsLoaded ? (
          <BabsIcon icon={category.babsId} size={18} fallback={null} />
        ) : category.faIcon ? (
          <FontAwesomeIcon icon={category.faIcon} className="text-xs text-fg-muted" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`${label} −1`}
          onClick={() => adjust(-1)}
          disabled={delta <= minDelta}
          className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs hover:bg-bg-elevated disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faMinus} className="text-[10px]" />
        </button>
        <input
          type="number"
          value={delta}
          min={minDelta}
          onChange={(e) => onChange(Math.max(minDelta, Number(e.target.value)))}
          aria-label={label}
          className="w-10 rounded border border-border bg-bg-elevated px-1 py-0.5 text-center text-xs focus:ring-1 focus:ring-primary focus:outline-none"
        />
        <button
          type="button"
          aria-label={`${label} +1`}
          onClick={() => adjust(1)}
          className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs hover:bg-bg-elevated"
        >
          <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
        </button>
      </div>
    </div>
  );
}

// ── SchadenplatzSelectStep ───────────────────────────────────────────────────

// Multi-select step for picking the Schadenplätz that this message concerns.
// Newly created Schadenplätz are auto-selected. Shows an empty state when none exist yet.
function SchadenplatzSelectStep({
  namedSchadenplaetze,
  selectedIds,
  onToggle,
  incidentId,
  createSchadenplatz,
  onCreated,
  onReplaced,
  onCancelled,
}: {
  namedSchadenplaetze: SchadenplatzWithResources[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  incidentId: string;
  createSchadenplatz: (args: {
    incidentId: string;
    name: string;
    tempId?: string;
  }) => Promise<{ id: string; tempId: string }>;
  onCreated: (id: string) => void;
  onReplaced: (tempId: string, realId: string) => void;
  onCancelled: (tempId: string) => void;
}) {
  const { t } = useTranslation();
  const [showNew, setShowNew] = useState(false);
  const [newSpName, setNewSpName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newSpName.trim()) return;
    setCreating(true);
    const tempId = `__optimistic_sp_${Date.now()}`;
    onCreated(tempId);
    try {
      const result = await createSchadenplatz({ incidentId, name: newSpName.trim(), tempId });
      if (result.id !== tempId) onReplaced(tempId, result.id);
      setNewSpName("");
      setShowNew(false);
    } catch (e) {
      onCancelled(tempId);
      throw e;
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">{t("schadenplatz.selectHint")}</p>

      {namedSchadenplaetze.length === 0 ? (
        <p className="px-1 text-sm text-fg-muted italic">{t("schadenplatz.noneCreated")}</p>
      ) : (
        <div className="space-y-2">
          {namedSchadenplaetze.map((sp) => {
            const isSelected = selectedIds.includes(sp.id);
            return (
              <label
                key={sp.id}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-bg-elevated hover:border-primary/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(sp.id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="flex-1 font-medium text-fg">{sp.name}</span>
              </label>
            );
          })}
        </div>
      )}

      <div className={clsx("pt-2", namedSchadenplaetze.length > 0 && "border-t border-border")}>
        {!showNew ? (
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => setShowNew(true)}
          >
            + {t("schadenplatz.new")}
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newSpName}
              onChange={(e) => setNewSpName(e.target.value)}
              placeholder={t("schadenplatz.namePlaceholder")}
              className="w-full rounded border border-border bg-bg-elevated px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") setShowNew(false);
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="xs"
                disabled={creating || !newSpName.trim()}
                onClick={() => void handleCreate()}
              >
                {t("schadenplatz.create")}
              </Button>
              <Button type="button" variant="light" size="xs" onClick={() => setShowNew(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Resource display helpers ──────────────────────────────────────────────────

/**
 * "Feuerwehr Altdorf" — formation type + organisation qualifier.
 * Used as the primary identifier for a resource.
 */
export function qualifiedFormation(
  formationLabel: string,
  homeLocationName: string | null | undefined,
): string {
  return homeLocationName ? `${formationLabel} ${homeLocationName}` : formationLabel;
}

/**
 * "Feuerwehr Altdorf – Gruppe 3" — full display name with sub-unit description.
 */
export function resourceDisplayName(
  formationLabel: string,
  homeLocationName: string | null | undefined,
  name: string,
): string {
  const qf = qualifiedFormation(formationLabel, homeLocationName);
  return name ? `${qf} – ${name}` : qf;
}

const resourceStatusVariant: Record<ResourceStatus, TagVariant> = {
  AUFGEBOTEN: "warning",
  EINSATZBEREIT: "primary",
  EINGESETZT: "success",
  ABGELOEST: "gray",
};

const RESOURCE_PAGE_SIZE = 5;

function ResourcePicker({
  schadenplaetze,
  allResources,
  selectedIds,
  onToggle,
  onAttach,
  iconsLoaded,
  messageTime,
  prioritySpIds,
}: {
  schadenplaetze: SchadenplatzWithResources[];
  allResources: Resource[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onAttach: (ids: string[]) => void;
  iconsLoaded: boolean;
  messageTime: Date;
  prioritySpIds?: string[];
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(RESOURCE_PAGE_SIZE);

  // Flat lookup including ABGELOEST — used so relieved units don't vanish from the selected list.
  const allResourcesById = useMemo(
    () => new Map(allResources.map((r) => [r.id, r])),
    [allResources],
  );

  const allAnnotated = useMemo(
    () =>
      schadenplaetze.flatMap((sp) =>
        sp.resources.map((r) => ({
          ...r,
          _spId: sp.id,
          _spName: sp.isDefault ? t("schadenplatz.defaultHint") : sp.name,
        })),
      ),
    [schadenplaetze, t],
  );

  // Selected resources: look up in allResourcesById first so ABGELOEST units remain visible
  // after the SP-scoped query drops them. Fall back to allAnnotated for any resource not yet
  // in the flat list (e.g. optimistic entries added before the network response).
  const selectedResources = useMemo(
    () =>
      Array.from(selectedIds).flatMap((id) => {
        const r = allResourcesById.get(id) ?? allAnnotated.find((a) => a.id === id);
        if (!r) return [];
        const sp = schadenplaetze.find((s) => s.id === r.schadenplatzId);
        const _spName = sp ? (sp.isDefault ? t("schadenplatz.defaultHint") : sp.name) : "";
        return [{ ...r, _spId: r.schadenplatzId, _spName }];
      }),
    [selectedIds, allResourcesById, allAnnotated, schadenplaetze, t],
  );

  // Available: not yet selected, not ABGELOEST, alerted before message time.
  // Resources from the operator-selected Schadenplätze are sorted first.
  const availableResources = useMemo(() => {
    const unordered = allAnnotated.filter(
      (r) =>
        !selectedIds.has(r.id) &&
        r.status !== "ABGELOEST" &&
        new Date(r.statusAt).getTime() <= messageTime.getTime(),
    );
    if (!prioritySpIds?.length) return unordered;
    const inPriority = unordered.filter((r) => prioritySpIds.includes(r._spId));
    const rest = unordered.filter((r) => !prioritySpIds.includes(r._spId));
    return [...inPriority, ...rest];
  }, [allAnnotated, selectedIds, messageTime, prioritySpIds]);

  const q = search.trim().toLowerCase();
  const filteredAvailable = useMemo(
    () =>
      q
        ? availableResources.filter((r) => {
            const qf = qualifiedFormation(
              t(`resource.formation.${r.formation}`),
              r.homeLocation?.name,
            ).toLowerCase();
            return (
              qf.includes(q) ||
              r.name.toLowerCase().includes(q) ||
              r._spName.toLowerCase().includes(q)
            );
          })
        : availableResources,
    [availableResources, q, t],
  );

  const visibleResources = filteredAvailable.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAvailable.length;

  const toggleEditing = (id: string) => setEditingId((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-3">
      {/* Selected resources — compact summary with optional edit panel */}
      {selectedResources.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {selectedResources.map((r) => (
            <SelectedResourceRow
              key={r.id}
              resource={r}
              currentSpName={r._spName}
              schadenplaetze={schadenplaetze}
              isEditing={editingId === r.id}
              onToggleEdit={() => toggleEditing(r.id)}
              onDeselect={() => onToggle(r.id)}
              onAttach={onAttach}
              iconsLoaded={iconsLoaded}
              messageTime={messageTime}
            />
          ))}
        </div>
      )}

      {/* Search to filter available resources */}
      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setVisibleCount(RESOURCE_PAGE_SIZE);
        }}
        placeholder={t("resource.search")}
        className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
      />

      {/* Available resources list with pagination */}
      {visibleResources.length > 0 ? (
        <div className="space-y-0">
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {visibleResources.map((r) => (
              <AvailableResourceRow
                key={r.id}
                resource={r}
                currentSpName={r._spName}
                onSelect={() => {
                  onToggle(r.id);
                  setSearch("");
                  setVisibleCount(RESOURCE_PAGE_SIZE);
                }}
                iconsLoaded={iconsLoaded}
                messageTime={messageTime}
              />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + RESOURCE_PAGE_SIZE)}
              className="mt-2 w-full rounded border border-border py-1.5 text-sm text-fg-muted hover:bg-bg-elevated"
            >
              {t("resource.showMore", {
                count: Math.min(RESOURCE_PAGE_SIZE, filteredAvailable.length - visibleCount),
              })}
            </button>
          )}
        </div>
      ) : q ? (
        <p className="px-1 text-sm text-fg-muted italic">{t("resource.noResults")}</p>
      ) : availableResources.length === 0 && selectedResources.length === 0 ? (
        <p className="px-1 text-sm text-fg-muted italic">{t("resource.noResources")}</p>
      ) : null}
    </div>
  );
}

// Compact summary card for a selected resource — shows read-only snapshot at message time,
// with a pencil icon to toggle the edit panel and an X to deselect.
function SelectedResourceRow({
  resource: r,
  currentSpName,
  schadenplaetze,
  isEditing,
  onToggleEdit,
  onDeselect,
  onAttach,
  iconsLoaded,
  messageTime,
}: {
  resource: Resource;
  currentSpName: string;
  schadenplaetze: SchadenplatzWithResources[];
  isEditing: boolean;
  onToggleEdit: () => void;
  onDeselect: () => void;
  onAttach: (ids: string[]) => void;
  iconsLoaded: boolean;
  messageTime: Date;
}) {
  const { t, i18n } = useTranslation();
  const snap = resourceStateAt(r, messageTime);
  const babsId = combinedBabsId(r.formation, r.size);

  return (
    <div className="bg-primary/5">
      {/* Compact summary row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-bg">
          {babsId && iconsLoaded ? (
            <BabsIcon lang={i18n.language} icon={babsId} size={36} fallback={null} />
          ) : (
            <span className="text-xs font-bold text-fg-muted">{r.formation}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {qualifiedFormation(t(`resource.formation.${r.formation}`), r.homeLocation?.name)}
          </span>
          <span className="flex items-center gap-2">
            {r.name && <span className="min-w-0 truncate text-xs text-fg-muted">{r.name}</span>}
            <Tag variant={resourceStatusVariant[r.status]} light size="sm">
              {t(`resource.status.${r.status}`)}
            </Tag>
          </span>
          <span className="block truncate text-xs text-fg-muted/70">
            {snap.personnelCount} {t("resource.fields.personnelCount")}
            {snap.hauptaufgabe && ` · ${snap.hauptaufgabe}`}
            {snap.deploymentLabel && ` · ${snap.deploymentLabel}`}
          </span>
          <span className="block truncate text-xs text-fg-muted/50">{currentSpName}</span>
        </span>
        <div className="flex shrink-0 flex-col gap-4">
          <button
            type="button"
            aria-label={t("edit")}
            title={t("edit")}
            onClick={onToggleEdit}
            className={clsx(
              "flex h-6 w-6 items-center justify-center rounded text-fg-muted transition-colors hover:bg-bg-elevated hover:text-primary",
              isEditing && "bg-bg-elevated text-primary",
            )}
          >
            <FontAwesomeIcon icon={faPen} className="text-xs" />
          </button>
          <button
            type="button"
            aria-label={t("close")}
            title={t("close")}
            onClick={onDeselect}
            className="flex h-6 w-6 items-center justify-center rounded text-fg-muted transition-colors hover:bg-bg-elevated hover:text-danger"
          >
            <FontAwesomeIcon icon={faXmark} className="text-xs" />
          </button>
        </div>
      </div>

      {/* Edit panel — shown only when isEditing */}
      {isEditing && (
        <ResourceEditPanel
          resource={r}
          schadenplaetze={schadenplaetze}
          onAttach={onAttach}
          messageTime={messageTime}
          onActionComplete={onToggleEdit}
        />
      )}
    </div>
  );
}

// Clickable row for an unselected resource — tap to add it to the selection.
function AvailableResourceRow({
  resource: r,
  currentSpName,
  onSelect,
  iconsLoaded,
  messageTime,
}: {
  resource: Resource;
  currentSpName: string;
  onSelect: () => void;
  iconsLoaded: boolean;
  messageTime: Date;
}) {
  const { t, i18n } = useTranslation();
  const snap = resourceStateAt(r, messageTime);
  const babsId = combinedBabsId(r.formation, r.size);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-elevated"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-bg">
        {babsId && iconsLoaded ? (
          <BabsIcon lang={i18n.language} icon={babsId} size={36} fallback={null} />
        ) : (
          <span className="text-xs font-bold text-fg-muted">{r.formation}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {qualifiedFormation(t(`resource.formation.${r.formation}`), r.homeLocation?.name)}
        </span>
        <span className="flex items-center gap-2">
          {r.name && <span className="min-w-0 truncate text-xs text-fg-muted">{r.name}</span>}
          <Tag variant={resourceStatusVariant[r.status]} light size="sm">
            {t(`resource.status.${r.status}`)}
          </Tag>
        </span>
        <span className="block truncate text-xs text-fg-muted/70">
          {snap.personnelCount} {t("resource.fields.personnelCount")}
          {snap.hauptaufgabe && ` · ${snap.hauptaufgabe}`}
          {snap.deploymentLabel && ` · ${snap.deploymentLabel}`}
        </span>
        <span className="block truncate text-xs text-fg-muted/50">{currentSpName}</span>
      </span>
      <FontAwesomeIcon icon={faPlus} className="shrink-0 text-sm text-primary/60" />
    </button>
  );
}

// Edit panel — status-driven actions and contextual fields for a selected resource.
// Fields shown depend on status; personnel count and name are not editable here
// (they are set once in AlertResourceForm). Transition buttons are shown prominently.
function ResourceEditPanel({
  resource: r,
  schadenplaetze,
  onAttach,
  messageTime,
  onActionComplete,
}: {
  resource: Resource;
  schadenplaetze: SchadenplatzWithResources[];
  onAttach: (ids: string[]) => void;
  messageTime: Date;
  onActionComplete: () => void;
}) {
  const { t } = useTranslation();
  const [markReady, markReadyState] = useMarkResourceReady();
  const [deploy, deployState] = useDeployResource();
  const [standDown, standDownState] = useStandDownResource();
  const [relieve, relieveState] = useRelieveResource();
  const [handOver, handOverState] = useHandOver();
  const [reassign, reassignState] = useReassignResource();
  const [updateLocation, locationState] = useUpdateDeploymentLocation();
  const [updateContact, contactState] = useUpdateContact();
  const [changeHauptaufgabe, hauptaufgabeState] = useChangeHauptaufgabe();

  const [einsatzort, setEinsatzort] = useState(r.deploymentLocation?.label ?? "");
  const [contactMedium, setContactMedium] = useState<ContactMedium>(r.contact?.medium ?? "PHONE");
  const [contactDetail, setContactDetail] = useState(r.contact?.detail ?? "");
  const [hauptaufgabe, setHauptaufgabe] = useState(r.hauptaufgabe);
  const [targetSpId, setTargetSpId] = useState(r.schadenplatzId);
  const [successorId, setSuccessorId] = useState("");
  const [deployAttempted, setDeployAttempted] = useState(false);

  const defaultSp = schadenplaetze.find((sp) => sp.isDefault);

  const successorCandidates = schadenplaetze
    .flatMap((sp) => sp.resources)
    .filter((candidate) => candidate.id !== r.id && candidate.status !== "ABGELOEST");
  const successor = r.successorId
    ? schadenplaetze
        .flatMap((sp) => sp.resources)
        .find((candidate) => candidate.id === r.successorId)
    : undefined;

  const clearSchadenplatz = async () => {
    if (defaultSp && r.schadenplatzId !== defaultSp.id) {
      await reassign({ id: r.id, schadenplatzId: defaultSp.id, at: messageTime });
    }
  };

  const standDownAndClear = async () => {
    await standDown({ id: r.id, at: messageTime });
    await clearSchadenplatz();
    onActionComplete();
  };

  const relieveAndAttach = async (sid: string | null) => {
    if (sid) {
      // Single atomic backend call: relieves predecessor, inherits task/location,
      // and deploys successor — all in one transaction.
      await handOver({ id: r.id, successorId: sid, at: messageTime });
      // Select both units immediately after handOver succeeds. The predecessor
      // is ABGELOEST (excluded from SP-filtered views anyway), so clearSchadenplatz
      // is skipped here — it would only fail and block the selection update.
      onAttach([r.id, sid]);
    } else {
      await relieve({ id: r.id, successorId: null, at: messageTime });
      await clearSchadenplatz();
      onAttach([r.id]);
    }
    onActionComplete();
  };

  const busy =
    markReadyState.loading ||
    deployState.loading ||
    standDownState.loading ||
    relieveState.loading ||
    handOverState.loading ||
    reassignState.loading ||
    locationState.loading ||
    contactState.loading ||
    hauptaufgabeState.loading;

  const actionError =
    markReadyState.error ??
    deployState.error ??
    standDownState.error ??
    relieveState.error ??
    handOverState.error ??
    reassignState.error ??
    locationState.error ??
    contactState.error ??
    hauptaufgabeState.error;

  return (
    <div className="space-y-3 border-t border-border/60 bg-bg px-3 pt-3 pb-3">
      {/* ── AUFGEBOTEN ──────────────────────────────────────────── */}
      {r.status === "AUFGEBOTEN" && (
        <>
          {/* Contact */}
          <div>
            <span className="mb-0.5 block text-xs font-medium text-fg-muted">
              {t("resource.fields.contact")}
            </span>
            <div className="flex gap-2">
              <select
                value={contactMedium}
                onChange={(e) => setContactMedium(e.target.value as ContactMedium)}
                className="rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="PHONE">{t("medium.PHONE")}</option>
                <option value="RADIO">{t("medium.RADIO")}</option>
                <option value="OTHER">{t("medium.OTHER")}</option>
              </select>
              <input
                type="text"
                value={contactDetail}
                onChange={(e) => setContactDetail(e.target.value)}
                onBlur={() => {
                  if (contactDetail.trim())
                    void updateContact({
                      id: r.id,
                      medium: contactMedium,
                      detail: contactDetail.trim(),
                      at: messageTime,
                    });
                }}
                placeholder={t("resource.fields.contact")}
                className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          {actionError && <p className="text-xs text-danger">{t(`errors.${actionError.code}`)}</p>}

          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => void markReady({ id: r.id, at: messageTime }).then(onActionComplete)}
          >
            {t("resource.actions.markReady")}
          </Button>
        </>
      )}

      {/* ── EINSATZBEREIT ───────────────────────────────────────── */}
      {r.status === "EINSATZBEREIT" && (
        <>
          {/* Schadenplatz reassign */}
          {schadenplaetze.length > 1 && (
            <label className="block">
              <span className="mb-0.5 block text-xs font-medium text-fg-muted">
                {t("schadenplatz.select")}
              </span>
              <select
                value={targetSpId}
                disabled={busy}
                onChange={async (e) => {
                  const newSpId = e.target.value;
                  setTargetSpId(newSpId);
                  await reassign({ id: r.id, schadenplatzId: newSpId, at: messageTime });
                }}
                className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              >
                {schadenplaetze.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.isDefault ? t("schadenplatz.defaultHint") : sp.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Hauptaufgabe — required before deploying */}
          {(() => {
            const invalid = deployAttempted && !hauptaufgabe.trim();
            return (
              <label className="block">
                <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-fg-muted">
                  {t("resource.fields.hauptaufgabe")}
                  <span className="text-danger">*</span>
                </span>
                <input
                  type="text"
                  value={hauptaufgabe}
                  onChange={(e) => {
                    setHauptaufgabe(e.target.value);
                    if (deployAttempted) setDeployAttempted(false);
                  }}
                  onBlur={() => {
                    if (hauptaufgabe.trim() !== r.hauptaufgabe)
                      void changeHauptaufgabe({
                        id: r.id,
                        hauptaufgabe: hauptaufgabe.trim(),
                        at: messageTime,
                      });
                  }}
                  className={clsx(
                    "w-full rounded border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:outline-none",
                    invalid
                      ? "border-danger focus:ring-danger"
                      : "border-border focus:ring-primary",
                  )}
                />
                {invalid && (
                  <span className="mt-0.5 block text-xs text-danger">
                    {t("resource.validation.hauptaufgabeRequired")}
                  </span>
                )}
              </label>
            );
          })()}

          {/* Einsatzort — required before deploying */}
          {(() => {
            const invalid = deployAttempted && !einsatzort.trim();
            return (
              <label className="block">
                <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-fg-muted">
                  {t("resource.fields.deploymentLocation")}
                  <span className="text-danger">*</span>
                </span>
                <input
                  type="text"
                  value={einsatzort}
                  onChange={(e) => {
                    setEinsatzort(e.target.value);
                    if (deployAttempted) setDeployAttempted(false);
                  }}
                  onBlur={() => {
                    if (einsatzort.trim())
                      void updateLocation({
                        id: r.id,
                        label: einsatzort.trim(),
                        at: messageTime,
                      });
                  }}
                  className={clsx(
                    "w-full rounded border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:outline-none",
                    invalid
                      ? "border-danger focus:ring-danger"
                      : "border-border focus:ring-primary",
                  )}
                />
                {invalid && (
                  <span className="mt-0.5 block text-xs text-danger">
                    {t("resource.validation.einsatzortRequired")}
                  </span>
                )}
              </label>
            );
          })()}

          {actionError && <p className="text-xs text-danger">{t(`errors.${actionError.code}`)}</p>}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="success"
              disabled={busy}
              onClick={() => {
                if (!hauptaufgabe.trim() || !einsatzort.trim()) {
                  setDeployAttempted(true);
                  return;
                }
                void deploy({ id: r.id, at: messageTime }).then(onActionComplete);
              }}
            >
              {t("resource.actions.deploy")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="light"
              disabled={busy}
              onClick={() => void relieveAndAttach(null)}
            >
              {t("resource.actions.dismiss")}
            </Button>
          </div>
        </>
      )}

      {/* ── EINGESETZT ──────────────────────────────────────────── */}
      {r.status === "EINGESETZT" && (
        <>
          {/* Successor select — needed for relieve */}
          <label className="block">
            <span className="mb-0.5 block text-xs font-medium text-fg-muted">
              {t("resource.fields.successor")}
            </span>
            <select
              value={successorId}
              disabled={busy || successorCandidates.length === 0}
              onChange={(e) => setSuccessorId(e.target.value)}
              className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            >
              {successorCandidates.length === 0 ? (
                <option value="">{t("resource.fields.noSuccessorAvailable")}</option>
              ) : (
                <>
                  <option value="">{t("resource.fields.selectSuccessor")}</option>
                  {successorCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {qualifiedFormation(
                        t(`resource.formation.${candidate.formation}`),
                        candidate.homeLocation?.name,
                      )}
                      {candidate.name ? ` — ${candidate.name}` : ""}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>

          {actionError && <p className="text-xs text-danger">{t(`errors.${actionError.code}`)}</p>}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="warning"
              disabled={busy}
              onClick={() => void standDownAndClear()}
            >
              {t("resource.actions.standDown")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="light"
              disabled={busy || !successorId}
              onClick={() => void relieveAndAttach(successorId)}
            >
              {t("resource.actions.relieve")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="light"
              disabled={busy}
              onClick={() => void relieveAndAttach(null)}
            >
              {t("resource.actions.dismiss")}
            </Button>
          </div>
        </>
      )}

      {/* ── ABGELOEST ───────────────────────────────────────────── */}
      {r.status === "ABGELOEST" && successor && (
        <p className="text-xs text-fg-muted">
          {t("resource.fields.relievedThrough")}:{" "}
          {successor.name || t(`resource.size.${successor.size}`)}
          {successor.contact &&
            ` · ${t(`medium.${successor.contact.medium}`)}${successor.contact.detail ? `: ${successor.contact.detail}` : ""}`}
        </p>
      )}
    </div>
  );
}

// ── AlertResourceForm ─────────────────────────────────────────────────────────

type FormationMeta = { key: ResourceFormation; babsId: string };
type SizeMeta = { key: ResourceUnitSize; babsId: string; min: number; max: number };

const FORMATIONS: FormationMeta[] = [
  { key: "FW", babsId: "4702" },
  { key: "SAN", babsId: "4703" },
  { key: "ZS", babsId: "4704" },
  { key: "POL", babsId: "4701" },
  { key: "TECHNB", babsId: "4705" },
  { key: "ARMEE", babsId: "4706" },
  { key: "OTHER", babsId: "4707" },
];

const SIZES: SizeMeta[] = [
  { key: "TRUPP", babsId: "4801", min: 1, max: 2 },
  { key: "GRUPPE", babsId: "4802", min: 3, max: 12 },
  { key: "ZUG", babsId: "4803", min: 13, max: 60 },
  { key: "KOMPANIE", babsId: "4804", min: 61, max: 300 },
  { key: "BATAILLON", babsId: "4805", min: 301, max: Infinity },
];

// formation → hundreds prefix for combined BABS icon
const FORMATION_PREFIX: Record<ResourceFormation, string> = {
  POL: "41",
  FW: "42",
  SAN: "43",
  ZS: "44",
  TECHNB: "45",
  ARMEE: "46",
  OTHER: "48",
};
// size → unit offset (01–05)
const SIZE_OFFSET: Record<ResourceUnitSize, string> = {
  TRUPP: "01",
  GRUPPE: "02",
  ZUG: "03",
  KOMPANIE: "04",
  BATAILLON: "05",
};

function combinedBabsId(
  formation: ResourceFormation | null,
  size: ResourceUnitSize | null,
): string | null {
  if (!formation || !size) return null;
  return FORMATION_PREFIX[formation] + SIZE_OFFSET[size];
}

function suggestSize(count: number): ResourceUnitSize | null {
  const match = SIZES.find((s) => count >= s.min && count <= s.max);
  return match?.key ?? null;
}

function AlertResourceForm({
  incidentId,
  schadenplaetze,
  sourceMessageId,
  messageTime,
  iconsLoaded,
  existingResources,
  onAlerted,
  onReplaced,
  onCancelled,
}: {
  incidentId: string;
  schadenplaetze: SchadenplatzWithResources[];
  sourceMessageId?: string;
  messageTime?: Date;
  iconsLoaded: boolean;
  existingResources: Resource[];
  onAlerted?: (tempId: string) => void;
  onReplaced?: (tempId: string, realId: string) => void;
  onCancelled?: (tempId: string) => void;
}) {
  const { t } = useTranslation();
  const [alertResource, alertState] = useAlertResource();

  const defaultSp = schadenplaetze.find((sp) => sp.isDefault);
  const [open, setOpen] = useState(false);
  const [formation, setFormation] = useState<ResourceFormation | null>(null);
  const [name, setName] = useState("");
  const [personnelCount, setPersonnelCount] = useState("");
  const [hauptaufgabe, setHauptaufgabe] = useState("");
  const [homeLocation, setHomeLocation] = useState("");
  // New resources always go to the default SP; Schadenplatz assignment happens at deploy time.
  const schadenplatzId = defaultSp?.id ?? "";

  const derivedSize = personnelCount ? suggestSize(Number(personnelCount)) : null;
  const previewBabsId =
    combinedBabsId(formation, derivedSize) ??
    (formation ? (FORMATIONS.find((f) => f.key === formation)?.babsId ?? null) : null);

  const canSubmit = !!formation && !!derivedSize && !!name.trim() && !!homeLocation.trim();
  const identityConflict = existingResources.some(
    (resource) =>
      resource.status !== "ABGELOEST" &&
      resource.formation === formation &&
      resource.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase() &&
      (resource.homeLocation?.name ?? "").trim().toLocaleLowerCase() ===
        homeLocation.trim().toLocaleLowerCase(),
  );

  const handleSubmit = () => {
    if (identityConflict || !formation || !derivedSize) return;

    const tempId = `temp-alert-${Date.now()}`;
    // alertResource applies the optimistic update synchronously before its first await,
    // so by the time we call onAlerted below the resource is already in the Apollo cache.
    const mutationPromise = alertResource({
      incidentId,
      schadenplatzId,
      formation,
      name: name.trim(),
      size: derivedSize,
      personnelCount: Number(personnelCount) || 0,
      hauptaufgabe: hauptaufgabe.trim(),
      homeLocation: { name: homeLocation.trim() },
      sourceMessageId,
      occurredAt: messageTime,
      tempId,
    });

    // Immediately select and close — the optimistic resource is already in cache.
    onAlerted?.(tempId);
    setOpen(false);
    setFormation(null);
    setName("");
    setPersonnelCount("");
    setHauptaufgabe("");
    setHomeLocation("");

    void mutationPromise.then(
      (result) => {
        if (result.resourceId !== tempId) onReplaced?.(tempId, result.resourceId);
      },
      () => {
        onCancelled?.(tempId);
      },
    );
  };

  if (!open) {
    return (
      <button
        type="button"
        className="mt-2 text-sm text-primary hover:underline"
        onClick={() => setOpen(true)}
      >
        + {t("resource.newResource")}
      </button>
    );
  }

  return (
    <div className="relative mt-3 space-y-3 rounded border border-border bg-bg p-3">
      <button
        type="button"
        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-bg-elevated hover:text-fg"
        aria-label="Close resource form"
        title="Close resource form"
        onClick={() => setOpen(false)}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
      {/* Formation picker */}
      <div>
        <p className="mb-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">
          {t("resource.selectFormation")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {FORMATIONS.map((f) => (
            <button
              key={f.key}
              type="button"
              title={t(`resource.formation.${f.key}`)}
              onClick={() => setFormation(f.key)}
              className={clsx(
                "flex h-10 w-10 items-center justify-center rounded border transition-colors",
                formation === f.key
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border bg-bg-elevated hover:border-primary/40",
              )}
            >
              {iconsLoaded ? (
                <BabsIcon icon={f.babsId} size={28} fallback={null} />
              ) : (
                <span className="text-xs font-bold">{f.key}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Fields + large icon preview */}
      <div className="flex items-start gap-4">
        <div className="grid flex-1 grid-cols-2 gap-2">
          {/* homeLocation = organisation qualifier: "Altdorf" → "Feuerwehr Altdorf" */}
          <label className="col-span-2 text-xs font-semibold text-fg-muted">
            {t("resource.fields.homeLocation")}
            <input
              id="resource-home-location"
              type="text"
              value={homeLocation}
              onChange={(e) => setHomeLocation(e.target.value)}
              placeholder={t("resource.fields.homeLocationPlaceholder")}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-normal focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>
          {/* name = sub-unit description: "Gruppe 3" → "Feuerwehr Altdorf – Gruppe 3" */}
          <label className="col-span-2 text-xs font-semibold text-fg-muted">
            {t("resource.fields.name")}
            <input
              id="resource-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("resource.fields.namePlaceholder")}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-normal focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>
          <label className="text-xs font-semibold text-fg-muted">
            {t("resource.fields.personnelCount")}
            <input
              id="resource-personnel-count"
              type="number"
              value={personnelCount}
              min={0}
              onChange={(e) => setPersonnelCount(e.target.value)}
              placeholder={t("resource.fields.personnelCount")}
              className="mt-1 w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm font-normal focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>
        </div>

        {/* Large icon preview — distinct from the small picker buttons */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-border bg-bg-elevated">
            {previewBabsId && iconsLoaded ? (
              <BabsIcon icon={previewBabsId} size={72} fallback={null} />
            ) : (
              <span className="px-1 text-center text-[10px] leading-tight text-fg-muted/50">
                {t("resource.selectFormation")}
              </span>
            )}
          </div>
          {formation && (
            <p className="text-center text-[10px] leading-tight text-fg-muted">
              {qualifiedFormation(t(`resource.formation.${formation}`), homeLocation || null)}
              {name && (
                <>
                  <br />
                  <span className="text-fg-muted/70">{name}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {derivedSize && (
        <p className="text-xs text-fg-muted">
          {t(`resource.size.${derivedSize}`)}
          {Number(personnelCount) > 0 &&
            ` · ${personnelCount} ${t("resource.fields.personnelCount")}`}
        </p>
      )}

      {alertState.error && (
        <p className="text-xs text-danger">{t(`errors.${alertState.error.code}`)}</p>
      )}
      {identityConflict && (
        <p className="text-xs text-danger">{t("resource.validation.duplicateIdentity")}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="primary"
          size="xs"
          disabled={!canSubmit || identityConflict || alertState.loading}
          onClick={handleSubmit}
        >
          {alertState.loading ? t("resource.alerting") : t("resource.addResource")}
        </Button>
      </div>
    </div>
  );
}

export default TriageView;
