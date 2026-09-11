import dayjs from "dayjs";
import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import type { Message } from "types";
import { useDate } from "utils/useDate";
import { PageTitle } from "components/ui";
import { ReactPreview } from "./Markdown";

const MessageTable = (
  props: {
    messages: undefined | Message[];
    assignmentFilter: string;
    triageFilter: string;
    priorityFilter: string;
    incidentName?: string;
  },
  ref: React.Ref<HTMLDivElement>,
) => {
  const { t } = useTranslation();
  const { assignmentFilter, priorityFilter, triageFilter } = props;
  const { now } = useDate();

  const isFiltered =
    assignmentFilter !== "all" || triageFilter !== "all" || priorityFilter !== "all";

  return (
    <div ref={ref} className="overflow-visible">
      <PageTitle className="print:mb-2 print:text-base">
        {t("journal")}
        {props.incidentName && ` — ${props.incidentName}`}
        {isFiltered && ` (${t("filtered")})`}
      </PageTitle>

      <p className="mt-4 text-xs text-fg-muted print:mt-1">
        {t("state")}: {dayjs(now).format("DD.MM.YYYY HH:mm")}
      </p>
      <FilterState
        assignmentFilter={assignmentFilter}
        priorityFilter={priorityFilter}
        triageFilter={triageFilter}
      />
      <table className="w-full border-collapse break-inside-auto text-sm print:text-xs [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
        <thead>
          <tr>
            <th className="capitalize">{t("message.time")}</th>
            <th className="capitalize">{t("message.sender")}</th>
            <th className="capitalize">{t("message.receiver")}</th>
            <th className="capitalize">{t("message.content")}</th>
          </tr>
        </thead>
        <tbody>
          {props.messages?.map((message) => (
            <tr key={message.id}>
              <td className="text-nowrap print:text-[10px]">
                {dayjs(message.time).format("DD.MM.YYYY HH:mm:ss")}
              </td>
              <td className="wrap-break-word break-all whitespace-normal print:text-[10px]">
                {message.senderDetail ? (
                  <>
                    {message.sender}
                    <br />({message.senderDetail})
                  </>
                ) : (
                  message.sender
                )}
              </td>
              <td className="wrap-break-word break-all whitespace-normal print:text-[10px]">
                {message.receiverDetail ? (
                  <>
                    {message.receiver}
                    <br />({message.receiverDetail})
                  </>
                ) : (
                  message.receiver
                )}
              </td>
              <td className="wrap-break-word break-all whitespace-normal print:text-[10px]">
                <div className="break-inside-avoid text-left">
                  <ReactPreview content={message.content} />
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

  if (assignmentFilter === "all" && triageFilter === "all" && priorityFilter === "all") {
    return null;
  }

  return (
    <p className="text-xs text-fg-muted">
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
    </p>
  );
}

export default forwardRef(MessageTable);
