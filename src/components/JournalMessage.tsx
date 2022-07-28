import React from "react";
import dayjs from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import de from "dayjs/locale/de";
import relativeTime from "dayjs/plugin/relativeTime";
import classNames from "classnames";

import { TriageStatus, PriorityStatus } from "types";
import remarkable from "../utils/remarkable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faSquareCheck } from "@fortawesome/free-solid-svg-icons";
import TriageModal from "../views/journal/TriageModal";

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
}: MessageProps) {
  let messageClassNames = classNames({
    message: true,
    "mb-2": true,
    "is-danger":
      !(triage === TriageStatus.Pending || triage === TriageStatus.Reset) && priority === PriorityStatus.High,
    "is-warning": triage === TriageStatus.Pending || triage === TriageStatus.Reset,
    "is-success": triage === TriageStatus.MoreInfo,
    "is-dark": triage === TriageStatus.Triaged,
  });

  let assigmentsClassNames = classNames({
    column: true,
    "is-1": true,
    "is-hidden": !assignments || assignments.length === 0,
  });

  return (
    <div className={messageClassNames}>
      <div className="message-body">
        <div className="columns">
          <div className="column is-2">
            <nav className="level is-block">
              <div className="level-item has-text-centered">
                <div className="mb-2">
                  <p className="heading is-size-7">Sender</p>
                  <p className="subtitle is-size-7">{sender}</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div className="mb-2">
                  <p className="heading is-size-7">Emfänger</p>
                  <p className="subtitle is-size-7">{receiver}</p>
                </div>
              </div>
              <div className="level-item has-text-centered">
                <div className="mb-2">
                  <p className="heading is-size-7">Zeit</p>
                  <p className="subtitle is-size-7">{dayjs(timeDate).format("LLL")}</p>
                </div>
              </div>
              {triage !== TriageStatus.Pending && triage !== TriageStatus.Reset ? (
                <div className="level-item has-text-centered">
                  <div className="">
                    <p className="heading is-size-7">Prio</p>
                    <p className="subtitle is-size-7">{priority}</p>
                  </div>
                </div>
              ) : (
                <div className="level-item has-text-centered">
                  <div className="">
                    <p className="heading is-size-7">Triage</p>
                    <p className="subtitle is-size-7">notwendig</p>
                  </div>
                </div>
              )}
            </nav>
          </div>
          <div className="column">
            <div
              className="content is-normal has-text-left"
              style={{ whiteSpace: "pre-wrap" }}
              dangerouslySetInnerHTML={{ __html: remarkable.render(message) }}
            />
          </div>
          <div className={assigmentsClassNames}>
            <div className="field is-grouped is-grouped-multiline">
              <div className="tags">
                {assignments &&
                  assignments.map((a) => {
                    return (
                      <span key={a.toString()} className="tag is-grey is-light is-small">
                        {a}
                      </span>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
        {showControls === true && id !== undefined ? (
          <div className="tabs is-small is-right">
            <ul>
              <li>
                <TriageModal key={id} id={id} />
              </li>
              <li>
                <a>
                  <span className="icon is-small">
                    <FontAwesomeIcon icon={faSquareCheck} />
                  </span>
                  <span>Pendenz erfassen</span>
                </a>
              </li>
              <li>
                <a>
                  <span className="icon is-small">
                    <FontAwesomeIcon icon={faEdit} />
                  </span>
                  <span>Bearbeiten</span>
                </a>
              </li>
            </ul>
          </div>
        ) : (
          <></>
        )}
      </div>
    </div>
  );
}

export default Message;
