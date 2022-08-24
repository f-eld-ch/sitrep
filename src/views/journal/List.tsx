import { useState } from "react";

import { useQuery } from "@apollo/client";
import { faArrowsToEye, faBell, faUserGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Spinner } from "components";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { Message, MessageListData, MessageListVars, PriorityStatus, TriageStatus } from "types";
import { GetJournalMessages } from "./graphql";
import { default as JournalMessage } from "./Message";
import MessageTable from "./Table";


function List(props: {
  showControls: boolean;
  setEditorMessage?: (message: Message | undefined) => void;
  setTriageMessage?: (message: Message | undefined) => void;
}) {
  const { t } = useTranslation();
  const { journalId } = useParams();
  const [triageFilter, setTriageFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");


  const { loading, error, data } = useQuery<MessageListData, MessageListVars>(GetJournalMessages, {
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
  let divisions = data?.journalsByPk.incident.divisions.flat() || [];

  return (
    <div>
      <h3 className="title is-3 is-capitalized">{t('journal')}</h3>
      <div className="is-print">
        <MessageTable messages={data?.messages} />
      </div>
      <div className="is-hidden-print">
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
                  <option label={t('all')}>all</option>
                  {Object.values(TriageStatus).map((status: TriageStatus) => (
                    <option key={status} label={t([`triage.${status}`, `triage.${TriageStatus.Pending}`])}>{status}</option>
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
                    <option key={prio} label={t([`priority.${prio}`, `priority.${PriorityStatus.Normal}`])}>{prio}</option>
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
      <div className="columns is-multiline is-hidden-print mb-3">
        {data &&
          data.messages
            .filter((message) => triageFilter === "all" || message.triageId === triageFilter)
            .filter((message) => priorityFilter === "all" || message.priorityId === priorityFilter)
            .filter(
              (message) =>
                assignmentFilter === "all" || message.divisions?.find((d) => d.division.name === assignmentFilter)
            )
            .map((message) => {
              return (
                <div key={message.id} className="column is-full is-gapless">
                  <JournalMessage
                    key={message.id}
                    id={message.id}
                    assignments={message.divisions.map((d) => d.division.name)}
                    triage={message.triageId}
                    priority={message.priorityId}
                    sender={message.sender}
                    receiver={message.receiver}
                    message={message.content}
                    timeDate={new Date(message.time)}
                    showControls={props.showControls}
                    origMessage={message}
                    setEditorMessage={props.setEditorMessage}
                    setTriageMessage={props.setTriageMessage}
                  />
                </div>
              );
            })}
      </div>
    </div>
  );
}

export default List;
