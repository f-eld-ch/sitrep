import { faArrowsRotate, faChevronDown, faChevronUp, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import dayjs from "dayjs";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PriorityStatus, TriageStatus } from "types";
import type { Message } from "types/journal";

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
  dark:    "hover:shadow-[inset_0_1px_0_var(--color-fg),inset_0_-1px_0_var(--color-fg)]",
  danger:  "hover:shadow-[inset_0_1px_0_var(--color-danger),inset_0_-1px_0_var(--color-danger)]",
  none:    "hover:shadow-[inset_0_1px_0_var(--color-border),inset_0_-1px_0_var(--color-border)]",
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
        "border-r-4 text-left px-3 py-2.5",
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
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-fg truncate mb-0.5">
            {message.sender || "—"}
            {message.receiver ? ` → ${message.receiver}` : ""}
          </p>
          <p className="text-xs text-fg-muted line-clamp-2 leading-snug">
            {message.content || "…"}
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xs text-fg-muted">{dayjs(message.time).format("HH:mm")}</span>
          <span className="text-[10px] text-fg-muted/60">{dayjs(message.time).format("DD.MM.YY")}</span>
        </div>
      </div>
      {message.divisions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {message.divisions.slice(0, 3).map((d) => (
            <span
              key={d.division.id}
              className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium"
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
}

export function MessageStack({ messages, effectiveId, onSelect }: MessageStackProps) {
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
    <div className="flex flex-col w-72 lg:w-[36rem] flex-shrink-0">
      <div className={clsx("flex justify-center py-1", showScrollUp ? "visible" : "invisible")}>
        <button
          type="button"
          onClick={() => topSentinelRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="rounded-full bg-bg-elevated/80 px-2 py-0.5 text-xs text-fg-muted shadow-sm hover:text-fg transition-colors"
        >
          <FontAwesomeIcon icon={faChevronUp} className="text-[10px]" />
        </button>
      </div>

      <div
        ref={listRef}
        className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden scrollbar-none"
      >
        <div className="flex items-center justify-center gap-1.5 py-2 text-fg-muted/50">
          <FontAwesomeIcon icon={faSpinner} spin className="text-[10px]" />
          <span className="text-[11px]">{t("noNewMessagesAbove")}</span>
        </div>
        <div ref={topSentinelRef} className="h-px shrink-0" aria-hidden />

        {messages.map((msg) => (
          <MessageRow
            key={msg.id}
            message={msg}
            selected={msg.id === effectiveId}
            onClick={() => onSelect(msg.id === effectiveId ? undefined : msg.id)}
            setRef={(el) => { rowRefs.current[msg.id] = el; }}
          />
        ))}

        {messages.length === 0 && (
          <p className="px-4 py-2 text-sm text-fg-muted">{t("noMessages")}</p>
        )}
        <div ref={bottomSentinelRef} className="h-px shrink-0" aria-hidden />
        <div className="flex items-center justify-center py-2 text-fg-muted/50">
          <span className="text-[11px]">{t("noOlderMessages")}</span>
        </div>
      </div>

      <div className={clsx("flex justify-center py-1", showScrollDown ? "visible" : "invisible")}>
        <button
          type="button"
          onClick={() => bottomSentinelRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="rounded-full bg-bg-elevated/80 px-2 py-0.5 text-xs text-fg-muted shadow-sm hover:text-fg transition-colors"
        >
          <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
        </button>
      </div>
    </div>
  );
}
