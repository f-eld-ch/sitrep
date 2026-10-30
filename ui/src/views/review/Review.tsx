import dayjs from "dayjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useIncidentReview } from "api";
import { Spinner } from "components";
import { Notification, PageTitle, Tag } from "components/ui";
import { formatDuration } from "utils/duration";
import { DivisionSection, FlowSection, LoadSection, ReworkSection } from "./sections";

/**
 * The review of an incident's messages, for the discussion after the operation. A closed incident
 * always shows the same figures; an open one shows an interim status that refreshes.
 */
export default function Review() {
  const { incidentId } = useParams();
  const { t } = useTranslation();
  const result = useIncidentReview(incidentId);
  // Where an open incident's duration runs to; the figures themselves refresh on their own.
  const [now] = useState(() => new Date());

  if (result.status === "loading") return <Spinner />;

  if (result.status === "error") {
    return (
      <div>
        <Notification variant="danger" light>
          {t(`errors.${result.error.code}`)}
        </Notification>
      </div>
    );
  }

  const { incidentName, review } = result.data;
  const title = `${t("review.title")} · ${incidentName}`;

  if (!review) {
    return (
      <div className="space-y-4">
        <PageTitle>{title}</PageTitle>
        <Notification variant="info" light>
          {t("review.notAvailable")}
        </Notification>
      </div>
    );
  }

  const end = review.closedAt ?? now;
  const seconds = (end.getTime() - review.openedAt.getTime()) / 1000;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageTitle className="mb-0">{title}</PageTitle>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
        <Tag light size="sm" variant={review.closedAt ? "gray" : "warning"}>
          {review.closedAt ? t("review.closed") : t("review.open")}
        </Tag>
        <span>
          {dayjs(review.openedAt).format("LLL")}
          {review.closedAt && ` – ${dayjs(review.closedAt).format("LLL")}`}
        </span>
        <span>
          {t("review.duration")}: <strong className="text-fg">{formatDuration(seconds)}</strong>
        </span>
        <span>
          {t("review.messages")}: <strong className="text-fg">{review.messageCount}</strong>
        </span>
      </div>

      {!review.closedAt && (
        <Notification variant="warning" light>
          {t("review.interim")}
        </Notification>
      )}

      <FlowSection review={review} />
      <DivisionSection review={review} />
      <LoadSection review={review} />
      <ReworkSection review={review} />
    </div>
  );
}
