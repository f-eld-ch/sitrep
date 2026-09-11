import { faMinus, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { Spinner } from "components";
import { Button, Notification } from "components/ui";
import reject from "lodash/reject";
import union from "lodash/union";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { type Division, PriorityStatus, TriageStatus } from "types";
import type { Message } from "types/journal";
import { type MessageForTriageData, useMessageForTriage, useTriageMessage } from "api";
import { NewForm as TaskNew } from "../measures/tasks";
import { default as JournalMessage } from "./Message";

const selectClass =
  "rounded-full border border-border px-3 py-1 text-sm bg-bg text-fg focus:outline-none focus:ring-1 focus:ring-primary";

function Triage(props: {
  message: Message | undefined;
  setMessage: (message: Message | undefined) => void;
}) {
  const { message, setMessage } = props;
  const { t } = useTranslation();
  const { incidentId } = useParams();
  const result = useMessageForTriage(message?.id, incidentId);

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={() => setMessage(undefined)} />
      {/* Card */}
      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-bg-elevated shadow-xl">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <p className="text-lg font-semibold">{t("messageTriageTitle")}</p>
          <button
            type="button"
            className="p-1 leading-none text-fg-muted hover:text-fg"
            aria-label={t("close")}
            onClick={() => setMessage(undefined)}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </header>

        {result.status === "loading" && (
          <section className="flex justify-center px-5 py-8">
            <Spinner />
          </section>
        )}
        {result.status === "error" && (
          <section className="px-5 py-4">
            <Notification variant="danger">{t(`errors.${result.error.code}`)}</Notification>
          </section>
        )}
        {result.status === "ready" && (
          <TriageForm
            key={message.id}
            message={message}
            data={result.data}
            setMessage={setMessage}
          />
        )}
      </div>
    </div>
  );
}

function TriageForm(props: {
  message: Message;
  data: MessageForTriageData;
  setMessage: (message: Message | undefined) => void;
}) {
  const { message, data, setMessage } = props;
  const { incidentId } = useParams();
  const { t } = useTranslation();
  const showTasks = useBooleanFlagValue("show-tasks", false);

  const [triageMessage, triageState] = useTriageMessage();
  const [priority, setPriority] = useState<PriorityStatus>(data.message.priorityId);
  const [assignments, setAssignments] = useState<Division[]>(
    data.message.divisions.map((d) => d.division),
  );
  const previewMessage: Message = {
    ...message,
    priorityId: priority,
    divisions: assignments.map((division) => ({ division })),
  };

  const handleSave = (triage: TriageStatus) => {
    if (!incidentId) return;
    setMessage(undefined);
    triageMessage({
      incidentId,
      messageId: message.id,
      priority: triage === TriageStatus.MoreInfo ? PriorityStatus.Normal : priority,
      triage,
      divisionIds: assignments.map((d) => d.id),
      divisions: assignments,
    }).catch(() => {});
  };

  return (
    <>
      {/* Body */}
      <section className="flex-1 overflow-y-auto px-5 py-4">
        {triageState.error && (
          <Notification variant="danger" className="mb-4">
            {t(`errors.${triageState.error.code}`)}
          </Notification>
        )}

        {/* Message preview */}
        <div className="mb-5">
          <JournalMessage
            showControls={false}
            id={message.id}
            incidentId={incidentId ?? ""}
            message={previewMessage}
            divisions={assignments}
            setEditorMessage={undefined}
            setTriageMessage={undefined}
          />
        </div>

        <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap">
          {/* Division assignment */}
          <div className="min-w-0 sm:flex-1">
            <h3 className="mb-3 text-base font-bold">{t("messageFlow")}</h3>
            <div className="flex flex-wrap gap-2">
              {data.incidentDivisions.map((d) => {
                const isPresent = assignments.some((e) => e.name === d.name);
                return (
                  <div key={d.name} className="flex overflow-hidden rounded text-xs font-semibold">
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

          {/* Priority */}
          <div className="shrink-0">
            <h3 className="mb-3 text-base font-bold">{t("assignPriority")}</h3>
            <select
              value={priority}
              className={selectClass}
              onChange={(e) => {
                e.preventDefault();
                const prio = Object.values(PriorityStatus).find((p) => p === e.target.value);
                if (prio !== undefined) setPriority(prio);
              }}
            >
              {Object.values(PriorityStatus).map((prio: PriorityStatus) => (
                <option
                  key={prio}
                  label={t([`priority.${prio}`, `priority.${PriorityStatus.Normal}`]) as string}
                >
                  {prio}
                </option>
              ))}
            </select>
          </div>

          {showTasks && (
            <div className="min-w-0 sm:flex-1">
              <h3 className="mb-3 text-base font-bold">{t("createNewTask")}</h3>
              <TaskNew />
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="flex shrink-0 gap-2 border-t border-border px-5 py-4">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={triageState.loading}
          onClick={() => handleSave(TriageStatus.Triaged)}
        >
          {t("saveTriage")}
        </Button>
        <Button
          type="submit"
          variant="light"
          size="sm"
          disabled={triageState.loading}
          onClick={() => handleSave(TriageStatus.MoreInfo)}
        >
          {t("saveMoreInfo")}
        </Button>
      </footer>
    </>
  );
}

export default Triage;
