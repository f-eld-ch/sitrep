/* eslint-disable jsx-a11y/anchor-is-valid */
import classNames from "classnames";
import dayjs from "dayjs";
import de from "dayjs/locale/de";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";

import { faArrowsToEye, faEdit, faPrint, faSquareCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Message as MessageType, PriorityStatus, TriageStatus } from "types";
import remarkable from "utils/remarkable";

export interface MessageProps {
  id: string | undefined;
  sender: string;
  receiver: string;
  timeDate: Date;
  message: string;
  triage: string;
  priority: string;
  assignments?: String[];
  showControls: boolean;
  origMessage: MessageType | undefined;
  setEditorMessage?: (message: MessageType | undefined) => void;
  setTriageMessage?: (message: MessageType | undefined) => void;
}

dayjs.locale(de);
dayjs.extend(LocalizedFormat);
dayjs.extend(relativeTime);

function Message({
  id,
  sender,
  receiver,
  message,
  timeDate,
  triage,
  priority,
  assignments,
  showControls = false,
  setEditorMessage,
  setTriageMessage,
  origMessage,
}: MessageProps) {
  const { t } = useTranslation();
  const { incidentId, journalId } = useParams();

  let colorClassNames = classNames({
    "is-danger":
      !(triage === TriageStatus.Pending || triage === TriageStatus.Reset) && priority === PriorityStatus.High,
    "is-warning": triage === TriageStatus.Pending || triage === TriageStatus.Reset,
    "is-success": triage === TriageStatus.MoreInfo,
    "is-dark": triage === TriageStatus.Triaged,
  });

  let messageClassNames = classNames(colorClassNames, {
    message: true,
    "pb-1": !showControls,
    "mb-2": true,
  });

  let assigmentsClassNames = classNames({
    "column": true,
    "is-2": true,
    "is-align-items-stretch": true,
    "is-justify-content-flex-end": true,
    "is-hidden": !assignments || assignments.length === 0,
  });


  let tabClassNames = classNames(colorClassNames, {
    tabs: true,
    "mb-0": true,
    "is-small": true,
    "is-right": true,
    "is-capitalized": true,
    "is-justify-content-flex-end": true,
  });

  let tagClassNames = classNames(colorClassNames, {
    tag: true,
  });

  return (
    <div className={messageClassNames}>
      <div className="message-body">
        <div className="columns is-multiline is-mobile">
          <div className="column is-full-tablet">
            <nav className="level is-align-items-baseline">
              <div className="level-item has-text-centered is-flex-shrink-1">
                <div className="mb-0">
                  <p className="heading is-size-7">{t('message.sender')}</p>
                  <p className="subtitle is-size-7">{sender}</p>
                </div>
              </div>
              <div className="level-item has-text-centered is-flex-shrink-1">
                <div className="mb-0">
                  <p className="heading is-size-7">{t('message.receiver')}</p>
                  <p className="subtitle is-size-7">{receiver}</p>
                </div>
              </div>
              <div className="level-item has-text-centered is-flex-shrink-1">
                <div className="mb-0">
                  <p className="heading is-size-7">{t('message.time')}</p>
                  <p className="subtitle is-size-7">{dayjs(timeDate).format("LLL")}</p>
                </div>
              </div>
              <div className="level-item has-text-centered is-flex-shrink-1">
                <div className="mb-0">
                  <p className="heading is-size-7">{t('message.priority')}</p>
                  <p className="subtitle is-size-7">{priority}</p>
                </div>
              </div>

              <div className="level-item has-text-centered is-flex-shrink-1">
                <div className="mb-0">
                  <p className="heading is-size-7">{t('message.triage')}</p>
                  <p className="subtitle is-size-7">{t([`triage.${triage}`, 'triage.pending'])}</p>
                </div>
              </div>
            </nav>
          </div>
          <div className="column is-full-touch is-four-fifth-desktop">
            <div
              className="content is-normal has-text-left"
              style={{ whiteSpace: "normal" }}
              dangerouslySetInnerHTML={{ __html: remarkable.render(message) }}
            />
          </div>
          <div className={assigmentsClassNames}>
            <div className="tags is-multiline">
              {assignments &&
                assignments.map((a) => {
                  return (
                    <span key={a.toString()} className={tagClassNames}>
                      {a}
                    </span>
                  );
                })}
            </div>
          </div>

        </div>
        {showControls === true && id !== undefined ? (
          <div className={tabClassNames}>
            <ul>

              {setEditorMessage && triage !== TriageStatus.Triaged ? (
                <li>
                  <a onClick={() => setEditorMessage(origMessage)}>
                    <span className="icon is-small">
                      <FontAwesomeIcon icon={faEdit} />
                    </span>
                    <span>{t('edit')}</span>
                  </a>
                </li>
              ) : (
                <Link to={`/incident/${incidentId}/journal/${journalId}/messages/${id}`} >
                  <span className="icon is-small">
                    <FontAwesomeIcon icon={faPrint} />
                  </span>
                  <span>{t('messageSheet')}</span>
                </Link>)}
              {setTriageMessage && origMessage ? (
                <li>
                  <a onClick={() => setTriageMessage(origMessage)}>
                    <span className="icon is-small">
                      <FontAwesomeIcon icon={faArrowsToEye} />
                    </span>
                    <span>{t('saveTriage')}</span>
                  </a>
                </li>
              ) : (
                <></>
              )}
              <li>
                <a>
                  <span className="icon is-small">
                    <FontAwesomeIcon icon={faSquareCheck} />
                  </span>
                  <span>{t('createNewTask')}</span>
                </a>
              </li>
            </ul>
          </div>
        ) : (
          <></>
        )}
      </div>
    </div >
  );
}

export default memo(Message);
