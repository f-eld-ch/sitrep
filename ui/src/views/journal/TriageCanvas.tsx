import {
  faCheckCircle,
  faKeyboard,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageTitle } from "components/ui";

function EmptyState() {
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

export interface TriageCanvasProps {
  children?: React.ReactNode;
  incidentClosed?: boolean;
}

export function TriageCanvas({ children, incidentClosed = false }: TriageCanvasProps) {
  const { t } = useTranslation();
  return (
    <div className="ml-4 flex flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center border-b border-border px-5 pt-5 pb-3">
        <PageTitle level={1} className="flex-1">
          {t("triageView")}
        </PageTitle>
        <KeybindingHelp />
      </header>
      {incidentClosed ? <ClosedWarning /> : (children ?? <EmptyState />)}
    </div>
  );
}
