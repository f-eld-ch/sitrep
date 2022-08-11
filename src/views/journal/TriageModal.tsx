/* eslint-disable jsx-a11y/anchor-has-content */
/* eslint-disable jsx-a11y/anchor-is-valid */
import { gql, useMutation, useLazyQuery } from "@apollo/client";
import classNames from "classnames";
import { JournalMessage, Spinner } from "components";
import { union, reject } from "lodash";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Division, PriorityStatus, TriageMessageData, TriageMessageVars, TriageStatus } from "types";
import { Message, MessageDivision, SaveMessageTriageData, SaveMessageTriageVars } from "types/journal";
import { NewForm as TaskNew } from "../tasks";
import { GET_MESSAGES } from "./List";

const GET_MESSAGE_FOR_TRIAGE = gql`
  query GetMessageForTriage($messageId: uuid!) {
    messages_by_pk(id: $messageId) {
      id
      content
      sender
      receiver
      time
      divisions {
        division {
          id
          name
          description
        }
      }
      createdAt
      updatedAt
      deletedAt
      priority {
        name
      }
      triage {
        name
      }
      journal {
        incident {
          divisions {
            id
            name
            description
          }
        }
      }
    }
  }
`;

function Triage(props: {
  message: Message | undefined;
  setMessage: React.Dispatch<React.SetStateAction<Message | undefined>>;
}) {
  const { message, setMessage } = props;
  const { journalId } = useParams();
  const [loadMessage, { loading, error, data }] = useLazyQuery<TriageMessageData, TriageMessageVars>(
    GET_MESSAGE_FOR_TRIAGE,
    {
      variables: { messageId: props.message?.id },
      fetchPolicy: "cache-and-network",
      onCompleted: (data) => {
        setAssignments(data?.messages_by_pk.divisions.map((d) => d.division));
        setPriority(
          Object.values(PriorityStatus).find((p) => p === data.messages_by_pk.priority.name) || PriorityStatus.Normal
        );
      },
    }
  );

  const [saveMessageTriage, { error: errorSet }] = useMutation<SaveMessageTriageData, SaveMessageTriageVars>(
    SAVE_MESSAGE_TRIAGE,
    {
      onCompleted(data) {},
      refetchQueries: [
        // { query: GET_MESSAGE_FOR_TRIAGE, variables: { messageId: props.message?.id } },
        { query: GET_MESSAGES, variables: { journalId: journalId } },
      ],
    }
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
            }
          )
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
            <p className="modal-card-title is-size-2">Triage der Nachricht</p>
            <button className="delete" aria-label="close" onClick={() => setMessage(undefined)}></button>
          </header>
          <section className="modal-card-body">
            {error ? <div className="notification is-danger">Error: {error.message}</div> : <></>}
            {errorSet ? <div className="notification is-danger">Error: {errorSet.message}</div> : <></>}
            {loading ? (
              <Spinner />
            ) : (
              <>
                <div className="container is-clearfix" style={{ all: "revert" }}>
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
                <div className="block">
                  <div className="columns">
                    <div className="column">
                      <h3 className="title is-size-4">Meldefluss</h3>
                      <div className="field is-grouped is-grouped-multiline">
                        {data?.messages_by_pk.journal.incident.divisions.map((d) => {
                          let isPresent = assignments.some((e) => e.name === d.name);
                          let tagsClass = classNames({
                            tag: true,
                            "is-primary": isPresent,
                          });
                          return (
                            <div key={d.name} className="control">
                              <div className="tags has-addons">
                                <a className={tagsClass} onClick={() => setAssignments(union(assignments, [d]))}>
                                  {d.description || d.name}
                                </a>
                                {isPresent ? (
                                  <a
                                    className="tag is-delete"
                                    onClick={() => setAssignments(reject(assignments, (e) => e.id === d.id))}
                                  ></a>
                                ) : (
                                  <></>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="column">
                      <h3 className="title is-size-4">Prorität zuweisen</h3>
                      <div className="select is-rounded is-small">
                        <select
                          defaultValue={message.priority.name}
                          onChange={(e) => {
                            e.preventDefault();
                            let prio = Object.values(PriorityStatus).find((p) => p === e.currentTarget.value);
                            if (prio !== undefined) setPriority(prio);
                          }}
                        >
                          {Object.values(PriorityStatus).map((prio: PriorityStatus) => (
                            <option key={prio}>{prio}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="column">
                      <h3 className="title is-size-4">Pendenz erstellen</h3>
                      <TaskNew />
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
          <footer className="modal-card-foot">
            <div className="buttons are-normal">
              <button
                className="button is-rounded is-primary"
                onClick={() => {
                  if (message !== undefined) handleSave(assignments, message?.id, priority, TriageStatus.Triaged);
                }}
              >
                Triagieren
              </button>
              <button
                className="button is-rounded"
                onClick={() => {
                  if (message !== undefined) handleSave(assignments, message?.id, priority, TriageStatus.MoreInfo);
                }}
              >
                Mehr Informationen benötigt
              </button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}

const SAVE_MESSAGE_TRIAGE = gql`
  mutation SaveMessageTriage(
    $messageId: uuid!
    $priority: priority_status_enum
    $triage: triage_status_enum
    $messageDivisions: [message_division_insert_input!]!
  ) {
    delete_message_division(where: { messageId: { _eq: $messageId } }) {
      affected_rows
    }
    insert_message_division(objects: $messageDivisions) {
      affected_rows
    }
    update_messages_by_pk(pk_columns: { id: $messageId }, _set: { priorityId: $priority, triageId: $triage }) {
      id
      divisions {
        division {
          name
        }
      }
      priority {
        name
      }
      triage {
        name
      }
    }
  }
`;

export default Triage;
