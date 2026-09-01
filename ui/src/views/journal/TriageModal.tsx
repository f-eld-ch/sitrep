import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import classNames from "classnames";
import { Spinner } from "components";
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
    <div
      className={classNames({
        modal: true,
        "is-active": true,
        "has-text-black": true,
        "has-text-weight-normal": true,
        "is-size-6": true,
        "is-dark": true,
      })}
    >
      <div className="modal-background" />
      <div className="modal-card">
        <header className="modal-card-head">
          <p className="modal-card-title is-size-5">{t("messageTriageTitle")}</p>
          <button
            type="button"
            className="delete"
            aria-label="close"
            onClick={() => setMessage(undefined)}
          />
        </header>
        {result.status === "loading" && (
          <section className="modal-card-body">
            <Spinner />
          </section>
        )}
        {result.status === "error" && (
          <section className="modal-card-body">
            <div className="notification is-danger">{t(`errors.${result.error.code}`)}</div>
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

  const handleSave = async (triage: TriageStatus) => {
    if (!incidentId) return;
    try {
      await triageMessage({
        incidentId,
        messageId: message.id,
        priority,
        triage,
        divisionIds: assignments.map((d) => d.id),
      });
      setMessage(undefined);
    } catch {
      // triageState.error is set; modal stays open so user can retry
    }
  };

  return (
    <>
      <section className="modal-card-body">
        {triageState.error && (
          <div className="notification is-danger">{t(`errors.${triageState.error.code}`)}</div>
        )}
        <div className="container mb-5">
          <JournalMessage
            showControls={false}
            id={message.id}
            message={message}
            divisions={assignments}
            setEditorMessage={undefined}
            setTriageMessage={undefined}
          />
        </div>
        <div className="container">
          <div className="block">
            <div className="columns">
              <div className="column">
                <h3 className="title is-size-5">{t("messageFlow")}</h3>
                <div className="field is-grouped is-grouped-multiline">
                  {data.incidentDivisions.map((d) => {
                    const isPresent = assignments.some((e) => e.name === d.name);
                    const tagsClass = classNames({
                      tag: true,
                      "is-primary": isPresent,
                      "is-dark": !isPresent,
                    });
                    return (
                      <div key={d.name} className="control">
                        <div className="tags has-addons">
                          <div className={tagsClass}>{d.description || d.name}</div>
                          {isPresent ? (
                            <a
                              className="tag is-light is-primary"
                              onClick={() =>
                                setAssignments(reject(assignments, (e) => e.id === d.id))
                              }
                            >
                              <FontAwesomeIcon icon={faMinus} />
                            </a>
                          ) : (
                            <a
                              className="tag is-success is-light"
                              onClick={() => setAssignments(union(assignments, [d]))}
                            >
                              <FontAwesomeIcon icon={faPlus} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="column">
                <h3 className="title is-size-5">{t("assignPriority")}</h3>
                <div className="select is-rounded is-small">
                  <select
                    defaultValue={message.priorityId}
                    onChange={(e) => {
                      e.preventDefault();
                      const prio = Object.values(PriorityStatus).find((p) => p === e.target.value);
                      if (prio !== undefined) setPriority(prio);
                    }}
                  >
                    {Object.values(PriorityStatus).map((prio: PriorityStatus) => (
                      <option
                        key={prio}
                        label={
                          t([`priority.${prio}`, `priority.${PriorityStatus.Normal}`]) as string
                        }
                      >
                        {prio}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {showTasks && (
                <div className="column">
                  <h3 className="title is-size-5">{t("createNewTask")}</h3>
                  <TaskNew />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <footer className="modal-card-foot">
        <div className="buttons are-normal">
          <button
            type="submit"
            className="button is-rounded is-primary is-small"
            disabled={triageState.loading}
            onClick={() => handleSave(TriageStatus.Triaged)}
          >
            {t("saveTriage")}
          </button>
          <button
            type="submit"
            className="button is-rounded is-small"
            disabled={triageState.loading}
            onClick={() => handleSave(TriageStatus.MoreInfo)}
          >
            {t("saveMoreInfo")}
          </button>
        </div>
      </footer>
    </>
  );
}

export default Triage;
