import {
  faArrowsToEye,
  faEdit,
  faPrint,
  faSquareCheck,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import classNames from "classnames";
import dayjs from "dayjs";
import { memo, useRef } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { useReactToPrint } from "react-to-print";
import {
  type Division,
  type Message,
  PriorityStatus,
  TriageStatus,
} from "types";
import MessageSheet from "./MessageSheet";

export interface MessageProps {
  id: string | undefined;
  message: Message;
  divisions: Division[];
  showControls: boolean;
  setEditorMessage?: (message: Message | undefined) => void;
  setTriageMessage?: (message: Message | undefined) => void;
}

const MessageContainer = ({
  id,
  message,
  showControls = false,
  setEditorMessage,
  setTriageMessage,
  divisions,
}: MessageProps) => {
  const { t, i18n } = useTranslation();
  const showTasks = useBooleanFlagValue("show-tasks", false);
  const messageSheetRef = useRef(null);
  const handlePrint = useReactToPrint({
    contentRef: messageSheetRef,
    pageStyle: "@page { size: A4 portrait; margin: 1cm; }",
  });

  const colorClassNames = classNames({
    "is-danger":
      !(
        message.triageId === TriageStatus.Pending ||
        message.triageId === TriageStatus.Reset
      ) && message.priorityId === PriorityStatus.High,
    "is-warning":
      message.triageId === TriageStatus.Pending ||
      message.triageId === TriageStatus.Reset,
    "is-success": message.triageId === TriageStatus.MoreInfo,
    "is-dark": message.triageId === TriageStatus.Triaged,
  });

  const messageClassNames = classNames(colorClassNames, {
    message: true,
    "mb-3": !showControls,
  });

  const assigmentsClassNames = classNames({
    column: true,
    "is-full": true,
    "is-flex-shrink-0": true,
    "is-flex-grow-0": true,
    "is-justify-content-flex-start": true,
    "is-hidden": !message.divisions || message.divisions.length === 0,
  });

  const tabClassNames = classNames(colorClassNames, {
    tabs: true,
    "mb-0": true,
    "is-small": true,
    "is-right": true,
    "is-justify-content-flex-end": true,
  });

  const tagClassNames = classNames(colorClassNames, {
    tag: true,
  });

  return (
    <div className={messageClassNames}>
      <div className="message-body px-0">
        <div className="columns px-3 is-multiline is-mobile">
          <div className="column is-full">
            <nav className="level is-align-items-baseline">
              <div className="level-item has-text-centered is-flex-shrink-2">
                <div className="mb-0">
                  <div className="heading is-size-7 has-text-weight-bold">
                    {t("message.sender")}
                  </div>
                  <div className="subtitle is-size-7">
                    <div className="columns is-gapless is-multiline">
                      <div className="column is-full" data-testid={`sender-${message.id}`}>{message.sender}</div>
                      <div className="column is-full is-italic" data-testid={`sender-detail-${message.id}`}>
                        {message.senderDetail
                          ? `(${message.senderDetail})`
                          : ""}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="level-item has-text-centered is-flex-shrink-2">
                <div className="mb-0">
                  <div className="heading is-size-7 has-text-weight-bold" >
                    {t("message.receiver")}
                  </div>
                  <div className="subtitle is-size-7">
                    <div className="columns is-gapless is-multiline">
                      <div className="column is-full" data-testid={`receiver-${message.id}`}>{message.receiver}</div>
                      <div className="column is-full is-italic" data-testid={`receiver-detail-${message.id}`}>
                        {message.receiverDetail
                          ? `(${message.receiverDetail})`
                          : ""}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="level-item has-text-centered is-flex-shrink-1">
                <div className="mb-0">
                  <div className="heading is-size-7 has-text-weight-bold">
                    {t("message.time")}
                  </div>
                  <div className="subtitle is-size-7">
                    {dayjs(message.time).locale(i18n.language).format("LLL")}
                  </div>
                </div>
              </div>
              <div className="level-item has-text-centered is-flex-shrink-0">
                <div className="mb-0">
                  <p className="heading is-size-7 has-text-weight-bold">
                    {t("message.priority")}
                  </p>
                  <p className="subtitle is-size-7">
                    {t([
                      `priority.${message.priorityId}`,
                      `priority.${PriorityStatus.Normal}`,
                    ])}
                  </p>
                </div>
              </div>

              <div className="level-item has-text-centered is-flex-shrink-0">
                <div className="mb-0">
                  <p className="heading is-size-7 has-text-weight-bold">
                    {t("message.triage")}
                  </p>
                  <p className="subtitle is-size-7">
                    {t([
                      `triage.${message.triageId}`,
                      `triage.${TriageStatus.Pending}`,
                    ])}
                  </p>
                </div>
              </div>
            </nav>
          </div>
          <div className="column is-full" style={{ wordBreak: "break-word" }}>
            <div className="content is-normal has-text-left" data-testid={`content-${message.id}`}>
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
          <div className={assigmentsClassNames}>
            <div className="tags is-multiline">
              {message.divisions?.map((d) => (
                <span key={d.division.id} className={tagClassNames}>
                  {d.division.name && d.division.name.trim() !== ""
                    ? d.division.name
                    : d.division.description}
                </span>
              ))}
            </div>
          </div>
        </div>
        {showControls === true && id !== undefined && (
          <div
            className={tabClassNames}
            style={{ borderBottomRightRadius: "4px" }}
          >
            <ul>
              {setEditorMessage && message.triageId !== TriageStatus.Triaged ? (
                <li>
                  <a
                    className="has-text-weight-bold"
                    data-testid="edit-button"
                    onClick={() => setEditorMessage(message)}
                  >
                    <span className="icon is-small">
                      <FontAwesomeIcon icon={faEdit} />
                    </span>
                    <span>{t("edit")}</span>
                  </a>
                </li>
              ) : (
                <a
                  className="has-text-weight-bold"
                  data-testid="print-button"
                  onClick={() => handlePrint()}
                >
                  <span className="icon is-small">
                    <FontAwesomeIcon icon={faPrint} />
                  </span>
                  <span>{t("messageSheet")}</span>
                </a>
              )}
              {setTriageMessage && message && (
                <li>
                  <a
                    className="has-text-weight-bold"
                    data-testid="save-triage-button"
                    onClick={() => setTriageMessage(message)}
                  >
                    <span className="icon is-small">
                      <FontAwesomeIcon icon={faArrowsToEye} />
                    </span>
                    <span>{t("saveTriage")}</span>
                  </a>
                </li>
              )}
              {showTasks && (
                <li>
                  <a
                    className="has-text-weight-bold"
                    data-testid="create-task-button"
                  >
                    <span className="icon is-small">
                      <FontAwesomeIcon icon={faSquareCheck} />
                    </span>
                    <span>{t("createNewTask")}</span>
                  </a>
                </li>
              )}
            </ul>
            <div style={{ display: "none" }}>
              <MessageSheet
                ref={messageSheetRef}
                message={message}
                divisions={divisions}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(MessageContainer);
