import React, { useState } from "react";

import { gql, useQuery } from "@apollo/client";
import { JournalMessage, Spinner } from "components";
import { useParams } from "react-router-dom";

import { faArrowsToEye, faBell, faUserGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import { Message, MessageListData, MessageListVars, PriorityStatus, TriageStatus } from "../../types";
import MessageTable from "./Table";

export const GET_MESSAGES = gql`
  query GetMessages($journalId: uuid!) {
    journals_by_pk(id: $journalId) {
      incident {
        id
        divisions {
          id
          name
          description
        }
      }
    }
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
  setTriageMessage: React.Dispatch<React.SetStateAction<Message | undefined>> | undefined;
}) {
  const { t } = useTranslation();
  const { journalId } = useParams();
  const [triageFilter, setTriageFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");


  const { loading, error, data } = useQuery<MessageListData, MessageListVars>(GET_MESSAGES, {
    variables: { journalId: journalId || "" },
    pollInterval: 10000,
  });

  if (error)
    return (
      <div className="notification is-danger is-light">
        <div className="block has-text-weight-semibold">Ups, da ging was schief:</div>
        <div className="block">{error.message}</div>
      </div>
    );

  if (loading) return <Spinner />;
  let divisions = data?.journals_by_pk.incident.divisions.flat() || [];

  return (
    <div>
      <h3 className="title is-3 is-capitalized">{t('journal')}</h3>
      <div className="block is-print">
        <MessageTable messages={data?.messages} />
      </div>
      <div className="block is-hidden-print">
        <div className="columns is-mobile">
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
                  <option label={t('all')}>all</option>
                  {Object.values(TriageStatus).map((status: TriageStatus) => (
                    <option key={status} label={t([`triage.${status}`, 'triage.pending'])}>{status}</option>
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
                  <option label={t('all')}>all</option>
                  {Object.values(PriorityStatus).map((prio: PriorityStatus) => (
                    <option key={prio} label={t([`priority.${prio}`, 'priority.normal'])}>{prio}</option>
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
                  <option label={t('all')}>all</option>
                  {divisions.map((element) => (
                    <option key={element.id} value={element.name}>
                      {element.description}
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
            .filter((message) => triageFilter === "all" || message.triage?.name === triageFilter)
            .filter((message) => priorityFilter === "all" || message.priority?.name === priorityFilter)
            .filter(
              (message) =>
                assignmentFilter === "all" || message.divisions?.find((d) => d.division.name === assignmentFilter)
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
                  setTriageMessage={props.setTriageMessage}
                />
              );
            })}
      </div>
    </div>
  );
}

export default List;
