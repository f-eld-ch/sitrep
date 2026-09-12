import {
  faArrowsToEye,
  faEdit,
  faPaperclip,
  faPrint,
  faSquareCheck,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { clsx } from "clsx";
import dayjs from "dayjs";
import { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReactToPrint } from "react-to-print";
import { type Attachment, type Division, type Message, PriorityStatus, TriageStatus } from "types";
import { Tag } from "components/ui";
import type { TagVariant } from "components/ui";
import { ReactPreview } from "./Markdown";
import MessageSheet from "./MessageSheet";

export interface MessageProps {
  id: string | undefined;
  incidentId: string;
  message: Message;
  divisions: Division[];
  showControls: boolean;
  accentSide?: "left" | "right";
  setEditorMessage?: (message: Message | undefined) => void;
  setTriageMessage?: (message: Message | undefined) => void;
}

const MAX_IMG_RETRIES = 3;
const IMG_RETRY_DELAYS = [300, 800, 2000];

/** Derive the accent key from message state — used to pick border, bg, tag and action bar colors. */
function accentKey(message: Message): "warning" | "success" | "dark" | "danger" | "none" {
  if (message.triageId === TriageStatus.Pending || message.triageId === TriageStatus.Reset)
    return "warning";
  if (message.priorityId === PriorityStatus.High) return "danger";
  if (message.triageId === TriageStatus.MoreInfo) return "success";
  if (message.triageId === TriageStatus.Triaged) return "dark";
  return "none";
}

const borderL: Record<string, string> = {
  warning: "border-l-warning",
  success: "border-l-success",
  dark: "border-l-fg",
  danger: "border-l-danger",
  none: "border-l-border",
};

const borderR: Record<string, string> = {
  warning: "border-r-warning",
  success: "border-r-success",
  dark: "border-r-fg",
  danger: "border-r-danger",
  none: "border-r-border",
};

const accentTextColor: Record<string, string> = {
  warning: "!text-warning",
  success: "!text-success",
  dark: "!text-fg",
  danger: "!text-danger",
  none: "!text-fg",
};

const accentHoverBg: Record<string, string> = {
  warning: "hover:bg-warning/15",
  success: "hover:bg-success/15",
  dark: "hover:bg-fg/10",
  danger: "hover:bg-danger/15",
  none: "hover:bg-bg-subtle",
};

const bgTint: Record<string, string> = {
  warning: "bg-[var(--color-msg-warning-bg)]",
  success: "bg-[var(--color-msg-success-bg)]",
  dark: "bg-[var(--color-msg-dark-bg)]",
  danger: "bg-[var(--color-msg-danger-bg)]",
  none: "",
};

const tagVariantMap: Record<string, TagVariant> = {
  warning: "warning",
  success: "success",
  dark: "gray",
  danger: "danger",
  none: "light",
};

const AttachmentChip = ({ attachment }: { attachment: Attachment }) => {
  const isImage = attachment.contentType.startsWith("image/");
  const [imgFailed, setImgFailed] = useState(false);
  const retryCount = useRef(0);

  const handleImgError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (retryCount.current >= MAX_IMG_RETRIES) {
        setImgFailed(true);
        return;
      }
      const delay = IMG_RETRY_DELAYS[retryCount.current] ?? 2000;
      retryCount.current += 1;
      const img = e.currentTarget;
      setTimeout(() => {
        img.src = `${attachment.url}?r=${retryCount.current}`;
      }, delay);
    },
    [attachment.url],
  );

  if (isImage && !imgFailed) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        title={attachment.filename}
        className="inline-block leading-none"
      >
        <img
          src={attachment.url}
          alt={attachment.filename}
          onError={handleImgError}
          className="h-16 w-16 rounded border border-border object-cover"
        />
      </a>
    );
  }

  const isPdf = attachment.contentType === "application/pdf";

  return (
    <Tag
      as="a"
      href={attachment.url}
      size="sm"
      light
      {...(isPdf
        ? { target: "_blank", rel: "noopener noreferrer" }
        : { download: attachment.filename })}
    >
      <FontAwesomeIcon icon={faPaperclip} className="mr-1" />
      {attachment.filename}
    </Tag>
  );
};

/** One label+value cell in the message header level bar. */
const LevelItem = ({
  label,
  children,
  shrink = 0,
  "data-testid": testId,
}: {
  label: string;
  children: React.ReactNode;
  shrink?: 0 | 1 | 2;
  "data-testid"?: string;
}) => (
  <div
    className={clsx(
      "flex min-w-0 flex-col items-center text-center",
      shrink === 0 && "shrink-0",
      shrink === 1 && "shrink",
      shrink === 2 && "shrink-2",
    )}
  >
    <div className="mb-0.5 text-[11px] leading-tight font-bold tracking-wider uppercase">
      {label}
    </div>
    <div className="w-full text-xs wrap-anywhere" data-testid={testId}>
      {children}
    </div>
  </div>
);

const MessageContainer = ({
  id,
  message,
  showControls = false,
  accentSide = "left",
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

  const accent = accentKey(message);
  const hasDivisions = message.divisions && message.divisions.length > 0;
  const tagVariant = tagVariantMap[accent];
  const actionLinkClass = clsx(
    "flex cursor-pointer items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors select-none",
    accentTextColor[accent],
    accentHoverBg[accent],
  );

  return (
    <div
      className={clsx(
        "rounded border-0 border-solid shadow-xl",
        accentSide === "right" ? "border-r-4" : "border-l-4",
        accentSide === "right" ? borderR[accent] : borderL[accent],
        bgTint[accent],
        !showControls && "mb-3",
      )}
    >
      {/* Message body */}
      <div className="px-3 pt-3 pb-2">
        {/* Level bar — sender / receiver / time / number / priority / triage
            Mobile: 2-col grid (3 rows). Desktop sm+: single flex row. */}
        <nav className="mb-3 grid grid-cols-1 justify-items-center gap-y-3 px-0 sm:grid-cols-2 sm:gap-x-4 md:flex md:flex-wrap md:items-baseline md:justify-between md:gap-x-4 md:gap-y-2">
          <LevelItem label={t("message.sender")} shrink={2}>
            <div className="flex flex-col items-center gap-0">
              <span data-testid={`sender-${message.id}`}>{message.sender}</span>
              <span className="italic" data-testid={`sender-detail-${message.id}`}>
                {message.senderDetail ? `(${message.senderDetail})` : ""}
              </span>
            </div>
          </LevelItem>

          <LevelItem label={t("message.receiver")} shrink={2}>
            <div className="flex flex-col items-center gap-0">
              <span data-testid={`receiver-${message.id}`}>{message.receiver}</span>
              <span className="italic" data-testid={`receiver-detail-${message.id}`}>
                {message.receiverDetail ? `(${message.receiverDetail})` : ""}
              </span>
            </div>
          </LevelItem>

          <LevelItem label={t("message.time")} shrink={1}>
            {dayjs(message.time).locale(i18n.language).format("LLL")}
          </LevelItem>

          {message.number > 0 ? (
            <LevelItem label={t("message.id")}>
              <span data-testid={`number-${message.id}`}># {message.number}</span>
            </LevelItem>
          ) : (
            <div className="sm:hidden" />
          )}

          <LevelItem label={t("message.priority")}>
            {t([`priority.${message.priorityId}`, `priority.${PriorityStatus.Normal}`])}
          </LevelItem>

          <LevelItem label={t("message.triage")}>
            {t([`triage.${message.triageId}`, `triage.${TriageStatus.Pending}`])}
          </LevelItem>
        </nav>

        {/* Content */}
        <div
          className="mt-6 text-left text-sm wrap-break-word"
          data-testid={`content-${message.id}`}
        >
          <ReactPreview content={message.content} />
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 pt-2">
            <p className="mb-2 text-[11px] font-bold tracking-wider text-fg-muted uppercase">
              {t("message.attachments.title")}
            </p>
            {message.attachments.some((a) => a.contentType.startsWith("image/")) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {message.attachments
                  .filter((a) => a.contentType.startsWith("image/"))
                  .map((a) => (
                    <AttachmentChip key={a.id} attachment={a} />
                  ))}
              </div>
            )}
            {message.attachments.some((a) => !a.contentType.startsWith("image/")) && (
              <div className="mb-0 flex flex-wrap gap-1">
                {message.attachments
                  .filter((a) => !a.contentType.startsWith("image/"))
                  .map((a) => (
                    <AttachmentChip key={a.id} attachment={a} />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar — division tags left, edit/triage buttons right */}
      {(hasDivisions || (showControls === true && id !== undefined)) && (
        <div className="flex flex-wrap items-end gap-x-2 gap-y-1 rounded-b pt-1.5">
          {/* Left — division tags (full-width on mobile so buttons wrap below) */}
          <div className="flex w-full flex-wrap gap-1.5 px-2 py-4 sm:w-auto sm:flex-1">
            {message.divisions?.map((d) => (
              <Tag key={d.division.id} size="sm" className="px-2" variant={tagVariant}>
                {d.division.name && d.division.name.trim() !== ""
                  ? d.division.name
                  : d.division.description}
              </Tag>
            ))}
          </div>

          {/* Right — action buttons */}
          {showControls === true && id !== undefined && (
            <div className="flex w-full flex-col sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
              {setEditorMessage && message.triageId !== TriageStatus.Triaged ? (
                <button
                  type="button"
                  className={actionLinkClass}
                  data-testid="edit-button"
                  onClick={() => setEditorMessage(message)}
                >
                  <FontAwesomeIcon icon={faEdit} />
                  <span>{t("edit")}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className={actionLinkClass}
                  data-testid="print-button"
                  onClick={() => handlePrint()}
                >
                  <FontAwesomeIcon icon={faPrint} />
                  <span>{t("messageSheet")}</span>
                </button>
              )}
              {setTriageMessage && message && (
                <button
                  type="button"
                  className={actionLinkClass}
                  data-testid="save-triage-button"
                  onClick={() => setTriageMessage(message)}
                >
                  <FontAwesomeIcon icon={faArrowsToEye} />
                  <span>{t("saveTriage")}</span>
                </button>
              )}
              {showTasks && (
                <button type="button" className={actionLinkClass} data-testid="create-task-button">
                  <FontAwesomeIcon icon={faSquareCheck} />
                  <span>{t("createNewTask")}</span>
                </button>
              )}
            </div>
          )}

          <div className="hidden">
            <MessageSheet ref={messageSheetRef} message={message} divisions={divisions} />
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(MessageContainer);
