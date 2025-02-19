import { faSquare, faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import dayjs from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import { forwardRef } from "react";

import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { Division, Medium, Message, PriorityStatus, TriageStatus } from "types";

dayjs.extend(LocalizedFormat);
dayjs.extend(relativeTime);

function MessageSheet(
  props: { message: Message | undefined; divisions: Division[] | undefined },
  ref: React.Ref<HTMLDivElement>,
) {
  const { t, i18n } = useTranslation();
  const { message, divisions } = props;

  if (!message) {
    return;
  }

  const cellStyle = {
    wordWrap: "break-word" as const,
    wordBreak: "break-all" as const,
    whiteSpace: "normal" as const,
    overflowWrap: "break-word" as const,
  };

  return (
    <div ref={ref}>
      <h3 className="title is-size-6 is-capitalized">{t("messageSheet")}</h3>
      <table className="table is-bordered is-fullwidth message-sheet">
        <tbody>
          <tr>
            <th rowSpan={6} className="firstRow">
              {t("message.name")}
            </th>
            <th>{t("message.sender")}</th>
            {message.mediumId === Medium.Radio || !message.senderDetail?.length ? (
              <td colSpan={3} style={cellStyle}>
                {message.sender}
              </td>
            ) : (
              <td colSpan={3} style={cellStyle}>
                {message.sender} ({message.senderDetail})
              </td>
            )}
          </tr>
          <tr>
            <th>{t("message.receiver")}</th>
            {message.mediumId === Medium.Radio || !message.receiverDetail?.length ? (
              <td colSpan={3} style={cellStyle}>
                {message.receiver}
              </td>
            ) : (
              <td colSpan={3} style={cellStyle}>
                {message.receiver} ({message.receiverDetail})
              </td>
            )}
          </tr>
          <tr>
            <th>{t("message.time")}</th>
            <td>{dayjs(message.createdAt).locale(i18n.language).format("LLL")}</td>
            <th>{t("message.createdAt")}</th>
            <td>{dayjs(message.createdAt).locale(i18n.language).format("LLL")}</td>
          </tr>
          <tr>
            <th>{t("message.id")}</th>
            <td colSpan={3}>{message.id}</td>
          </tr>
          <tr>
            <th>{t("message.type")}</th>
            {message.mediumId === Medium.Radio ? (
              <>
                <td>{t([`medium.${message.mediumId}`, `medium.${Medium.Radio}`])}</td>
                <th>{t("radioChannel")}</th>
                <td>{message.senderDetail}</td>
              </>
            ) : (
              <td colSpan={3}>{t([`medium.${message.mediumId}`, `medium.${Medium.Radio}`])}</td>
            )}
          </tr>
          <tr>
            <th>{t("message.triage")}</th>
            <td>{t([`triage.${message.triageId}`, `triage.${TriageStatus.Pending}`])}</td>
            <th>{t("message.priority")}</th>
            <td>{t([`priority.${message.priorityId}`, `priority.${PriorityStatus.Normal}`])}</td>
          </tr>
          <tr className="contentBox">
            <th>{t("message.content")}</th>
            <td colSpan={4} style={cellStyle}>
              <div className="content">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <table className="table is-bordered is-fullwidth mt-2 is-fixed message-sheet">
        <tbody>
          <tr>
            <th rowSpan={2} className="firstRow">
              {t("messageFlow")}
            </th>
            {divisions?.map((d) => {
              return (
                <td key={message.id + d.id} className="has-text-centered">
                  {d.name && d.name.trim() !== "" ? d.name : d.description}
                </td>
              );
            })}
          </tr>
          <tr>
            {divisions?.map((d) => {
              const assignments = message.divisions.map((e) => e.division.id);
              const isPresent = assignments.some((e) => e === d.id);
              return (
                <td key={message.id + d.id} className="has-text-centered">
                  {isPresent ? <FontAwesomeIcon icon={faSquareCheck} /> : <FontAwesomeIcon icon={faSquare} />}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default forwardRef(MessageSheet);
