import { faChevronDown, faChevronUp, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import dayjs from "dayjs";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PriorityStatus, TriageStatus } from "types";
import type { Message } from "types/journal";
import { ReactPreview } from "./Markdown";

type AccentKey = "warning" | "success" | "dark" | "danger" | "none";

function accentKeyForMessage(message: Message): AccentKey {
  if (message.triageId === TriageStatus.Pending || message.triageId === TriageStatus.Reset)
    return "warning";
  if (message.priorityId === PriorityStatus.High) return "danger";
  if (message.triageId === TriageStatus.MoreInfo) return "success";
  if (message.triageId === TriageStatus.Triaged) return "dark";
  return "none";
}

const rowBorderR: Record<AccentKey, string> = {
  warning: "border-r-warning",
  success: "border-r-success",
  dark: "border-r-fg",
  danger: "border-r-danger",
  none: "border-r-border",
};

const rowHoverShadow: Record<AccentKey, string> = {
  warning: "hover:shadow-[inset_0_1px_0_var(--color-warning),inset_0_-1px_0_var(--color-warning)]",
  success: "hover:shadow-[inset_0_1px_0_var(--color-success),inset_0_-1px_0_var(--color-success)]",
  dark: "hover:shadow-[inset_0_1px_0_var(--color-fg),inset_0_-1px_0_var(--color-fg)]",
  danger: "hover:shadow-[inset_0_1px_0_var(--color-danger),inset_0_-1px_0_var(--color-danger)]",
  none: "hover:shadow-[inset_0_1px_0_var(--color-border),inset_0_-1px_0_var(--color-border)]",
};

const rowBgTint: Record<AccentKey, string> = {
  warning: "bg-[var(--color-msg-warning-bg)]",
  success: "bg-[var(--color-msg-success-bg)]",
  dark: "bg-[var(--color-msg-dark-bg)]",
  danger: "bg-[var(--color-msg-danger-bg)]",
  none: "",
};

function MessageRow(props: {
  message: Message;
  selected: boolean;
  onClick: () => void;
  setRef?: (el: HTMLButtonElement | null) => void;
}) {
  const { message, selected, onClick, setRef } = props;
  const accent = accentKeyForMessage(message);

  return (
    <button
      ref={setRef}
      type="button"
      onClick={onClick}
      className={clsx(
        "border-r-4 px-3 py-2.5 text-left",
        "transition-all duration-100 focus:outline-none",
        rowBorderR[accent],
        rowBgTint[accent],
        !selected && rowHoverShadow[accent],
        selected
          ? "mr-0 w-full pr-7"
          : "mr-4 w-[calc(100%-1rem)] hover:mr-3 hover:w-[calc(100%-0.75rem)] hover:pr-4",
      )}
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 truncate text-xs font-semibold text-fg">
            {message.sender || "—"}
            {message.receiver ? ` → ${message.receiver}` : ""}
          </p>
          <div
            className={clsx(
              "text-xs leading-snug text-fg-muted [&_*]:text-xs [&_li]:m-0 [&_ol]:m-0 [&_p]:m-0 [&_ul]:m-0",
              (message.content?.length ?? 0) > 120 && "line-clamp-4",
            )}
          >
            {message.content ? <ReactPreview content={message.content} /> : "…"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-xs text-fg-muted">{dayjs(message.time).format("HH:mm")}</span>
          <span className="text-[10px] text-fg-muted/60">
            {dayjs(message.time).format("DD.MM.YY")}
          </span>
        </div>
      </div>
      {message.divisions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {message.divisions.slice(0, 3).map((d) => (
            <span
              key={d.division.id}
              className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              {d.division.name || d.division.description}
            </span>
          ))}
          {message.divisions.length > 3 && (
            <span className="text-[10px] text-fg-muted">+{message.divisions.length - 3}</span>
          )}
        </div>
      )}
    </button>
  );
}

export interface MessageStackProps {
  messages: Message[];
  /** The ID that should be highlighted and scrolled into center. */
  effectiveId: string | undefined;
  onSelect: (id: string | undefined) => void;
  className?: string;
}

export const MessageStack = memo(function MessageStack({
  messages,
  effectiveId,
  onSelect,
  className,
}: MessageStackProps) {
  const { t } = useTranslation();
  const [showScrollUp, setShowScrollUp] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === topSentinelRef.current) setShowScrollUp(!entry.isIntersecting);
          if (entry.target === bottomSentinelRef.current) setShowScrollDown(!entry.isIntersecting);
        }
      },
      { root, threshold: 0 },
    );
    if (topSentinelRef.current) observer.observe(topSentinelRef.current);
    if (bottomSentinelRef.current) observer.observe(bottomSentinelRef.current);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!effectiveId || !rowRefs.current[effectiveId]) return;
    rowRefs.current[effectiveId]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [effectiveId]);

  return (
    <div className={clsx("flex flex-col", className)}>
      <div className="flex justify-center py-1">
        {showScrollUp ? (
          <button
            type="button"
            onClick={() => topSentinelRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-full bg-bg-elevated/80 px-2 py-0.5 text-xs text-fg-muted shadow-sm transition-colors hover:text-fg"
          >
            <FontAwesomeIcon icon={faChevronUp} className="text-[10px]" />
          </button>
        ) : (
          <div className="rounded-full bg-bg-elevated/80 px-2 py-0.5 text-xs text-fg-muted shadow-sm">
            <FontAwesomeIcon icon={faSpinner} spin className="text-[10px]" />
          </div>
        )}
      </div>

      <div
        ref={listRef}
        className="scrollbar-none flex flex-1 flex-col overflow-x-hidden overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center gap-1.5 px-4 py-2 text-fg-muted">
            <FontAwesomeIcon icon={faSpinner} spin className="text-[10px]" />
            <p className="text-sm">{t("noNewMessagesAbove")}</p>
          </div>
        ) : (
          <>
            <div ref={topSentinelRef} className="h-px shrink-0" aria-hidden />

            {messages.map((msg) => (
              <MessageRow
                key={msg.id}
                message={msg}
                selected={msg.id === effectiveId}
                onClick={() => onSelect(msg.id === effectiveId ? undefined : msg.id)}
                setRef={(el) => {
                  rowRefs.current[msg.id] = el;
                }}
              />
            ))}

            <div ref={bottomSentinelRef} className="h-px shrink-0" aria-hidden />
            <div className="flex items-center justify-center py-2 text-fg-muted/50">
              <span className="text-[11px]">{t("noOlderMessages")}</span>
            </div>
          </>
        )}
      </div>

      <div className={clsx("flex justify-center py-1", showScrollDown ? "visible" : "invisible")}>
        <button
          type="button"
          onClick={() => bottomSentinelRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="rounded-full bg-bg-elevated/80 px-2 py-0.5 text-xs text-fg-muted shadow-sm transition-colors hover:text-fg"
        >
          <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
        </button>
      </div>
    </div>
  );
});
