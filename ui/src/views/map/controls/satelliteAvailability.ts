import { useEffect, useState } from "react";

// The satellite map is the one thing that is never served by sitrep: swisstopo publishes no
// offline tiles for SWISSIMAGE. Whether it works depends on the browser reaching swisstopo, so the
// check runs in the browser, not on the server.
//
// A small tile that answers HEAD (and CORS) is enough to tell whether the service is reachable.
// A HEAD that is never cached beats loading an <img>, which the browser could answer from its
// cache while offline.
export const SATELLITE_PROBE_URL =
  "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/7/66/44.jpeg";

const PROBE_TIMEOUT_MS = 4000;
// One failed probe can be a blip, so a second one decides.
const RETRY_DELAY_MS = 1500;
// While unavailable, look again from time to time (the online event is not always fired).
const RECHECK_MS = 30000;

/** Resolves true when swisstopo's imagery service answers within the timeout. Never rejects. */
export async function probeSatellite(timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(SATELLITE_PROBE_URL, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function probeWithRetry(): Promise<boolean> {
  if (await probeSatellite()) return true;
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  return probeSatellite();
}

/**
 * Whether the satellite map can be loaded right now. It starts optimistic (true) so the switcher
 * does not flash a disabled entry while the first check runs, goes false at once when the browser
 * reports it is offline, and after two failed probes otherwise. While unavailable it checks again
 * every 30 seconds and whenever the browser comes back online.
 */
export function useSatelliteAvailable(): boolean {
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let latest = 0;
    let recheck: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      clearTimeout(recheck);
      const run = ++latest;
      const ok = navigator.onLine ? await probeWithRetry() : false;

      // A newer check (online/offline event) supersedes this one.
      if (cancelled || run !== latest) return;

      setAvailable(ok);
      if (!ok) recheck = setTimeout(check, RECHECK_MS);
    };

    const onChange = () => void check();

    void check();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);

    return () => {
      cancelled = true;
      clearTimeout(recheck);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  return available;
}
