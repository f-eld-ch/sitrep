import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router";
import { Button } from "components/ui";
import { LayerContext } from "../LayerContext";

/**
 * Features drawn on the free map only exist locally until they are saved. Leaving the page, or
 * closing the tab, would throw them away without a word, so both ask first.
 */
export function PendingFeaturesGuard() {
  const { t } = useTranslation();
  const { state } = useContext(LayerContext);
  const unsaved = state.pendingFeatures.length;
  const blocker = useBlocker(unsaved > 0);

  useEffect(() => {
    if (unsaved === 0) return;

    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  if (blocker.state !== "blocked") return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <div
        role="alertdialog"
        className="pointer-events-auto flex max-w-xl items-start gap-3 rounded border border-danger/30 bg-bg p-4 text-sm text-fg shadow-lg"
      >
        <p className="flex-1">{t("mapview.pending.unsaved", { count: unsaved })}</p>
        <Button variant="danger" size="sm" onClick={() => blocker.proceed()}>
          {t("mapview.pending.leave")}
        </Button>
        <button
          type="button"
          aria-label={t("cancel")}
          className="text-fg-muted hover:text-fg"
          onClick={() => blocker.reset()}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>
    </div>
  );
}
