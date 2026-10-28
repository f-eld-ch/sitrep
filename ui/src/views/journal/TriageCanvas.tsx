import {
  faCheckCircle,
  faFilePen,
  faKeyboard,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { Button, EmptyState, PageTitle } from "components/ui";

function CaughtUp() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center text-success">
      <div className="text-center">
        <FontAwesomeIcon icon={faCheckCircle} className="mb-3 text-5xl" />
        <p className="text-lg font-bold">{t("triageCaughtUp")}</p>
      </div>
    </div>
  );
}

function ClosedWarning() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <FontAwesomeIcon icon={faTriangleExclamation} className="mb-3 text-5xl text-danger" />
        <p className="text-lg font-bold text-danger">{t("triageIncidentClosed")}</p>
      </div>
    </div>
  );
}

const SHORTCUTS = [
  { keys: ["Ctrl", "↑"], labelKey: "keybindings.prevMessage" },
  { keys: ["Ctrl", "↓"], labelKey: "keybindings.nextMessage" },
  { keys: ["Ctrl", "↵"], labelKey: "keybindings.nextStep" },
  { keys: ["Esc"], labelKey: "keybindings.deselect" },
] as const;

function KeybindingHelp() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("keybindings.title")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded p-1.5 text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg"
      >
        <FontAwesomeIcon icon={faKeyboard} className="text-base" />
      </button>

      {open && (
        <>
          {/* backdrop to close on outside click */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 z-20 mt-1 w-56 rounded border border-border bg-bg shadow-xl">
            <p className="border-b border-border px-3 py-2 text-xs font-bold tracking-wider text-fg-muted uppercase">
              {t("keybindings.title")}
            </p>
            <ul className="p-2">
              {SHORTCUTS.map(({ keys, labelKey }) => (
                <li key={labelKey} className="flex items-center justify-between gap-2 px-1 py-1.5">
                  <span className="text-xs text-fg">{t(labelKey)}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-border bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/** Nothing to triage because nothing has been created yet: messages are added in the editor. */
function NoMessages() {
  const { t } = useTranslation();
  const { incidentId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <EmptyState
        className="w-full max-w-lg"
        icon={faFilePen}
        title={t("triageNoMessages")}
        hint={t("triageNoMessagesHint")}
      >
        {incidentId && (
          <Button
            type="button"
            variant="primary"
            onClick={() => navigate(`/incident/${incidentId}/journal/edit`)}
          >
            <FontAwesomeIcon icon={faFilePen} />
            <span>{t("editor")}</span>
          </Button>
        )}
      </EmptyState>
    </div>
  );
}

export interface TriageSavedProps {
  /** Number of the message that was just triaged. */
  messageNumber: number;
  /** Number of the next pending message; undefined when nothing is left to triage. */
  nextNumber?: number;
  /** How many messages are still pending. */
  pendingCount: number;
  onNext: () => void;
  onAdjust: () => void;
  /** Further actions, e.g. printing the message sheet. */
  children?: React.ReactNode;
}

/** Shown after a triage was saved, until the operator chooses how to go on. */
export function TriageSaved({
  messageNumber,
  nextNumber,
  pendingCount,
  onNext,
  onAdjust,
  children,
}: TriageSavedProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (nextNumber === undefined) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat) return;
      // Plain Enter on a focused button or field belongs to that element; Ctrl+Enter always advances.
      const target = e.target as HTMLElement | null;
      if (!e.ctrlKey && target?.closest("button, a, input, textarea, select")) return;
      e.preventDefault();
      onNext();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [nextNumber, onNext]);

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <EmptyState
        className="w-full max-w-lg"
        icon={faCheckCircle}
        title={t("triageSaved")}
        hint={t("triageSavedHint", { number: messageNumber })}
      >
        {nextNumber !== undefined ? (
          <Button type="button" variant="primary" onClick={onNext}>
            {t("triageNextPending", { number: nextNumber })}
          </Button>
        ) : (
          <p className="font-bold text-success">{t("triageCaughtUp")}</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="light" size="sm" onClick={onAdjust}>
            {t("triageAdjust")}
          </Button>
          {children}
        </div>
        {pendingCount > 0 && (
          <p className="text-xs text-fg-muted">
            {t("triagePendingCount", { count: pendingCount })}
          </p>
        )}
      </EmptyState>
    </div>
  );
}

export interface TriageCanvasProps {
  children?: React.ReactNode;
  incidentClosed?: boolean;
  /** False when the incident has no messages at all, as opposed to none left to triage. */
  hasMessages?: boolean;
}

export function TriageCanvas({
  children,
  incidentClosed = false,
  hasMessages = true,
}: TriageCanvasProps) {
  const { t } = useTranslation();
  return (
    <div className="ml-4 flex flex-1 flex-col overflow-hidden">
      <header className="hidden shrink-0 items-center border-b border-border px-5 pt-5 pb-3 lg:flex">
        <PageTitle level={1} className="flex-1">
          {t("triageView")}
        </PageTitle>
        <KeybindingHelp />
      </header>
      {incidentClosed ? (
        <ClosedWarning />
      ) : !hasMessages ? (
        <NoMessages />
      ) : (
        (children ?? <CaughtUp />)
      )}
    </div>
  );
}
