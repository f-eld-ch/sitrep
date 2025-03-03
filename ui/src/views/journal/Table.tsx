import dayjs from "dayjs";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import type { Message } from "types";

const MessageTable = (
  props: {
    messages: undefined | Message[];
    assignmentFilter: string;
    triageFilter: string;
    priorityFilter: string;
  },
  ref: React.Ref<HTMLDivElement>,
) => {
  const { t } = useTranslation();
  const { assignmentFilter, priorityFilter, triageFilter } = props;

  const cellStyle = {
    wordWrap: "break-word" as const,
    wordBreak: "break-all" as const,
    whiteSpace: "normal" as const,
    overflowWrap: "break-word" as const,
  };

  return (
    <div
      ref={ref}
      className="is-clearfix is-block"
      style={{ overflow: "visible" }}
    >
      <h3 className="title is-3">
        {t("journal")}
        {assignmentFilter === "all" &&
        triageFilter === "all" &&
        priorityFilter === "all" ? (
          <></>
        ) : (
          ` (${t("filtered")})`
        )}
      </h3>

      <h5 className="subtitle is-7 mt-4">
        {t("state")}: {dayjs(Date.now()).format("DD.MM.YYYY HH:mm")}
      </h5>
      <FilterState
        assignmentFilter={assignmentFilter}
        priorityFilter={priorityFilter}
        triageFilter={triageFilter}
      />
      <table
        className="table is-fullwidth is-narrow"
        style={{ pageBreakInside: "auto" }}
      >
        <thead>
          <tr>
            <th className="is-capitalized">{t("message.time")}</th>
            <th className="is-capitalized">{t("message.sender")}</th>
            <th className="is-capitalized">{t("message.receiver")}</th>
            <th className="is-capitalized">{t("message.content")}</th>
          </tr>
        </thead>
        <tbody>
          {props.messages?.map((message) => (
            <tr key={message.id}>
              <td>{dayjs(message.time).format("DD.MM.YYYY HH:mm:ss")}</td>
              <td style={cellStyle}>
                {message.senderDetail
                  ? `${message.sender}\n(${message.senderDetail})`
                  : message.sender}
              </td>
              <td style={cellStyle}>
                {message.receiverDetail
                  ? `${message.receiver}\n(${message.receiverDetail})`
                  : message.receiver}
              </td>
              <td style={cellStyle}>
                <div
                  className="content is-normal has-text-left"
                  style={{ pageBreakInside: "avoid" }}
                >
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function FilterState(props: {
  assignmentFilter: string;
  triageFilter: string;
  priorityFilter: string;
}) {
  const { assignmentFilter, priorityFilter, triageFilter } = props;
  const { t } = useTranslation();

  if (
    assignmentFilter === "all" &&
    triageFilter === "all" &&
    priorityFilter === "all"
  ) {
    return null;
  }

  return (
    <h5 className="subtitle is-7">
      <b>{t("filter")}:</b>
      {assignmentFilter !== "all" && (
        <p>
          {t("divisions")}: {assignmentFilter}
        </p>
      )}
      {priorityFilter !== "all" && (
        <p>
          {t("message.priority")}: {t(`priority.${priorityFilter}`)}
        </p>
      )}
      {triageFilter !== "all" && (
        <p>
          {t("message.triage")}: {t(`triage.${triageFilter}`)}
        </p>
      )}
    </h5>
  );
}

export default forwardRef(MessageTable);
