import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "i18next";
import { useEffect, useId, useRef, useState } from "react";
import { faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Notification } from "components/ui";
import { createSWChannel, now, type SWMessage } from "./swUpdateChannel";
import {
  CURRENT_SHA,
  CURRENT_VERSION,
  changelogUrl,
  type DeployedVersion,
  fetchDeployedVersion,
} from "./version";

const intervalMS = 60 * 60 * 1000;
const PROMPT_LOCK_KEY = "sw-prompt-last";
const PROMPT_LOCK_TTL = 60 * 1000; // 60s

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r === undefined) return;
      setInterval(() => {
        r.update();
      }, intervalMS);
      setOfflineReady(true);
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onOfflineReady() {
      setOfflineReady(true);
    },
  });

  // The build the server is now serving, which is the update being offered. Null until
  // fetched, or when the lookup failed — see the fallback where it is rendered.
  const [deployed, setDeployed] = useState<DeployedVersion | null>(null);
  const [dismissUntil, setDismissUntil] = useState<number | null>(null);
  const tabId = useId();
  const channelRef = useRef<{ post: (msg: SWMessage) => void; close: () => void } | null>(null);

  useEffect(() => {
    // Keyed on needRefresh so this costs a request only when an update exists, rather than
    // on every page load. The running bundle cannot know the new version itself.
    if (!needRefresh) return;
    let active = true;
    void fetchDeployedVersion().then((info) => {
      if (active) setDeployed(info);
    });
    return () => {
      active = false;
    };
  }, [needRefresh]);

  useEffect(() => {
    channelRef.current = createSWChannel((msg) => {
      if (!msg) return;
      if (msg.type === "update-available") {
        // another tab announced update; try to show unless recently shown
        const last = Number(localStorage.getItem(PROMPT_LOCK_KEY) || "0");
        if (now() - last > PROMPT_LOCK_TTL) {
        }
      } else if (msg.type === "apply-now") {
        // another tab requested apply-now: trigger update immediately
        updateServiceWorker(true);
      } else if (msg.type === "apply-later") {
        // another tab requested to apply on next visit
        updateServiceWorker(false);
      } else if (msg.type === "dismiss") {
        if (msg.until) setDismissUntil(msg.until);
      }
    });

    return () => channelRef.current?.close();
  }, [updateServiceWorker]);

  // Allow external triggers (e.g. tests or other scripts) to notify this tab
  // that an update is available via `window.dispatchEvent(new Event('sw-update-available'))`.
  useEffect(() => {
    const handler = () => {
      try {
        setNeedRefresh(true);
        setOfflineReady(true);

        const last = Number(localStorage.getItem(PROMPT_LOCK_KEY) || "0");
        if (now() - last > PROMPT_LOCK_TTL) {
          channelRef.current?.post({ type: "update-available", version: CURRENT_VERSION, tabId });
          localStorage.setItem(PROMPT_LOCK_KEY, String(now()));
          if (!dismissUntil || now() > dismissUntil) {
          }
        }
      } catch (e) {
        console.error("Error handling sw-update-available event:", e);
      }
    };

    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, [setNeedRefresh, setOfflineReady, tabId, dismissUntil]);

  // Fallback: directly inspect navigator.serviceWorker registration and events
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let mounted = true;

    async function checkRegistration() {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!mounted || !reg) return;

        if (reg.waiting) {
          setNeedRefresh(true);
          setOfflineReady(true);
        }

        // If there's an installing worker already, listen to its state changes immediately
        if (reg.installing) {
          const inst = reg.installing;
          const onStateChange = () => {
            if (inst.state === "installed") {
              // new SW installed and waiting
              setNeedRefresh(true);
              setOfflineReady(true);
            }
          };
          inst.addEventListener("statechange", onStateChange);
          // check current state in case it is already installed
          onStateChange();
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (installing) {
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed") {
                // new SW installed and waiting
                setNeedRefresh(true);
                setOfflineReady(true);
              }
            });
          }
        });
      } catch (e) {
        console.error("SW registration check failed:", e);
      }
    }

    checkRegistration();

    // Additional fallback: poll the registration.waiting for short period
    let polls = 0;
    const maxPolls = 20; // ~20s
    const pollInterval = 1000;
    const pollId = setInterval(async () => {
      if (!mounted) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          setNeedRefresh(true);
          setOfflineReady(true);
          clearInterval(pollId);
          return;
        }
      } catch (e) {
        console.error("SW poll failed:", e);
      }
      polls += 1;
      if (polls >= maxPolls) clearInterval(pollId);
    }, pollInterval);

    return () => {
      mounted = false;
      try {
        clearInterval(pollId);
      } catch (e) {
        console.error("Error clearing SW poll interval:", e);
      }
    };
  }, [setNeedRefresh, setOfflineReady]);

  const visible = needRefresh && (!dismissUntil || now() > dismissUntil);

  const close = (until?: number) => {
    setNeedRefresh(false);
    setOfflineReady(false);
    if (until) {
      // snooze until the timestamp
      setDismissUntil(until);
      channelRef.current?.post({ type: "dismiss", tabId, until });
    } else {
      channelRef.current?.post({ type: "apply-later", tabId });
      updateServiceWorker(false).catch((e) => {
        console.error("Error applying SW update for later:", e);
      });
    }
  };

  const [reloading, setReloading] = useState(false);

  const handleReloadNow = () => {
    setReloading(true);
    channelRef.current?.post({ type: "apply-now", tabId });
    updateServiceWorker(true);
  };

  const handleLater = (hours = 1) => {
    const until = Date.now() + hours * 60 * 60 * 1000;
    close(until);
  };

  return (
    <>
      {visible && offlineReady && (
        <div className="px-4 pt-4">
          <Notification variant="success" light className="relative mt-2">
            <button
              type="button"
              className="absolute top-2 right-2 opacity-60 hover:opacity-100"
              aria-label={t("close")}
              onClick={() => handleLater(4)}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
            <strong>{t("updateNotification")}</strong>
            <div className="mt-2">
              <a
                href={changelogUrl(deployed?.sha ?? CURRENT_SHA)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("viewChangelog")}
              </a>
              <span className="ml-3 font-semibold">{deployed?.version ?? CURRENT_VERSION}</span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="success" size="sm" onClick={handleReloadNow} disabled={reloading}>
                {reloading && <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />}
                {t("reloadNow")}
              </Button>
              <Button variant="warning" size="sm" onClick={() => handleLater(4)}>
                {t("later")}
              </Button>
            </div>
          </Notification>
        </div>
      )}
    </>
  );
}

export default ReloadPrompt;
