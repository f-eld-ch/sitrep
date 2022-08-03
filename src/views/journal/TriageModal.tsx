/* eslint-disable jsx-a11y/anchor-has-content */
/* eslint-disable jsx-a11y/anchor-is-valid */
import { gql, useMutation, useLazyQuery } from "@apollo/client";
import { faArrowsToEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { JournalMessage, Spinner } from "components";
import { union, without } from "lodash";
import { useState } from "react";
import { Division, PriorityStatus, TriageMessageData, TriageMessageVars, TriageStatus } from "types";
import { New as TaskNew } from "../tasks";

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
            name
            description
          }
        }
      }
    }
  }
`;

function Triage(props: { id: string }) {
  const [loadMessage, { called, loading, error, data }] = useLazyQuery<TriageMessageData, TriageMessageVars>(
    GET_MESSAGE_FOR_TRIAGE,
    {
      variables: { messageId: props.id },
      fetchPolicy: "cache-and-network",
      onCompleted: (data) => {
        setAssignments(data?.messages_by_pk.divisions.map((d) => d.division));
      },
    }
  );

  const [isActive, setIsActive] = useState(false);
  const [priority, setPriority] = useState(`${PriorityStatus.Normal}`);
  const [assignments, setAssignments] = useState<Division[]>([]);

  const modalClassNames = classNames({
    modal: true,
    "is-active": isActive,
    "has-text-black": true,
    "has-text-weight-normal": true,
    "is-size-6": true,
    "is-dark": true,
  });

  if (!called && isActive) {
    loadMessage();
  }

  if (!called || loading) {
    return (
      <a onClick={() => setIsActive(!isActive)}>
        <span className="icon is-small">
          <FontAwesomeIcon icon={faArrowsToEye} />
        </span>
        <span>Triagieren</span>
      </a>
    );
  }

  const message = data?.messages_by_pk;
  return (
    <>
      <a onClick={() => setIsActive(!isActive)}>
        <span className="icon is-small">
          <FontAwesomeIcon icon={faArrowsToEye} />
        </span>
        <span>Triagieren</span>
      </a>
      <div className={modalClassNames}>
        <div className="modal-background"></div>Normal
        <div className="modal-card">
          <header className="modal-card-head">
            <p className="modal-card-title is-size-2">Triage der Nachricht</p>
            <button className="delete" aria-label="close" onClick={() => setIsActive(!isActive)}></button>
          </header>
          <section className="modal-card-body">
            {error ? <div className="notification is-danger">Error: {error.message}</div> : <></>}
            {message === undefined ? (
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
                  />
                </div>
                <div className="block">
                  <div className="columns">
                    <div className="column">
                      <h3 className="title is-size-3">Fachbereiche zuweisen</h3>
                      <div className="field is-grouped is-grouped-multiline">
                        {message.journal.incident.divisions.map((d) => {
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
                                    onClick={() => setAssignments(without(assignments, d))}
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
                      <h3 className="title is-size-3">Prorität zuweisen</h3>
                      <div className="select is-rounded is-small">
                        <select
                          onChange={(e) => {
                            e.preventDefault();
                            setPriority(e.currentTarget.value);
                          }}
                        >
                          {Object.values(PriorityStatus).map((prio: PriorityStatus) => (
                            <option key={prio}>{prio}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="column">
                      <TaskNew />
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
          <footer className="modal-card-foot">
            <div className="buttons are-normal">
              <button className="button is-rounded is-primary">Triagieren</button>
              <button className="button is-rounded">Mehr Informationen benötigt</button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}

export default Triage;