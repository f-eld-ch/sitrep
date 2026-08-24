import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "i18next";
import { useEffect, useId, useRef, useState } from "react";
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
    onNeedRefresh() {
      console.log("SW needs refresh");
      setNeedRefresh(true);
    },
    onOfflineReady() {
      console.log("SW offline ready");
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
        console.log("Error handling sw-update-available event:", e);
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
        console.log("SW registration (fallback check):", reg);
        if (!mounted || !reg) return;

        if (reg.waiting) {
          console.log("SW fallback: found waiting worker");
          setNeedRefresh(true);
          setOfflineReady(true);
        }

        // If there's an installing worker already, listen to its state changes immediately
        if (reg.installing) {
          const inst = reg.installing;
          console.log("SW fallback: found installing worker, state:", inst.state);
          const onStateChange = () => {
            console.log("SW fallback: installing state ->", inst.state);
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
          console.log("SW fallback: updatefound event");
          const installing = reg.installing;
          if (installing) {
            installing.addEventListener("statechange", () => {
              console.log("SW fallback: installing state ->", installing.state);
              if (installing.state === "installed") {
                // new SW installed and waiting
                setNeedRefresh(true);
                setOfflineReady(true);
              }
            });
          }
        });

        // also listen for controlling change
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          console.log("SW fallback: controllerchange");
        });
      } catch (e) {
        console.log("SW fallback check failed:", e);
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
          console.log("SW poll: found waiting worker");
          setNeedRefresh(true);
          setOfflineReady(true);
          clearInterval(pollId);
          return;
        }
      } catch (e) {
        console.log("SW poll failed:", e);
      }
      polls += 1;
      if (polls >= maxPolls) clearInterval(pollId);
    }, pollInterval);

    return () => {
      mounted = false;
      try {
        clearInterval(pollId);
      } catch (e) {
        console.log("Error clearing SW poll interval:", e);
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
        console.log("Error applying SW update for later:", e);
      });
    }
  };

  const handleReloadNow = () => {
    channelRef.current?.post({ type: "apply-now", tabId });
    updateServiceWorker(true);
  };

  const handleLater = (hours = 1) => {
    const until = Date.now() + hours * 60 * 60 * 1000;
    close(until);
  };

  // Debugging: log render-time state to help diagnose why the prompt isn't shown
  // eslint-disable-next-line no-console
  console.log("ReloadPrompt render state:", {
    visible,
    needRefresh,
    offlineReady,
    dismissUntil,
  });

  return (
    <>
      {visible && offlineReady && (
        <div className="container is-fluid pt-4">
          <div className="notification is-light is-success mt-2">
            <button
              type="button"
              className="delete"
              aria-label={t("close")}
              onClick={() => handleLater(4)}
            />
            <div>
              <div>
                <strong>{t("updateNotification")}</strong>
                <div className="mt-2">
                  <a
                    href={changelogUrl(deployed?.sha ?? CURRENT_SHA)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("viewChangelog")}
                  </a>
                  <span className="ml-3 has-text-weight-semibold">
                    {deployed?.version ?? CURRENT_VERSION}
                  </span>
                </div>
              </div>
              <div className="buttons pt-2">
                <button
                  type="button"
                  className="button is-success is-small"
                  onClick={handleReloadNow}
                >
                  {t("reloadNow")}
                </button>
                <button
                  type="button"
                  className="button is-warning is-small"
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
