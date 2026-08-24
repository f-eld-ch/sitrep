export type SWMessage =
  | { type: "update-available"; version: string; tabId: string }
  | { type: "apply-now"; tabId: string }
  | { type: "apply-later"; tabId: string }
  | { type: "dismiss"; tabId: string; until?: number };

const CHANNEL = "sitrep-sw-update";

export function createSWChannel(onMessage: (msg: SWMessage) => void) {
  if (typeof window === "undefined") return { post: () => {}, close: () => {} };

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (ev) => onMessage(ev.data as SWMessage);
  } catch {
    // BroadcastChannel not available; fallback to storage events
    const storageHandler = (ev: StorageEvent) => {
      if (ev.key !== CHANNEL || !ev.newValue) return;
      try {
        const msg = JSON.parse(ev.newValue) as SWMessage;
        onMessage(msg);
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", storageHandler);

    return {
      post: (msg: SWMessage) => {
        try {
          localStorage.setItem(CHANNEL, JSON.stringify(msg));
          // also clear to allow future same messages
          setTimeout(() => localStorage.removeItem(CHANNEL), 500);
        } catch {
          // ignore
        }
      },
      close: () => window.removeEventListener("storage", storageHandler),
    };
  }

  return {
    post: (msg: SWMessage) => bc?.postMessage(msg),
    close: () => bc?.close(),
  };
}

export function now() {
  return Date.now();
}
