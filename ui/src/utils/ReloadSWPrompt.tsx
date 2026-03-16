import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSWChannel, now } from "./swUpdateChannel";

const intervalMS = 60 * 60 * 1000;
const PROMPT_LOCK_KEY = "sw-prompt-last";
const PROMPT_LOCK_TTL = 60 * 1000; // 60s

function getVersion() {
  return import.meta.env.VITE_VERSION || "unknown";
}

function getChangelogUrl() {
  const sha = import.meta.env.VITE_SHA_VERSION || "main";
  return `https://github.com/RedGecko/sitrep/blob/${sha}/CHANGELOG.md`;
}

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log(`SW Registered: ${r}`);
      if (r === undefined) return;

      setInterval(() => {
        r.update();
      }, intervalMS);
      setOfflineReady(true);
    },
    onRegisterError(error) {
      console.log("SW registration error:", error);
    },
  });

  const [visible, setVisible] = useState(false);
  const [dismissUntil, setDismissUntil] = useState<number | null>(null);
  const tabId = useMemo(() => `${Math.random().toString(36).slice(2, 9)}`, []);
  const channelRef = useRef<{ post: (msg: any) => void; close: () => void } | null>(null);

  useEffect(() => {
    channelRef.current = createSWChannel((msg) => {
      if (!msg) return;
      if (msg.type === "update-available") {
        // another tab announced update; try to show unless recently shown
        const last = Number(localStorage.getItem(PROMPT_LOCK_KEY) || "0");
        if (now() - last > PROMPT_LOCK_TTL) {
          // allow showing in this tab
          // set visible only if needRefresh/online conditions are met
          if (needRefresh) setVisible(true);
        }
      } else if (msg.type === "apply-now") {
        // another tab requested apply-now: trigger update
        updateServiceWorker(true);
      } else if (msg.type === "apply-later") {
        updateServiceWorker(false);
      } else if (msg.type === "dismiss") {
        if (msg.until) setDismissUntil(msg.until);
      }
    });

    return () => channelRef.current?.close();
  }, [needRefresh, updateServiceWorker]);

  useEffect(() => {
    if (needRefresh) {
      const last = Number(localStorage.getItem(PROMPT_LOCK_KEY) || "0");
      if (now() - last < PROMPT_LOCK_TTL) {
        // another tab likely showed prompt recently; don't show here
        return;
      }

      // announce update and show prompt in this tab
      channelRef.current?.post({ type: "update-available", version: getVersion(), tabId });
      localStorage.setItem(PROMPT_LOCK_KEY, String(now()));
      if (!dismissUntil || now() > dismissUntil) setVisible(true);
    } else {
      setVisible(false);
    }
  }, [needRefresh, dismissUntil, tabId]);

  const close = (until?: number) => {
    setVisible(false);
    setNeedRefresh(false);
    setOfflineReady(false);
    if (until) {
      setDismissUntil(until);
      channelRef.current?.post({ type: "dismiss", tabId, until });
    }
  };

  const handleReloadNow = () => {
    channelRef.current?.post({ type: "apply-now", tabId });
    updateServiceWorker(true);
  };

  const handleApplyNextVisit = () => {
    // instruct SW to skip waiting but don't force a reload
    channelRef.current?.post({ type: "apply-later", tabId });
    updateServiceWorker(false);
    close();
  };

  const handleLater = (hours = 1) => {
    const until = Date.now() + hours * 60 * 60 * 1000;
    close(until);
  };

  return (
    <>
      {visible && offlineReady && (
        <div className="container is-fluid mt-2 pt-4">
          <div className="notification is-danger  mt-2">
            <button type="button" className="delete" onClick={() => handleLater(4)} />
            <div className="is-flex is-justify-content-space-between is-align-items-center">
              <div>
                <strong>{t("updateNotification")}</strong>
                <div className="mt-2">
                  <a href={getChangelogUrl()} target="_blank" rel="noopener noreferrer">
                    {t("viewChangelog")}
                  </a>
                  <span className="ml-3 has-text-weight-semibold">{getVersion()}</span>
                </div>
              </div>
              <div className="buttons">
                <button
                  type="button"
                  className="button is-danger is-light is-small"
                  onClick={handleReloadNow}
                >
                  {t("reloadNow")}
                </button>
                <button
                  type="button"
                  className="button is-warning is-light is-small"
                  onClick={handleApplyNextVisit}
                >
                  {t("applyNextVisit")}
                </button>
                <button
                  type="button"
                  className="button is-light is-small"
                  onClick={() => handleLater(4)}
                >
                  {t("later")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ReloadPrompt;
