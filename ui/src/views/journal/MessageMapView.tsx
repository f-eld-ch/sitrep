import { faCheck, faCheckCircle, faPen, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import dayjs from "dayjs";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker, useParams } from "react-router";
import { useAcknowledgeMessage, useIncidentMessages } from "api/message";
import { Spinner } from "components";
import { Button, Notification, PageTitle } from "components/ui";
import { IncidentContext } from "utils";
import { divisionLongLabel } from "utils/divisionLabel";
import { Map as IncidentMap } from "views/map";
import { FilterableMessageStack, FilterChip } from "./FilterableMessageStack";
import { buildMessageList, type MessageFilters } from "./listUtils";
import { default as JournalMessage } from "./Message";
import { useAutoSelectedMessage } from "./useAutoSelectedMessage";

const ALL_FILTERS: MessageFilters = {
  triage: "all",
  priority: "all",
  assignment: "all",
  author: "all",
};

/**
 * The Nachrichtenkarte operator's workplace: the messages triaged to the Nachrichtenkarte on
 * the left, the selected message and a map on the right. Everything drawn while a message is
 * selected is connected to it and takes effect at the message's time, so the map can later be
 * replayed along the incident timeline. "Abschliessen" marks the message as drawn and moves on
 * to the oldest message still to draw.
 */
function MessageMapView() {
  const { incidentId } = useParams();
  const { t } = useTranslation();
  const { state: incidentState } = useContext(IncidentContext);
  const incidentClosed = incidentState.incident?.closedAt != null;
  const result = useIncidentMessages(incidentId ?? "");
  // Like the other filters, a chip: on shows only what is still to draw.
  const [onlyUndrawn, setOnlyUndrawn] = useState(true);
  const [acknowledge, acknowledgeState] = useAcknowledgeMessage();
  // The message whose drawing was unlocked with "Ändern". A message that is already drawn is shown
  // locked, so nothing gets changed by accident; selecting another message locks it again.
  const [editingId, setEditingId] = useState<string | undefined>();
  // Everything drawn is saved at once, but the message is only dealt with once it is finished.
  // Until then it has work in progress, and leaving it (to another message, another page, or by
  // closing the tab) asks first. Cleared by "Abschliessen" and "Fertig".
  const [inProgress, setInProgress] = useState(false);
  const markInProgress = useCallback(() => setInProgress(true), []);
  // The message the user tried to switch to while this one is in progress.
  const [pendingSelect, setPendingSelect] = useState<{ id: string | undefined } | undefined>();
  const blocker = useBlocker(inProgress);

  useEffect(() => {
    if (!inProgress) return;

    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [inProgress]);

  const messages = result.status === "ready" ? result.data.messages : [];
  const mapDivision =
    result.status === "ready"
      ? result.data.incidentDivisions.find((d) => d.kind === "MESSAGE_MAP")
      : undefined;
  const mapDivisionId = mapDivision?.id;

  // Every message triaged to the Nachrichtenkarte, newest first.
  const mapMessages = mapDivisionId
    ? buildMessageList(messages, {
        ...ALL_FILTERS,
        triage: "triaged_only",
        divisionId: mapDivisionId,
      })
    : [];
  const hasDrawn = (m: (typeof mapMessages)[number]) =>
    m.acknowledgements.some((a) => a.divisionId === mapDivisionId);
  const undrawn = mapMessages.filter((m) => !hasDrawn(m));

  // The oldest message still to draw (the list is newest first).
  const selection = useAutoSelectedMessage(undrawn[undrawn.length - 1]?.id);
  const selected = mapMessages.find((m) => m.id === selection.effectiveId);

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

  if (mapDivision === undefined) {
    return (
      <div className="mt-[2.75rem] grow bg-bg p-6">
        <Notification variant="danger" light>
          {t("messageMap.unavailable")}
        </Notification>
      </div>
    );
  }

  const mutationError = acknowledgeState.error;
  const mapLabel = divisionLongLabel(mapDivision, t);

  // Switching messages while one is in progress asks first, like leaving the page does.
  const requestSelect = (id: string | undefined) => {
    if (inProgress && id !== selection.effectiveId) {
      setPendingSelect({ id });
      return;
    }

    selection.select(id);
  };
  const leaveMessage = () => {
    if (pendingSelect) {
      setInProgress(false);
      setEditingId(undefined);
      selection.select(pendingSelect.id);
      setPendingSelect(undefined);
    }

    if (blocker.state === "blocked") blocker.proceed();
  };
  const stayOnMessage = () => {
    setPendingSelect(undefined);
    if (blocker.state === "blocked") blocker.reset();
  };

  const handleFinish = async () => {
    if (!selected) return;

    try {
      await acknowledge({ messageId: selected.id, divisionId: mapDivision.id });
      setInProgress(false);
      selection.handled(selected.id);
    } catch {
      // acknowledgeState.error renders the notification
    }
  };

  return (
    <div className="mt-[2.75rem] flex grow overflow-hidden bg-bg">
      {/* Stack: full-width on mobile when nothing selected, sidebar on desktop */}
      <div
        className={clsx(
          "shrink-0 flex-col lg:flex lg:w-[26rem]",
          selection.isExplicit ? "hidden" : "flex w-full",
        )}
      >
        <FilterableMessageStack
          messages={messages}
          effectiveId={selection.effectiveId}
          onSelect={requestSelect}
          acknowledgementDivisionId={mapDivision.id}
          initialFilters={{}}
          enabledFilters={{ untriaged: false, highPriority: true, mine: false }}
          baseFilter={{
            triage: "triaged_only",
            divisionId: mapDivision.id,
            acknowledgement: onlyUndrawn
              ? { divisionId: mapDivision.id, state: "pending" }
              : undefined,
          }}
          extraChips={
            <FilterChip
              label={
                onlyUndrawn ? `${t("messageMap.pending")} (${undrawn.length})` : t("messageMap.all")
              }
              active={onlyUndrawn}
              onToggle={() => setOnlyUndrawn((v) => !v)}
              activeClassName="bg-warning/15 text-warning border-warning/30"
            />
          }
          className="min-h-0 flex-1"
        />
      </div>

      {/* Workplace: full-width on mobile when selected, always visible on desktop */}
      <div
        className={clsx(
          "min-w-0 flex-1 flex-col overflow-hidden border-l border-border",
          selection.isExplicit ? "flex" : "hidden lg:flex",
        )}
      >
        {(pendingSelect !== undefined || blocker.state === "blocked") && (
          <div className="m-2 flex shrink-0 items-start gap-3 rounded border border-danger/30 bg-danger/10 p-4">
            <p className="flex-1 text-sm">{t("messageMap.unfinished")}</p>
            <Button variant="danger" size="sm" onClick={leaveMessage}>
              {t("messageMap.leave")}
            </Button>
            <button
              type="button"
              aria-label={t("cancel")}
              className="text-fg-muted hover:text-fg"
              onClick={stayOnMessage}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}
        {selected === undefined && mapMessages.length > 0 && undrawn.length === 0 ? (
          <>
            {/* Where the message usually is; below it the map as it stands now. */}
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-4 text-success">
              <FontAwesomeIcon icon={faCheckCircle} className="text-3xl" />
              <p className="text-lg font-bold">{t("messageMap.allDrawn")}</p>
            </div>
            <div className="min-h-0 flex-1">
              <IncidentMap embedded readOnly preferredLayerKind="MESSAGE_MAP" />
            </div>
          </>
        ) : selected === undefined ? (
          <EmptyState />
        ) : (
          <>
            <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
              <PageTitle level={1} className="flex-1 text-base">
                {mapLabel}
                <span className="ml-3 text-sm font-normal text-fg-muted">
                  {t("messageMap.drawing", {
                    number: selected.number,
                    time: dayjs(selected.time).format("HH:mm"),
                  })}
                </span>
              </PageTitle>
              {hasDrawn(selected) ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm text-success">
                    <FontAwesomeIcon icon={faCheckCircle} />
                    {t("messageMap.drawn")}
                  </span>
                  {editingId === selected.id ? (
                    <Button
                      variant="light"
                      size="sm"
                      onClick={() => {
                        setEditingId(undefined);
                        setInProgress(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faCheck} />
                      {t("messageMap.editDone")}
                    </Button>
                  ) : (
                    <Button
                      variant="light"
                      size="sm"
                      disabled={incidentClosed}
                      onClick={() => setEditingId(selected.id)}
                    >
                      <FontAwesomeIcon icon={faPen} />
                      {t("messageMap.edit")}
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={acknowledgeState.loading || incidentClosed}
                  onClick={() => void handleFinish()}
                >
                  {t("messageMap.finish")}
                </Button>
              )}
            </header>
            {mutationError && (
              <Notification variant="danger" light className="m-2">
                {t(`errors.${mutationError.code}`)}
              </Notification>
            )}
            <div className="max-h-[30%] shrink-0 overflow-y-auto px-4 py-2">
              <JournalMessage
                showControls={false}
                id={selected.id}
                incidentId={incidentId ?? ""}
                message={selected}
                divisions={incidentState.incident?.divisions ?? []}
                setEditorMessage={undefined}
                setTriageMessage={undefined}
              />
            </div>
            {/* Everything drawn here belongs to the selected message and takes effect at its time. */}
            <div className="min-h-0 flex-1">
              <IncidentMap
                embedded
                asOf={selected.time}
                onDrawingChange={markInProgress}
                drawingMessage={{
                  id: selected.id,
                  time: selected.time,
                  locked: hasDrawn(selected) && editingId !== selected.id,
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <p className="text-lg font-bold">{t("messageMap.noMessages")}</p>
        <p className="mt-1 text-sm text-fg-muted">{t("messageMap.pickMessage")}</p>
      </div>
    </div>
  );
}

export default MessageMapView;
