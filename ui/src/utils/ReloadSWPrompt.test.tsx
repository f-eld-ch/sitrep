import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReloadPrompt } from "./ReloadSWPrompt";
import { buildChangelogUrl, CURRENT_SHA, CURRENT_VERSION, fetchDeployedVersion } from "./version";

interface RegisterOptions {
  onRegistered?: (r: { update: () => void } | undefined) => void;
  onRegisterError?: (error: unknown) => void;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
}

const sw = vi.hoisted(() => ({
  options: {} as RegisterOptions,
  updateServiceWorker: vi.fn(),
}));

// The real hook comes from the PWA plugin as a virtual module. This stand-in keeps its contract:
// the two [value, setter] pairs, the callbacks, and updateServiceWorker.
vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: (options: RegisterOptions) => {
    sw.options = options;
    return {
      offlineReady: useState(false),
      needRefresh: useState(false),
      updateServiceWorker: sw.updateServiceWorker,
    };
  },
}));

vi.mock("i18next", () => ({ t: (key: string) => key }));

vi.mock("./version", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./version")>()),
  fetchDeployedVersion: vi.fn(),
}));

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  /** What another tab would send. */
  receive(data: unknown) {
    act(() => this.onmessage?.({ data }));
  }
}

const channel = () => FakeBroadcastChannel.instances[0];
const posted = () => channel().postMessage.mock.calls.map((c) => c[0]);

/** The page has registered a worker and it announces an update. */
async function showPrompt() {
  const registration = { update: vi.fn() };
  await act(async () => {
    sw.options.onRegistered?.(registration);
    sw.options.onNeedRefresh?.();
  });
  return registration;
}

const NOW = new Date("2026-03-01T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  sw.updateServiceWorker.mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchDeployedVersion).mockReset().mockResolvedValue(null);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup(); // unmount while navigator.serviceWorker is still stubbed
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("ReloadPrompt", () => {
  it("shows nothing until the worker reports an update", () => {
    render(<ReloadPrompt />);
    expect(screen.queryByText("updateNotification")).not.toBeInTheDocument();
    expect(fetchDeployedVersion).not.toHaveBeenCalled();
  });

  it("offers the update once registered and a refresh is needed", async () => {
    render(<ReloadPrompt />);
    await showPrompt();
    expect(screen.getByText("updateNotification")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "reloadNow" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "later" })).toBeInTheDocument();
  });

  it("stays hidden when a refresh is needed but the worker never registered", async () => {
    render(<ReloadPrompt />);
    await act(async () => sw.options.onNeedRefresh?.());
    expect(screen.queryByText("updateNotification")).not.toBeInTheDocument();
  });

  it("links to the changelog of the running build when the deployed one is unknown", async () => {
    render(<ReloadPrompt />);
    await showPrompt();
    const link = screen.getByRole("link", { name: "viewChangelog" });
    expect(link).toHaveAttribute("href", buildChangelogUrl(CURRENT_VERSION, CURRENT_SHA));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(CURRENT_VERSION)).toBeInTheDocument();
  });

  it("names the deployed version and links to its changelog entry", async () => {
    vi.mocked(fetchDeployedVersion).mockResolvedValue({ version: "v26.10.0", sha: "abc1234" });
    render(<ReloadPrompt />);
    await showPrompt();
    expect(screen.getByText("v26.10.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "viewChangelog" })).toHaveAttribute(
      "href",
      "https://sitrep.ch/changelog/#v26.10.0",
    );
  });

  it("asks for the deployed version once per update", async () => {
    render(<ReloadPrompt />);
    await showPrompt();
    expect(fetchDeployedVersion).toHaveBeenCalledTimes(1);
  });

  it("shows the update when the offline-ready callback fires after a refresh is needed", async () => {
    render(<ReloadPrompt />);
    await act(async () => {
      sw.options.onNeedRefresh?.();
      sw.options.onOfflineReady?.();
    });
    expect(screen.getByText("updateNotification")).toBeInTheDocument();
  });

  describe("registration", () => {
    it("checks for a new worker every hour", async () => {
      render(<ReloadPrompt />);
      const registration = await showPrompt();
      expect(registration.update).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(60 * 60 * 1000));
      expect(registration.update).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(2 * 60 * 60 * 1000));
      expect(registration.update).toHaveBeenCalledTimes(3);
    });

    it("does nothing when there is no registration", async () => {
      render(<ReloadPrompt />);
      await act(async () => {
        sw.options.onRegistered?.(undefined);
        sw.options.onNeedRefresh?.();
      });
      expect(vi.getTimerCount()).toBe(0);
      expect(screen.queryByText("updateNotification")).not.toBeInTheDocument();
    });

    it("logs a registration error", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      render(<ReloadPrompt />);
      const failure = new Error("no worker");
      sw.options.onRegisterError?.(failure);
      expect(error).toHaveBeenCalledWith("SW registration error:", failure);
    });
  });

  describe("reload now", () => {
    it("applies a waiting worker, telling the other tabs", async () => {
      const getRegistration = vi.fn().mockResolvedValue({ waiting: {} });
      Object.defineProperty(navigator, "serviceWorker", {
        value: { getRegistration, addEventListener: vi.fn(), removeEventListener: vi.fn() },
        configurable: true,
      });
      render(<ReloadPrompt />);
      await showPrompt();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "reloadNow" }));
      });
      expect(posted()).toEqual([{ type: "apply-now", tabId: expect.any(String) }]);
      expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
      expect(screen.getByRole("button", { name: "reloadNow" })).toBeDisabled();
    });

    it("reloads the page itself when no worker is waiting, as another tab already applied it", async () => {
      const reload = vi.fn();
      vi.stubGlobal("location", { ...window.location, reload });
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          getRegistration: vi.fn().mockResolvedValue({ waiting: null }),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        configurable: true,
      });
      render(<ReloadPrompt />);
      await showPrompt();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "reloadNow" }));
      });
      expect(reload).toHaveBeenCalledTimes(1);
      expect(sw.updateServiceWorker).not.toHaveBeenCalled();
    });

    it("reloads the page when service workers are unsupported", async () => {
      const reload = vi.fn();
      vi.stubGlobal("location", { ...window.location, reload });
      render(<ReloadPrompt />);
      await showPrompt();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "reloadNow" }));
      });
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe("later", () => {
    it.each([
      ["the later button", () => screen.getByRole("button", { name: "later" })],
      ["the close button", () => screen.getByRole("button", { name: "close" })],
    ])("hides the prompt and snoozes the other tabs for four hours with %s", async (_n, button) => {
      render(<ReloadPrompt />);
      await showPrompt();
      fireEvent.click(button());
      expect(screen.queryByText("updateNotification")).not.toBeInTheDocument();
      expect(posted()).toEqual([
        {
          type: "dismiss",
          tabId: expect.any(String),
          until: NOW.getTime() + 4 * 60 * 60 * 1000,
        },
      ]);
    });
  });

  describe("messages from other tabs", () => {
    it("applies the update at once on apply-now", () => {
      render(<ReloadPrompt />);
      channel().receive({ type: "apply-now", tabId: "other" });
      expect(sw.updateServiceWorker).toHaveBeenCalledWith(true);
    });

    it("applies the update on the next visit on apply-later", () => {
      render(<ReloadPrompt />);
      channel().receive({ type: "apply-later", tabId: "other" });
      expect(sw.updateServiceWorker).toHaveBeenCalledWith(false);
    });

    it("hides the prompt while another tab has snoozed it", async () => {
      render(<ReloadPrompt />);
      await showPrompt();
      channel().receive({ type: "dismiss", tabId: "other", until: NOW.getTime() + 1000 });
      expect(screen.queryByText("updateNotification")).not.toBeInTheDocument();
    });

    it("shows the prompt again once the snooze has passed", async () => {
      render(<ReloadPrompt />);
      await showPrompt();
      channel().receive({ type: "dismiss", tabId: "other", until: NOW.getTime() + 1000 });
      vi.setSystemTime(new Date(NOW.getTime() + 2000));
      // a later message re-renders, and visibility is then evaluated against the clock
      channel().receive({ type: "dismiss", tabId: "other", until: NOW.getTime() + 1500 });
      expect(screen.getByText("updateNotification")).toBeInTheDocument();
    });

    it("ignores a dismissal without a time, an update announcement and an empty message", async () => {
      render(<ReloadPrompt />);
      await showPrompt();
      channel().receive({ type: "dismiss", tabId: "other" });
      channel().receive({ type: "update-available", version: "v1", tabId: "other" });
      channel().receive(null);
      expect(screen.getByText("updateNotification")).toBeInTheDocument();
      expect(sw.updateServiceWorker).not.toHaveBeenCalled();
    });

    it("closes the channel on unmount", () => {
      const { unmount } = render(<ReloadPrompt />);
      unmount();
      expect(channel().close).toHaveBeenCalledTimes(1);
    });
  });

  describe("the sw-update-available window event", () => {
    it("shows the prompt, announces it to the other tabs and takes the prompt lock", async () => {
      render(<ReloadPrompt />);
      await act(async () => {
        window.dispatchEvent(new Event("sw-update-available"));
      });
      expect(screen.getByText("updateNotification")).toBeInTheDocument();
      expect(posted()).toEqual([
        { type: "update-available", version: CURRENT_VERSION, tabId: expect.any(String) },
      ]);
      expect(window.localStorage.getItem("sw-prompt-last")).toBe(String(NOW.getTime()));
    });

    it("does not announce again within 60 seconds, but does after", async () => {
      render(<ReloadPrompt />);
      await act(async () => {
        window.dispatchEvent(new Event("sw-update-available"));
      });
      vi.setSystemTime(new Date(NOW.getTime() + 59_000));
      await act(async () => {
        window.dispatchEvent(new Event("sw-update-available"));
      });
      expect(posted()).toHaveLength(1);
      vi.setSystemTime(new Date(NOW.getTime() + 61_000));
      await act(async () => {
        window.dispatchEvent(new Event("sw-update-available"));
      });
      expect(posted()).toHaveLength(2);
    });

    it("logs when the prompt lock cannot be read", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("denied");
      });
      render(<ReloadPrompt />);
      await act(async () => {
        window.dispatchEvent(new Event("sw-update-available"));
      });
      expect(error).toHaveBeenCalledWith(
        "Error handling sw-update-available event:",
        expect.any(Error),
      );
    });

    it("stops listening on unmount", async () => {
      const { unmount } = render(<ReloadPrompt />);
      unmount();
      window.dispatchEvent(new Event("sw-update-available"));
      expect(posted()).toEqual([]);
    });
  });

  describe("when the new worker takes control", () => {
    it("withdraws the prompt, and stops listening on unmount", async () => {
      const listeners = new Map<string, () => void>();
      const removeEventListener = vi.fn();
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          getRegistration: vi.fn(),
          addEventListener: (type: string, l: () => void) => listeners.set(type, l),
          removeEventListener,
        },
        configurable: true,
      });
      const { unmount } = render(<ReloadPrompt />);
      await showPrompt();
      expect(screen.getByText("updateNotification")).toBeInTheDocument();

      act(() => listeners.get("controllerchange")?.());
      expect(screen.queryByText("updateNotification")).not.toBeInTheDocument();

      unmount();
      expect(removeEventListener).toHaveBeenCalledWith(
        "controllerchange",
        listeners.get("controllerchange"),
      );
    });
  });
});
