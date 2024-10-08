/* eslint-disable jsx-a11y/anchor-has-content */
/* eslint-disable jsx-a11y/anchor-is-valid */
import { useLazyQuery, useMutation } from "@apollo/client";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { Spinner } from "components";
import reject from "lodash/reject";
import union from "lodash/union";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Division, PriorityStatus, TriageMessageData, TriageMessageVars, TriageStatus } from "types";
import { Message, MessageDivision, SaveMessageTriageData, SaveMessageTriageVars } from "types/journal";
import { NewForm as TaskNew } from "../measures/tasks";
import { default as JournalMessage } from "./Message";
import { GetJournalMessages, GetMessageForTriage, SaveMessageTriage } from "./graphql";

function Triage(props: { message: Message | undefined; setMessage: (message: Message | undefined) => void }) {
  const { message, setMessage } = props;
  const { journalId } = useParams();
  const { t } = useTranslation();

  const [loadMessage, { loading, error, data }] = useLazyQuery<TriageMessageData, TriageMessageVars>(
    GetMessageForTriage,
    {
      variables: { messageId: props.message?.id },
      fetchPolicy: "cache-and-network",
      onCompleted: (data) => {
        setAssignments(data?.messagesByPk.divisions.map((d) => d.division));
        setPriority(
          Object.values(PriorityStatus).find((p) => p === data.messagesByPk.priorityId) || PriorityStatus.Normal,
        );
      },
    },
  );

  const [saveMessageTriage, { error: errorSet }] = useMutation<SaveMessageTriageData, SaveMessageTriageVars>(
    SaveMessageTriage,
    {
      onCompleted() {},
      refetchQueries: [{ query: GetJournalMessages, variables: { journalId: journalId } }],
    },
  );

  const [priority, setPriority] = useState(PriorityStatus.Normal);
  const [assignments, setAssignments] = useState<Division[]>([]);

  useEffect(() => {
    if (props.message !== undefined) loadMessage();
  }, [loadMessage, props.message]);

  const handleSave = (assignments: Division[], messageId: string, prio: PriorityStatus, triage: TriageStatus) => {
    if (message === undefined) return;

    saveMessageTriage({
      variables: {
        priority: prio,
        triage: triage,
        messageId: messageId,
        messageDivisions: assignments.map<MessageDivision>((d) =>
          Object.assign(
            {},
            {
              divisionId: d.id,
              messageId: messageId,
            },
          ),
        ),
      },
      onCompleted() {
        setMessage(undefined);
      },
    });
  };

  if (!message) return null;

  const modalClassNames = classNames({
    modal: true,
    "is-active": message,
    "has-text-black": true,
    "has-text-weight-normal": true,
    "is-size-6": true,
    "is-dark": true,
  });

  return (
    <>
      <div className={modalClassNames}>
        <div className="modal-background"></div>
        <div className="modal-card">
          <header className="modal-card-head">
            <p className="modal-card-title is-size-5">{t("messageTriageTitle")}</p>
            <button className="delete" aria-label="close" onClick={() => setMessage(undefined)}></button>
          </header>
          <section className="modal-card-body">
            {error ? <div className="notification is-danger">Error: {error.message}</div> : <></>}
            {errorSet ? <div className="notification is-danger">Error: {errorSet.message}</div> : <></>}
            {loading ? (
              <Spinner />
            ) : (
              <>
                <div className="container mb-5">
                  <JournalMessage
                    showControls={false}
                    key={message.id}
                    id={message.id}
                    assignments={assignments.map((a) => a.name)}
                    triage={TriageStatus.Triaged}
                    priority={priority}
                    sender={message.sender}
                    receiver={message.receiver}
                    message={message.content}
                    timeDate={new Date(message.time)}
                    setEditorMessage={undefined}
                    setTriageMessage={undefined}
                    origMessage={message}
                  />
                </div>
                <div className="container">
                  <div className="block">
                    <div className="columns">
                      <div className="column">
                        <h3 className="title is-size-5">{t("messageFlow")}</h3>
                        <div className="field is-grouped is-grouped-multiline">
                          {data?.messagesByPk.journal.incident.divisions.map((d) => {
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
                                      onClick={() => setAssignments(reject(assignments, (e) => e.id === d.id))}
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
                                label={t([`priority.${prio}`, `priority.${PriorityStatus.Normal}`]) as string}
                              >
                                {prio}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="column">
                        <h3 className="title is-size-5">{t("createNewTask")}</h3>
                        <TaskNew />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
          <footer className="modal-card-foot">
            <div className="buttons are-normal">
              <button
                className="button is-rounded is-primary is-small"
                onClick={() => {
                  if (message !== undefined) handleSave(assignments, message?.id, priority, TriageStatus.Triaged);
                }}
              >
                {t("saveTriage")}
              </button>
              <button
                className="button is-rounded is-small"
                onClick={() => {
                  if (message !== undefined) handleSave(assignments, message?.id, priority, TriageStatus.MoreInfo);
                }}
              >
                {t(`saveMoreInfo`)}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}

export default Triage;
