import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import dayjs from "dayjs";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import {
  useAcknowledgeMessage,
  useIncidentMessages,
  useRevokeMessageAcknowledgement,
} from "api/message";
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
  const [revoke, revokeState] = useRevokeMessageAcknowledgement();

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

  const mutationError = acknowledgeState.error ?? revokeState.error;
  const mapLabel = divisionLongLabel(mapDivision, t);

  const handleFinish = async () => {
    if (!selected) return;

    try {
      await acknowledge({ messageId: selected.id, divisionId: mapDivision.id });
      selection.handled(selected.id);
    } catch {
      // acknowledgeState.error renders the notification
    }
  };

  const handleReopen = async () => {
    if (!selected) return;

    try {
      await revoke({ messageId: selected.id, divisionId: mapDivision.id });
    } catch {
      // revokeState.error renders the notification
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
          onSelect={selection.select}
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
              label={`${t("messageMap.pending")} (${undrawn.length})`}
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
        {selected === undefined ? (
          <EmptyState allDrawn={mapMessages.length > 0 && undrawn.length === 0} />
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
                  <Button
                    variant="light"
                    size="sm"
                    disabled={revokeState.loading || incidentClosed}
                    onClick={() => void handleReopen()}
                  >
                    {t("messageMap.reopen")}
                  </Button>
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
                drawingMessage={{ id: selected.id, time: selected.time }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ allDrawn }: { allDrawn: boolean }) {
  const { t } = useTranslation();

  return (
    <div className={clsx("flex flex-1 items-center justify-center", allDrawn && "text-success")}>
      <div className="text-center">
        {allDrawn && <FontAwesomeIcon icon={faCheckCircle} className="mb-3 text-5xl" />}
        <p className="text-lg font-bold">
          {allDrawn ? t("messageMap.allDrawn") : t("messageMap.noMessages")}
        </p>
        {!allDrawn && <p className="mt-1 text-sm text-fg-muted">{t("messageMap.pickMessage")}</p>}
      </div>
    </div>
  );
}

export default MessageMapView;
