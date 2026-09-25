import { faCheck, faMinus, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
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
  useStandDownResource,
  useRelieveResource,
  useUpdatePersonnelCount,
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
      className="scrollbar-none flex items-center gap-1 overflow-x-auto px-5 py-3"
    >
      {steps.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <Fragment key={step.key}>
            {idx > 0 && (
              <div className={clsx("h-px min-w-2 flex-1", done ? "bg-primary/40" : "bg-border")} />
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
              {step.label}
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
    return {
      status: "EINGESETZT",
      personnelCount: activePeriod.personnelCount,
      hauptaufgabe: activePeriod.hauptaufgabe,
      deploymentLabel: activePeriod.deploymentLabel ?? null,
    };
  }

  if (r.relievedAt && ts >= new Date(r.relievedAt).getTime()) {
    return {
      status: "ABGELOEST",
      personnelCount: r.personnelCount,
      hauptaufgabe: "",
      deploymentLabel: null,
    };
  }

  if (r.readyAt && ts >= new Date(r.readyAt).getTime()) {
    return {
      status: "EINSATZBEREIT",
      personnelCount: r.personnelCount,
      hauptaufgabe: "",
      deploymentLabel: null,
    };
  }

  return {
    status: "AUFGEBOTEN",
    personnelCount: r.personnelCount,
    hauptaufgabe: "",
    deploymentLabel: null,
  };
}

function TriageSummary(props: {
  message: Message;
  incidentId: string;
  incidentDivisions: Division[];
  casualties: SchadenplatzCasualtyInput[];
  linkedResourceIds: string[];
  schadenplaetze: SchadenplatzWithResources[];
  iconsLoaded: boolean;
  onAdjust: () => void;
}) {
  const {
    message,
    incidentDivisions,
    casualties,
    linkedResourceIds,
    schadenplaetze,
    iconsLoaded,
    onAdjust,
  } = props;
  const { t, i18n } = useTranslation();

  const allResources = schadenplaetze.flatMap((sp) => sp.resources);
  const linkedResources = linkedResourceIds
    .map((id) => allResources.find((r) => r.id === id))
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
  // Multi-select: IDs of named Schadenplätz chosen by the operator. Default is never in this list.
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

  // When operator selects nothing, casualties/resources go to the default SP implicitly.
  // Personen step: always show default SP + any selected named SPs
  const personenSpIds: string[] = useMemo(
    () => [
      ...(defaultSp ? [defaultSp.id] : []),
      ...selectedSpIds.filter((id) => id !== defaultSp?.id),
    ],
    [defaultSp, selectedSpIds],
  );
  // Mittel step: selected named SPs only, falling back to default if nothing selected
  const effectiveSpIds: string[] =
    selectedSpIds.length > 0 ? selectedSpIds : defaultSp ? [defaultSp.id] : [];

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
    ...(showTasks ? [{ key: "pendenzen", label: t("tasks") }] : []),
    ...(showResources ? [{ key: "personen", label: t("stepPersonen") }] : []),
    ...(showResources ? [{ key: "mittel", label: t("stepMittel") }] : []),
  ];

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
          await recordCasualties({ schadenplatzId: spId, messageId: message.id, deltas });
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

        {/* Step navigator */}
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
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
                <div className="shrink-0">
                  <h3 className="mb-3 text-base font-bold">{t("keyMessage")}</h3>
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

                <div className="min-w-0 flex-1">
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

          {currentStep.key === "personen" && (
            <div className="space-y-6">
              <SchadenplatzStep
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
                createSchadenplatz={createSchadenplatz}
              />
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
                    selectedIds={selectedResourceIds}
                    onToggle={toggleResourceId}
                    onAttach={(ids) =>
                      setSelectedResourceIds((previous) => new Set([...previous, ...ids]))
                    }
                    iconsLoaded={iconsLoaded}
                    messageTime={message.time}
                    incidentId={incidentId}
                  />
                  <AlertResourceForm
                    incidentId={incidentId}
                    schadenplatzId={effectiveSpIds[0] ?? ""}
                    sourceMessageId={message.id}
                    messageTime={message.time}
                    iconsLoaded={iconsLoaded}
                    existingResources={schadenplaetze.flatMap((sp) => sp.resources)}
                    onAlerted={(id) => {
                      setSelectedResourceIds((prev) => new Set([...prev, id]));
                      void resourcesResult.refresh();
                    }}
                  />
                </>
              )}
            </div>
          )}
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
        setSelectedId(id);
      });
    },
    [startTransition],
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
      <FilterableMessageStack
        messages={messages}
        effectiveId={effectiveId}
        onSelect={handleSelect}
        initialFilters={{}}
        className="w-72 shrink-0 lg:w-[36rem]"
      />
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
      <div className="w-1/2 divide-y divide-border">
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

      {/* Summary */}
      <div className="w-1/2 rounded-lg border border-border bg-bg p-3">
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

// ── SchadenplatzStep ──────────────────────────────────────────────────────────

function SchadenplatzStep({
  namedSchadenplaetze,
  selectedIds,
  onToggle,
  incidentId,
  onCreated,
  onReplaced,
  onCancelled,
  createSchadenplatz,
}: {
  namedSchadenplaetze: SchadenplatzWithResources[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  incidentId: string;
  onCreated: (id: string) => void;
  onReplaced: (tempId: string, realId: string) => void;
  onCancelled: (tempId: string) => void;
  createSchadenplatz: (args: {
    incidentId: string;
    name: string;
    tempId?: string;
  }) => Promise<{ id: string; tempId: string }>;
}) {
  const { t } = useTranslation();
  const [showNew, setShowNew] = useState(false);
  const [newSpName, setNewSpName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newSpName.trim()) return;
    setCreating(true);
    // Generate tempId here so we can select the SP optimistically before awaiting
    const tempId = `__optimistic_sp_${Date.now()}`;
    onCreated(tempId);
    try {
      const result = await createSchadenplatz({ incidentId, name: newSpName.trim(), tempId });
      if (result.id !== tempId) {
        onReplaced(tempId, result.id);
      }
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

      {/* Named Schadenplätz — checkboxes. Hidden when only default exists. */}
      {namedSchadenplaetze.length > 0 && (
        <div className="space-y-2">
          {namedSchadenplaetze.map((sp) => {
            const isChecked = selectedIds.includes(sp.id);
            return (
              <label
                key={sp.id}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm transition-colors",
                  isChecked
                    ? "border-primary bg-primary/10"
                    : "border-border bg-bg-elevated hover:border-primary/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggle(sp.id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="flex-1 font-medium text-fg">{sp.name}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Create new */}
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
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newSpName}
              onChange={(e) => setNewSpName(e.target.value)}
              placeholder={t("schadenplatz.namePlaceholder")}
              className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") setShowNew(false);
              }}
            />
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

function ResourcePicker({
  schadenplaetze,
  selectedIds,
  onToggle,
  onAttach,
  iconsLoaded,
  messageTime,
  incidentId,
}: {
  schadenplaetze: SchadenplatzWithResources[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onAttach: (ids: string[]) => void;
  iconsLoaded: boolean;
  messageTime: Date;
  incidentId: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const allResources = schadenplaetze.flatMap((sp) =>
    sp.resources
      .filter((r) => new Date(r.statusAt).getTime() <= messageTime.getTime())
      .map((r) => ({
        ...r,
        _spId: sp.id,
        _spName: sp.isDefault ? t("schadenplatz.defaultHint") : sp.name,
      })),
  );

  const selectedResources = allResources.filter((r) => selectedIds.has(r.id));

  const q = search.trim().toLowerCase();
  const searchResults = q
    ? allResources.filter((r) => {
        if (selectedIds.has(r.id)) return false;
        const qf = qualifiedFormation(
          t(`resource.formation.${r.formation}`),
          r.homeLocation?.name,
        ).toLowerCase();
        return (
          qf.includes(q) || r.name.toLowerCase().includes(q) || r._spName.toLowerCase().includes(q)
        );
      })
    : [];

  return (
    <div className="space-y-2">
      {/* Selected resources */}
      {selectedResources.length > 0 && (
        <div className="divide-y divide-border rounded border border-border">
          {selectedResources.map((r) => (
            <ResourcePickerRow
              key={r.id}
              resource={r}
              currentSpName={r._spName}
              schadenplaetze={schadenplaetze}
              checked={true}
              onToggle={() => onToggle(r.id)}
              onAttach={onAttach}
              iconsLoaded={iconsLoaded}
              messageTime={messageTime}
              incidentId={incidentId}
            />
          ))}
        </div>
      )}

      {/* Search to add more */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("resource.search")}
        className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
      />
      {q &&
        (searchResults.length === 0 ? (
          <p className="px-1 text-sm text-fg-muted italic">{t("resource.noResults")}</p>
        ) : (
          <div className="divide-y divide-border rounded border border-border">
            {searchResults.map((r) => (
              <ResourcePickerRow
                key={r.id}
                resource={r}
                currentSpName={r._spName}
                schadenplaetze={schadenplaetze}
                checked={false}
                onToggle={() => {
                  onToggle(r.id);
                  setSearch("");
                }}
                onAttach={onAttach}
                iconsLoaded={iconsLoaded}
                messageTime={messageTime}
                incidentId={incidentId}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

function ResourcePickerRow({
  resource: r,
  currentSpName,
  schadenplaetze,
  checked,
  onToggle,
  onAttach,
  iconsLoaded,
  messageTime,
  incidentId,
}: {
  resource: Resource;
  currentSpName: string;
  schadenplaetze: SchadenplatzWithResources[];
  checked: boolean;
  onToggle: () => void;
  onAttach: (ids: string[]) => void;
  iconsLoaded: boolean;
  messageTime: Date;
  incidentId: string;
}) {
  const { t } = useTranslation();
  const [markReady, markReadyState] = useMarkResourceReady();
  const [deploy, deployState] = useDeployResource();
  const [standDown, standDownState] = useStandDownResource();
  const [relieve, relieveState] = useRelieveResource();
  const [reassign, reassignState] = useReassignResource();
  const [updateLocation, locationState] = useUpdateDeploymentLocation();
  const [updateContact, contactState] = useUpdateContact();
  const [changeHauptaufgabe, hauptaufgabeState] = useChangeHauptaufgabe();
  const [updatePersonnelCount, personnelCountState] = useUpdatePersonnelCount();

  const [einsatzort, setEinsatzort] = useState(r.deploymentLocation?.label ?? "");
  const [contactMedium, setContactMedium] = useState<ContactMedium>(r.contact?.medium ?? "PHONE");
  const [contactDetail, setContactDetail] = useState(r.contact?.detail ?? "");
  const [hauptaufgabe, setHauptaufgabe] = useState(r.hauptaufgabe);
  const [targetSpId, setTargetSpId] = useState(r.schadenplatzId);
  const [successorId, setSuccessorId] = useState("");
  const [personnelCount, setPersonnelCount] = useState(String(r.personnelCount));
  const [deployAttempted, setDeployAttempted] = useState(false);
  const successorCandidates = schadenplaetze
    .flatMap((sp) => sp.resources)
    .filter((candidate) => candidate.id !== r.id && candidate.status !== "ABGELOEST");
  const successor = r.successorId
    ? schadenplaetze
        .flatMap((sp) => sp.resources)
        .find((candidate) => candidate.id === r.successorId)
    : undefined;
  const relieveAndAttach = async (successorId: string | null) => {
    await relieve({ id: r.id, successorId, at: messageTime, incidentId });
    onAttach(successorId ? [r.id, successorId] : [r.id]);
  };

  const busy =
    markReadyState.loading ||
    deployState.loading ||
    standDownState.loading ||
    relieveState.loading ||
    reassignState.loading ||
    locationState.loading ||
    contactState.loading ||
    hauptaufgabeState.loading ||
    personnelCountState.loading;

  const actionError =
    markReadyState.error ??
    deployState.error ??
    standDownState.error ??
    relieveState.error ??
    reassignState.error ??
    locationState.error ??
    contactState.error ??
    hauptaufgabeState.error ??
    personnelCountState.error;

  const babsId = combinedBabsId(r.formation, r.size);

  return (
    <div className={clsx(checked ? "bg-primary/5" : "")}>
      {/* Header row — click to toggle */}
      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 rounded border-border accent-primary"
        />
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-bg">
          {babsId && iconsLoaded ? (
            <BabsIcon icon={babsId} size={36} fallback={null} />
          ) : (
            <span className="text-xs font-bold text-fg-muted">{r.formation}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">
              {qualifiedFormation(t(`resource.formation.${r.formation}`), r.homeLocation?.name)}
            </span>
            <Tag variant={resourceStatusVariant[r.status]} light size="sm">
              {t(`resource.status.${r.status}`)}
            </Tag>
          </span>
          {r.name && <span className="block truncate text-xs text-fg-muted">{r.name}</span>}
          {r.contact && (
            <span className="block truncate text-xs text-fg-muted">
              {t(`medium.${r.contact.medium}`)}
              {r.contact.detail ? `: ${r.contact.detail}` : ""}
            </span>
          )}
          {r.status === "ABGELOEST" && successor && (
            <span className="block truncate text-xs text-fg-muted">
              {t("resource.fields.relievedThrough")}:{" "}
              {successor.name || t(`resource.size.${successor.size}`)}
              {successor.contact &&
                ` · ${t(`medium.${successor.contact.medium}`)}${successor.contact.detail ? `: ${successor.contact.detail}` : ""}`}
            </span>
          )}
          <span className="block truncate text-xs text-fg-muted/70">
            {r.personnelCount} {t("resource.fields.personnelCount")}
            {r.hauptaufgabe && ` · ${r.hauptaufgabe}`}
          </span>
          <span className="block truncate text-xs text-fg-muted/50">{currentSpName}</span>
        </span>
      </label>

      {/* Expansion panel — shown only when checked */}
      {checked && (
        <div className="space-y-2 border-t border-border/60 bg-bg px-3 pt-2 pb-3">
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
                  await reassign({ id: r.id, schadenplatzId: newSpId });
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

          {/* Personnel count */}
          <label className="block">
            <span className="mb-0.5 block text-xs font-medium text-fg-muted">
              {t("resource.fields.personnelCount")}
            </span>
            <input
              type="number"
              min={0}
              value={personnelCount}
              onChange={(e) => setPersonnelCount(e.target.value)}
              onBlur={() => {
                const n = parseInt(personnelCount, 10);
                if (!isNaN(n) && n !== r.personnelCount)
                  void updatePersonnelCount({ id: r.id, count: n });
              }}
              className="w-full rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </label>

          {/* Hauptaufgabe — only relevant from EINSATZBEREIT onwards */}
          {r.status !== "AUFGEBOTEN" &&
            (() => {
              const required = r.status === "EINSATZBEREIT";
              const invalid = deployAttempted && !hauptaufgabe.trim();
              return (
                <label className="block">
                  <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-fg-muted">
                    {t("resource.fields.hauptaufgabe")}
                    {required && <span className="text-danger">*</span>}
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
                        void changeHauptaufgabe({ id: r.id, hauptaufgabe: hauptaufgabe.trim() });
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

          {/* Einsatzort — only relevant from EINSATZBEREIT onwards */}
          {r.status !== "AUFGEBOTEN" &&
            (() => {
              const required = r.status === "EINSATZBEREIT";
              const invalid = deployAttempted && !einsatzort.trim();
              return (
                <label className="block">
                  <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-fg-muted">
                    {t("resource.fields.deploymentLocation")}
                    {required && <span className="text-danger">*</span>}
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
                        void updateLocation({ id: r.id, label: einsatzort.trim() });
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
                    });
                }}
                placeholder={t("resource.fields.contact")}
                className="flex-1 rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          {actionError && <p className="text-xs text-danger">{t(`errors.${actionError.code}`)}</p>}

          {(r.status === "EINSATZBEREIT" || r.status === "EINGESETZT") && (
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
          )}

          {/* Transition buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {r.status === "AUFGEBOTEN" && (
              <Button
                type="button"
                size="xs"
                variant="primary"
                light
                disabled={busy}
                onClick={() => void markReady({ id: r.id, at: messageTime })}
              >
                {t("resource.actions.markReady")}
              </Button>
            )}
            {r.status === "EINSATZBEREIT" && (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="success"
                  light
                  disabled={busy}
                  onClick={() => {
                    if (!hauptaufgabe.trim() || !einsatzort.trim()) {
                      setDeployAttempted(true);
                      return;
                    }
                    void deploy({ id: r.id, at: messageTime });
                  }}
                >
                  {t("resource.actions.deploy")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="warning"
                  light
                  disabled={busy}
                  onClick={() => void standDown({ id: r.id, at: messageTime })}
                >
                  {t("resource.actions.standDown")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  disabled={busy || !successorId}
                  onClick={() => void relieveAndAttach(successorId)}
                >
                  {t("resource.actions.relieve")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  disabled={busy}
                  onClick={() => void relieveAndAttach(null)}
                >
                  {t("resource.actions.dismiss")}
                </Button>
              </>
            )}
            {r.status === "EINGESETZT" && (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="warning"
                  light
                  disabled={busy}
                  onClick={() => void standDown({ id: r.id, at: messageTime })}
                >
                  {t("resource.actions.standDown")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  disabled={busy || !successorId}
                  onClick={() => void relieveAndAttach(successorId)}
                >
                  {t("resource.actions.relieve")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="light"
                  disabled={busy}
                  onClick={() => void relieveAndAttach(null)}
                >
                  {t("resource.actions.dismiss")}
                </Button>
              </>
            )}
          </div>
        </div>
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
  schadenplatzId,
  sourceMessageId,
  messageTime,
  iconsLoaded,
  existingResources,
  onAlerted,
}: {
  incidentId: string;
  schadenplatzId: string;
  sourceMessageId?: string;
  messageTime?: Date;
  iconsLoaded: boolean;
  existingResources: Resource[];
  onAlerted?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [alertResource, alertState] = useAlertResource();

  const [open, setOpen] = useState(false);
  const [formation, setFormation] = useState<ResourceFormation | null>(null);
  const [name, setName] = useState("");
  const [personnelCount, setPersonnelCount] = useState("");
  const [hauptaufgabe, setHauptaufgabe] = useState("");
  const [homeLocation, setHomeLocation] = useState("");

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

  const handleSubmit = async () => {
    if (identityConflict) return;
    if (!formation || !derivedSize) return;
    try {
      const result = await alertResource({
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
      });
      onAlerted?.(result.resourceId);
      setOpen(false);
      setFormation(null);
      setName("");
      setPersonnelCount("");
      setHauptaufgabe("");
      setHomeLocation("");
    } catch {
      // error shown via alertState.error
    }
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
          onClick={() => void handleSubmit()}
        >
          {alertState.loading ? t("resource.alerting") : t("resource.addResource")}
        </Button>
      </div>
    </div>
  );
}

export default TriageView;
