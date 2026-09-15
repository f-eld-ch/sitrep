import { faCheck, faMinus, faPrint, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { clsx } from "clsx";
import reject from "lodash/reject";
import union from "lodash/union";
import { Fragment, ViewTransition, useTransition, useState, useRef, useContext, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useReactToPrint } from "react-to-print";
import { useParams } from "react-router";
import { type Division, PriorityStatus, TriageStatus } from "types";
import type { Message } from "types/journal";
import { Button, Notification } from "components/ui";
import { Spinner } from "components";
import { useIncidentMessages, useTriageMessage } from "api";
import { type MessageEditorFormHandle } from "./Editor";
import { type MessageFilters } from "./listUtils";
import { NewForm as TaskNew } from "../measures/tasks";
import { MessageEditorForm } from "./Editor";
import { default as JournalMessage } from "./Message";
import MessageSheet from "./MessageSheet";
import { buildMessageList } from "./listUtils";
import { MessageStack } from "./MessageStack";
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

function PrintSheetButton({
  message,
  divisions,
  variant = "footer",
}: {
  message: Message;
  divisions: Division[];
  variant?: "footer" | "inline";
}) {
  const { t } = useTranslation();
  const [showForPrint, setShowForPrint] = useState(false);
  const sheetRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: sheetRef,
    pageStyle: "@page { size: A4 portrait; margin: 1cm; }",
    onAfterPrint: () => setShowForPrint(false),
  });
  const handlePrintRef = useRef(handlePrint);
  useLayoutEffect(() => { handlePrintRef.current = handlePrint; });
  useEffect(() => { if (showForPrint) handlePrintRef.current(); }, [showForPrint]);

  return (
    <>
      {variant === "footer" ? (
        <Button type="button" variant="light" size="sm" onClick={() => setShowForPrint(true)}>
          <FontAwesomeIcon icon={faPrint} className="mr-1.5" />
          {t("messageSheet")}
        </Button>
      ) : (
        <Button type="button" variant="primary" size="sm" onClick={() => setShowForPrint(true)}>
          <FontAwesomeIcon icon={faPrint} className="mr-1.5" />
          {t("messageSheet")}
        </Button>
      )}
      {showForPrint && (
        <div className="hidden">
          <MessageSheet ref={sheetRef} message={message} divisions={divisions} />
        </div>
      )}
    </>
  );
}

function TriagePanel(props: { message: Message; incidentId: string; onSaved: () => void }) {
  const { message, incidentId, onSaved } = props;
  return <PanelForm key={message.id} message={message} incidentId={incidentId} onSaved={onSaved} />;
}

function PanelForm(props: {
  message: Message;
  incidentId: string;
  onSaved: () => void;
}) {
  const { message, incidentId, onSaved } = props;
  const { t } = useTranslation();
  const { state: incidentState } = useContext(IncidentContext);
  const incidentDivisions = incidentState.incident?.divisions ?? [];
  const showTasks = useBooleanFlagValue("show-tasks", false);

  const [triageMessage, triageState] = useTriageMessage();
  const [priority, setPriority] = useState<PriorityStatus>(message.priorityId);
  const [casualties, setCasualties] = useState<CasualtyDeltas>({
    vermisste: 0,
    tote: 0,
    verletzte: 0,
    obdachlose: 0,
    eingeschlossene: 0,
  });
  const [assignments, setAssignments] = useState<Division[]>(
    message.divisions.map((d) => d.division),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [liveMessage, setLiveMessage] = useState<Message>(message);
  const editorRef = useRef<MessageEditorFormHandle>(null);
  const savedAssignments = useRef<Division[] | null>(null);

  const isPending =
    message.triageId === TriageStatus.Pending || message.triageId === TriageStatus.Reset;

  const steps: StepDef[] = [
    ...(isPending ? [{ key: "meldung", label: t("stepMeldung") }] : []),
    { key: "meldefluss", label: t("messageFlow") },
    ...(showTasks ? [{ key: "pendenzen", label: t("tasks") }] : []),
    { key: "personen", label: t("stepPersonen") },
    { key: "mittel", label: t("stepMittel") },
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

  const handleSave = useCallback((triage: TriageStatus) => {
    onSaved();
    triageMessage({
      incidentId,
      messageId: message.id,
      priority: triage === TriageStatus.MoreInfo ? PriorityStatus.Normal : priority,
      triage,
      divisionIds: assignments.map((d) => d.id),
      divisions: assignments,
    }).catch(() => {});
  }, [onSaved, triageMessage, incidentId, message.id, priority, assignments]);

  const handleNext = useCallback(() => {
    if (isLast) {
      handleSave(TriageStatus.Triaged);
    } else {
      if (currentStep.key === "meldung") void editorRef.current?.save();
      setStepIndex((i) => i + 1);
    }
  }, [isLast, currentStep.key, handleSave]);

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Message context — scrollable so tall content doesn't hide the stepper */}
      <div className="max-h-[40%] overflow-y-auto px-5 pt-4 pb-3">
        {!isPending && (
          <div className="mb-2 flex justify-end">
            <PrintSheetButton
              message={message}
              divisions={incidentDivisions}
              variant="inline"
            />
          </div>
        )}
        <JournalMessage
          showControls={false}
          stabilizeActionBar
          id={message.id}
          incidentId={incidentId}
          message={previewMessage}
          divisions={assignments}
          setEditorMessage={undefined}
          setTriageMessage={undefined}
        />
      </div>

      {/* Step navigator */}
      <Stepper steps={steps} current={safeIndex} onChange={setStepIndex} />

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-5">
        {triageState.error && (
          <Notification variant="danger" className="mb-4">
            {t(`errors.${triageState.error.code}`)}
          </Notification>
        )}

        {currentStep.key === "meldung" && (
          <MessageEditorForm
            ref={editorRef}
            message={message}
            incidentId={incidentId}
            onLiveMessage={setLiveMessage}
            title={t("stepMeldungReview")}
          />
        )}

        {currentStep.key === "meldefluss" && (
          <div className="flex flex-col gap-6">
            <div>
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
                          onClick={() => setAssignments(reject(assignments, (e) => e.id === d.id))}
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

            <div>
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
          </div>
        )}

        {currentStep.key === "pendenzen" && (
          <>
            <h3 className="mb-3 text-base font-bold">{t("tasks")}</h3>
            <TaskNew />
          </>
        )}

        {currentStep.key === "personen" && (
          <div>
            <h3 className="mb-4 text-base font-bold">{t("stepPersonen")}</h3>
            <CasualtySection value={casualties} onChange={setCasualties} />
          </div>
        )}

        {currentStep.key === "mittel" && (
          <h3 className="mb-3 text-base font-bold">{t("stepMittel")}</h3>
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
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              if (currentStep.key === "meldung") {
                void editorRef.current?.save();
              }
              setStepIndex((i) => i + 1);
            }}
          >
            {t("next")}
          </Button>
        ) : (
          <>
            <PrintSheetButton message={previewMessage} divisions={incidentDivisions} />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={triageState.loading}
              onClick={() => handleSave(TriageStatus.Triaged)}
            >
              {t("saveTriage")}
            </Button>
          </>
        )}
      </footer>
    </div>
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
    () => ({ triage: "all", priority: "all", assignment: "all", ...filters }),
    // filters is a prop object; spread means we depend on its identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters],
  );

  const messages = useMemo(
    () => (result.status === "ready" ? buildMessageList(result.data.messages, resolvedFilters) : []),
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

  const handleSelect = useCallback((id: string | undefined) => {
    startTransition(() => {
      setCaughtUp(false);
      setSelectedId(id);
    });
  }, [startTransition]);

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
      <MessageStack
        messages={messages}
        effectiveId={effectiveId}
        onSelect={handleSelect}
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
  { key: "vermisste",      labelKey: "casualties.vermisste",      babsId: "1302" },
  { key: "tote",           labelKey: "casualties.tote",           babsId: "1305" },
  { key: "verletzte",      labelKey: "casualties.verletzte",      babsId: "1301" },
  { key: "obdachlose",     labelKey: "casualties.obdachlose",     babsId: "1303" },
  { key: "eingeschlossene",labelKey: "casualties.eingeschlossene",babsId: "1304" },
];

function CasualtySection({
  value,
  onChange,
}: {
  value: CasualtyDeltas;
  onChange: (v: CasualtyDeltas) => void;
}) {
  const { t, i18n } = useTranslation();
  const iconsLoaded = useBabsIcons();

  const set = (key: keyof CasualtyDeltas, delta: number) =>
    onChange({ ...value, [key]: delta });

  const nonZero = CASUALTY_CATEGORIES.filter((cat) => value[cat.key] !== 0);

  return (
    <BabsIconProvider lang={i18n.resolvedLanguage ?? i18n.language}>
      <div className="flex gap-3">
        {/* Counter list */}
        <div className="w-1/2 divide-y divide-border">
          {CASUALTY_CATEGORIES.map((cat) => (
            <CasualtyRow
              key={cat.key}
              category={cat}
              delta={value[cat.key]}
              iconsLoaded={iconsLoaded}
              onChange={(d) => set(cat.key, d)}
            />
          ))}
        </div>

        {/* Summary */}
        <div className="w-1/2 rounded-lg border border-border bg-bg p-3">
          <p className="mb-2 text-sm font-semibold text-danger uppercase tracking-wide">{t("casualties.summary")}</p>
          {nonZero.length === 0 ? (
            <p className="text-center text-sm text-fg-muted/50 mt-2">–</p>
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
    </BabsIconProvider>
  );
}

function CasualtyRow({
  category,
  delta,
  iconsLoaded,
  onChange,
}: {
  category: CasualtyCategory;
  delta: number;
  iconsLoaded: boolean;
  onChange: (delta: number) => void;
}) {
  const { t } = useTranslation();
  const label = t(category.labelKey);
  const adjust = (n: number) => onChange(delta + n);

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
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          aria-label={`${label} −1`}
          onClick={() => adjust(-1)}
          className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs hover:bg-bg-elevated"
        >
          <FontAwesomeIcon icon={faMinus} className="text-[10px]" />
        </button>
        <input
          type="number"
          value={delta}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
          className="w-10 rounded border border-border bg-bg-elevated px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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

export default TriageView;
