import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapStyleProvider, MapStyles, StyleController, useMapStyle } from "./StyleController";
import {
  SATELLITE_PROBE_URL,
  probeSatellite,
  useSatelliteAvailable,
} from "./satelliteAvailability";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const fetchMock = vi.fn();

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}

// A fetch that never answers on its own but honours the abort signal, like a stalled connection.
function stalledFetch(_url: string, init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(new DOMException("aborted", "AbortError")),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setOnline(true);
});

const ok = () => Promise.resolve({ ok: true } as Response);
const notFound = () => Promise.resolve({ ok: false, status: 503 } as Response);

describe("probeSatellite", () => {
  it("asks swisstopo's imagery service with an uncached HEAD request", async () => {
    fetchMock.mockImplementation(ok);

    await expect(probeSatellite()).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      SATELLITE_PROBE_URL,
      expect.objectContaining({ method: "HEAD", cache: "no-store" }),
    );
    expect(SATELLITE_PROBE_URL).toContain("wmts.geo.admin.ch");
  });

  it("is false for an error status and for a network error, and never throws", async () => {
    fetchMock.mockImplementationOnce(notFound);
    await expect(probeSatellite()).resolves.toBe(false);

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(probeSatellite()).resolves.toBe(false);
  });

  it("gives up on a stalled connection after the timeout", async () => {
    fetchMock.mockImplementation(stalledFetch);

    const result = probeSatellite(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe(false);
  });
});

describe("useSatelliteAvailable", () => {
  it("is available while swisstopo answers", async () => {
    fetchMock.mockImplementation(ok);

    const { result } = renderHook(() => useSatelliteAvailable());
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current).toBe(true);
  });

  it("is optimistic until the first check has finished", () => {
    fetchMock.mockImplementation(stalledFetch);

    const { result } = renderHook(() => useSatelliteAvailable());

    expect(result.current).toBe(true);
  });

  it("needs two failed probes: a single blip does not disable it", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("blip")).mockImplementation(ok);

    const { result } = renderHook(() => useSatelliteAvailable());
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(result.current).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("becomes unavailable after two failed probes", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));

    const { result } = renderHook(() => useSatelliteAvailable());
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(result.current).toBe(false);
  });

  it("is unavailable at once when the browser goes offline, without probing", async () => {
    fetchMock.mockImplementation(ok);

    const { result } = renderHook(() => useSatelliteAvailable());
    await act(() => vi.advanceTimersByTimeAsync(0));
    fetchMock.mockClear();

    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recovers when the browser comes back online", async () => {
    setOnline(false);
    fetchMock.mockImplementation(ok);

    const { result } = renderHook(() => useSatelliteAvailable());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toBe(false);

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current).toBe(true);
  });

  it("looks again every 30 seconds while unavailable, even without an online event", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));

    const { result } = renderHook(() => useSatelliteAvailable());
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(result.current).toBe(false);

    fetchMock.mockReset();
    fetchMock.mockImplementation(ok);
    await act(() => vi.advanceTimersByTimeAsync(30000));

    expect(result.current).toBe(true);
  });

  it("stops checking when the component is gone", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"));

    const { unmount } = renderHook(() => useSatelliteAvailable());
    await act(() => vi.advanceTimersByTimeAsync(3000));
    unmount();
    fetchMock.mockClear();

    await vi.advanceTimersByTimeAsync(120000);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// A consumer that shows the selected style and can pick the satellite map.
function Probe() {
  const { selectedStyle, setSelectedStyle } = useMapStyle();
  return (
    <>
      <span data-testid="selected">{selectedStyle.name}</span>
      <button type="button" onClick={() => setSelectedStyle(MapStyles[1])}>
        pick-satellite
      </button>
      <StyleController />
    </>
  );
}

function openPanel() {
  fireEvent.click(document.querySelector("button.maplibregl-ctrl-icon") as HTMLElement);
}

describe("style switcher", () => {
  it("offers the satellite map while it is available", async () => {
    fetchMock.mockImplementation(ok);

    render(
      <MapStyleProvider>
        <Probe />
      </MapStyleProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    openPanel();

    const block = screen.getByText("styleController.Satellit").closest("div");
    expect(block).not.toHaveAttribute("aria-disabled");

    fireEvent.click(block as HTMLElement);
    expect(screen.getByTestId("selected")).toHaveTextContent("Satellit");
  });

  it("greys out the satellite map offline, with a reason, and ignores clicks on it", async () => {
    setOnline(false);
    fetchMock.mockImplementation(ok);

    render(
      <MapStyleProvider>
        <Probe />
      </MapStyleProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    openPanel();

    const block = screen.getByText("styleController.Satellit").closest("div") as HTMLElement;
    expect(block).toHaveAttribute("aria-disabled", "true");
    expect(block).toHaveAttribute("title", "styleController.notAvailableOffline");
    expect(screen.getByText("(styleController.notAvailableOffline)")).toBeInTheDocument();

    fireEvent.click(block);
    expect(screen.getByTestId("selected")).toHaveTextContent("Basiskarte");

    // The base map is never greyed out.
    const base = screen.getByText("styleController.Basiskarte").closest("div");
    expect(base).not.toHaveAttribute("aria-disabled");
  });

  it("switches from the satellite map back to the base map when swisstopo goes away", async () => {
    fetchMock.mockImplementation(ok);

    render(
      <MapStyleProvider>
        <Probe />
      </MapStyleProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));

    fireEvent.click(screen.getByText("pick-satellite"));
    expect(screen.getByTestId("selected")).toHaveTextContent("Satellit");

    setOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("selected")).toHaveTextContent("Basiskarte");
  });

  it("marks only the satellite style as needing swisstopo", () => {
    expect(MapStyles.filter((s) => s.onlineOnly).map((s) => s.name)).toEqual(["Satellit"]);
  });
});
