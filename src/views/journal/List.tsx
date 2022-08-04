import React, { useState } from "react";

import { JournalMessage, Spinner } from "components";
import { useParams } from "react-router-dom";
import { gql, useSubscription } from "@apollo/client";

import { Message, MessageListData, MessageListVars, PriorityStatus, TriageStatus } from "../../types";
import MessageTable from "./Table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsToEye, faBell, faUserGroup } from "@fortawesome/free-solid-svg-icons";

export const SUBSCRIBE_MESSAGES = gql`
  subscription SubscribeMessages($journalId: uuid) {
    messages(where: { journal: { id: { _eq: $journalId } }, deletedAt: { _is_null: true } }, order_by: { time: desc }) {
      id
      content
      sender
      receiver
      time
      createdAt
      updatedAt
      deletedAt
      divisions {
        division {
          id
          name
          description
        }
      }
      triage {
        name
        name
      }
      priority {
        name
      }
    }
  }
`;

function List(props: {
  showControls: boolean;
  setEditorMessage: React.Dispatch<React.SetStateAction<Message | undefined>> | undefined;
}) {
  const { journalId } = useParams();
  const [triageFilter, setTriageFilter] = useState("Alle");
  const [priorityFilter, setPriorityFilter] = useState("Alle");
  const [assignmentFilter, setAssignmentFilter] = useState("Alle");

  const { loading, error, data } = useSubscription<MessageListData, MessageListVars>(SUBSCRIBE_MESSAGES, {
    variables: { journalId: journalId || "" },
  });

  if (error)
    return (
      <div className="notification is-danger is-light">
        <div className="block has-text-weight-semibold">Ups, da ging was schief:</div>
        <div className="block">{error.message}</div>
      </div>
    );

  if (loading) return <Spinner />;
  let divisions = new Set(data?.messages.map((m) => m.divisions.map((l) => l.division.name).flat()).flat());

  return (
    <div>
      <h3 className="title is-3">Journal</h3>
      <div className="block is-print">
        <MessageTable messages={data?.messages} />
      </div>
      <div className="block is-hidden-print">
        <div className="columns">
          <div className="column is-narrow">
            <div className="control has-icons-left">
              <div className="select is-small is-rounded">
                <select
                  value={triageFilter}
                  onChange={(e) => {
                    e.preventDefault();
                    setTriageFilter(e.currentTarget.value);
                  }}
                >
                  <option>Alle</option>
                  {Object.values(TriageStatus).map((status: TriageStatus) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="icon is-small is-left">
                <FontAwesomeIcon icon={faArrowsToEye} />
              </div>
            </div>
          </div>
          <div className="column is-narrow">
            <div className="control has-icons-left">
              <div className="select is-small is-rounded">
                <select
                  value={priorityFilter}
                  onChange={(e) => {
                    e.preventDefault();
                    setPriorityFilter(e.currentTarget.value);
                  }}
                >
                  <option>Alle</option>
                  {Object.values(PriorityStatus).map((prio: PriorityStatus) => (
                    <option key={prio}>{prio}</option>
                  ))}
                </select>
              </div>
              <div className="icon is-small is-left">
                <FontAwesomeIcon icon={faBell} />
              </div>
            </div>
          </div>
          <div className="column is-narrow">
            <div className="control has-icons-left">
              <div className="select is-small is-rounded">
                <select
                  value={assignmentFilter}
                  onChange={(e) => {
                    e.preventDefault();
                    setAssignmentFilter(e.currentTarget.value);
                  }}
                >
                  <option>Alle</option>
                  {Array.from(divisions).map((element) => (
                    <option key={element.toString()} value={element}>
                      {element}
                    </option>
                  ))}
                </select>
              </div>
              <div className="icon is-small is-left">
                <FontAwesomeIcon icon={faUserGroup} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="block is-hidden-print">
        {data &&
          data.messages
            .filter((message) => triageFilter === "Alle" || message.triage?.name === triageFilter)
            .filter((message) => priorityFilter === "Alle" || message.priority?.name === priorityFilter)
            .filter(
              (message) =>
                assignmentFilter === "Alle" || message.divisions?.find((d) => d.division.name === assignmentFilter)
            )
            .map((message) => {
              return (
                <JournalMessage
                  key={message.id}
                  id={message.id}
                  assignments={message.divisions.map((d) => d.division.name)}
                  triage={message.triage.name}
                  priority={message.priority.name}
                  sender={message.sender}
                  receiver={message.receiver}
                  message={message.content}
                  timeDate={new Date(message.time)}
                  showControls={props.showControls}
                  origMessage={message}
                  setEditorMessage={props.setEditorMessage}
                />
              );
            })}
      </div>
    </div>
  );
}

export default List;
