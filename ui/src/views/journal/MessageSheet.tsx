import { faSquare, faSquareCheck } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import dayjs from "dayjs";
import LocalizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { type Division, Medium, type Message, PriorityStatus, TriageStatus } from "types";
import { ReactPreview } from "./Markdown";

dayjs.extend(LocalizedFormat);
dayjs.extend(relativeTime);

const MessageSheet = (
  props: { message: Message | undefined; divisions: Division[] | undefined },
  ref: React.Ref<HTMLDivElement>,
) => {
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
      <h3 className="text-base font-bold capitalize mb-2">{t("messageSheet")}</h3>
      <table className="w-full text-sm border-collapse border border-border [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
        <tbody>
          <tr>
            <th rowSpan={6} className="w-[150px]">
              {t("message.name")}
            </th>
            <th>{t("message.sender")}</th>
            {message.medium === Medium.Radio || !message.senderDetail?.length ? (
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
            {message.medium === Medium.Radio || !message.receiverDetail?.length ? (
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
            <td colSpan={3}>{message.number ?? message.id}</td>
          </tr>
          <tr>
            <th>{t("message.type")}</th>
            {message.medium === Medium.Radio ? (
              <>
                <td>{t([`medium.${message.medium}`, `medium.${Medium.Radio}`])}</td>
                <th>{t("radioChannel")}</th>
                <td>{message.senderDetail}</td>
              </>
            ) : (
              <td colSpan={3}>{t([`medium.${message.medium}`, `medium.${Medium.Radio}`])}</td>
            )}
          </tr>
          <tr>
            <th>{t("message.triage")}</th>
            <td>{t([`triage.${message.triageId}`, `triage.${TriageStatus.Pending}`])}</td>
            <th>{t("message.priority")}</th>
            <td>{t([`priority.${message.priorityId}`, `priority.${PriorityStatus.Normal}`])}</td>
          </tr>
          <tr className="h-[400px]">
            <th>{t("message.content")}</th>
            <td colSpan={4} style={cellStyle}>
              <ReactPreview content={message.content} />
            </td>
          </tr>
          {message.attachments && message.attachments.length > 0 && (
            <tr>
              <th style={{ verticalAlign: "top" }}>{t("message.attachments.title")}</th>
              <td colSpan={4} style={{ ...cellStyle, verticalAlign: "top" }}>
                {message.attachments.map((a, i) => (
                  <span key={a.id} style={{ display: "block" }}>
                    {i + 1}. {a.filename}
                  </span>
                ))}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <table className="w-full table-fixed text-sm border-collapse border border-border mt-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5">
        <tbody>
          <tr>
            <th rowSpan={2} className="w-[150px]">
              {t("messageFlow")}
            </th>
            {divisions?.map((d) => {
              return (
                <td key={message.id + d.id} className="text-center">
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
                <td key={message.id + d.id} className="text-center">
                  {isPresent ? (
                    <FontAwesomeIcon icon={faSquareCheck} />
                  ) : (
                    <FontAwesomeIcon icon={faSquare} />
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default forwardRef(MessageSheet);
