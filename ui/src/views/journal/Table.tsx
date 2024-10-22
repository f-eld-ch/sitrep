import dayjs from "dayjs";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { Message } from "types";

function MessageTable(props: {
  messages: undefined | Message[];
  assignmentFilter: string;
  triageFilter: string;
  priorityFilter: string;
}) {
  const { t } = useTranslation();
  const { assignmentFilter, priorityFilter, triageFilter } = props;

  return (
    <div className="is-clearfix">
      <h3 className="title is-3">
        {t("journal")}
        {assignmentFilter === "all" && triageFilter === "all" && priorityFilter === "all" ? <></> : " (gefiltert)"}
      </h3>

      <h5 className="subtitle is-7">
        {t("state")}: {dayjs(Date.now()).format("LLL")}
      </h5>
      <FilterState assignmentFilter={assignmentFilter} priorityFilter={priorityFilter} triageFilter={triageFilter} />
      <table className="table is-fullwidth is-narrow">
        <thead>
          <tr>
            <th className="is-capitalized">{t("message.time")}</th>
            <th className="is-capitalized">{t("message.sender")}</th>
            <th className="is-capitalized">{t("message.receiver")}</th>
            <th className="is-capitalized">{t("message.content")}</th>
          </tr>
        </thead>
        <tbody>
          {props.messages &&
            props.messages.map((message) => (
              <tr key={message.id}>
                <td>{dayjs(message.time).format("DD.MM.YYYY HH:mm:ss")}</td>
                <td>{message.sender}</td>
                <td>{message.receiver}</td>
                <td>
                  <div className="content is-normal has-text-left">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterState(props: { assignmentFilter: string; triageFilter: string; priorityFilter: string }) {
  const { assignmentFilter, priorityFilter, triageFilter } = props;
  const { t } = useTranslation();

  if (assignmentFilter === "all" && triageFilter === "all" && priorityFilter === "all") {
    return null;
  }

  return (
    <h5 className="subtitle is-7">
      <b>Filter: </b>
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

export default memo(MessageTable);
