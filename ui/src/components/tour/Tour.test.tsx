import { act, fireEvent, render, screen } from "@testing-library/react";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { driver } from "driver.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  TOUR_FLAG,
  TourProvider,
  markCompleted,
  readCompleted,
  resolveSteps,
  useTour,
  useTourControls,
  type TourStep,
} from "./Tour";

vi.mock("@openfeature/react-sdk", () => ({ useBooleanFlagValue: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const drive = vi.fn();
const destroy = vi.fn();
vi.mock("driver.js", () => ({ driver: vi.fn(() => ({ drive, destroy })) }));

// jsdom lays nothing out, so every element measures 0×0. Elements marked data-visible count as
// rendered, the others as hidden (like the navbar's desktop items on a phone).
function measureVisibleOnly() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const size = this.hasAttribute("data-visible") ? 10 : 0;
    return { width: size, height: size } as DOMRect;
  });
}

const steps: TourStep[] = [
  { title: "Welcome", description: "intro" },
  { element: '[data-tour="shown"]', title: "Shown", description: "on screen" },
  { element: '[data-tour="hidden"]', title: "Hidden", description: "not on screen" },
];

function Page({ id = "page" }: { id?: string }) {
  useTour(id, steps);
  return (
    <>
      <div data-tour="shown" data-visible />
      <div data-tour="hidden" />
    </>
  );
}

function HelpButton() {
  const { currentTourId, start } = useTourControls();
  if (!currentTourId) return null;
  return (
    <button type="button" onClick={() => start()}>
      help
    </button>
  );
}

describe("tour", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(useBooleanFlagValue).mockReturnValue(true);
    vi.mocked(driver).mockClear();
    drive.mockClear();
    destroy.mockClear();
    measureVisibleOnly();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("remembers the tours that were seen", () => {
    expect(readCompleted()).toEqual([]);
    markCompleted("a");
    markCompleted("a");
    markCompleted("b");
    expect(readCompleted()).toEqual(["a", "b"]);
  });

  it("treats unreadable storage as no tour seen", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readCompleted()).toEqual([]);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 1 }));
    expect(readCompleted()).toEqual([]);
  });

  it("skips the steps whose element is not on screen", () => {
    render(<Page />);
    const resolved = resolveSteps(steps);
    expect(resolved.map((step) => step.popover?.title)).toEqual(["Welcome", "Shown"]);
    expect(resolved[0].element).toBeUndefined();
    expect(resolved[1].element).toBe(document.querySelector('[data-tour="shown"]'));
  });

  it("starts by itself on the first visit and is then marked as seen", () => {
    vi.useFakeTimers();
    render(
      <TourProvider>
        <Page />
      </TourProvider>,
    );
    act(() => vi.advanceTimersByTime(500));

    expect(useBooleanFlagValue).toHaveBeenCalledWith(TOUR_FLAG, false);
    expect(drive).toHaveBeenCalledTimes(1);
    const config = vi.mocked(driver).mock.calls[0][0];
    expect(config?.steps).toHaveLength(2);
    expect(config?.progressText).toBe("tour.progress");

    act(() => config?.onDestroyed?.(undefined, {} as never, {} as never));
    expect(readCompleted()).toEqual(["page"]);
  });

  it("does not start by itself once seen, but the help button starts it again", () => {
    vi.useFakeTimers();
    markCompleted("page");
    render(
      <TourProvider>
        <HelpButton />
        <Page />
      </TourProvider>,
    );
    act(() => vi.advanceTimersByTime(15_000));
    expect(drive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "help" }));
    expect(drive).toHaveBeenCalledTimes(1);
  });

  it("waits for the page to render its first element", () => {
    vi.useFakeTimers();
    function LatePage() {
      useTour("late", steps);
      return <div data-tour="shown" />;
    }
    render(
      <TourProvider>
        <LatePage />
      </TourProvider>,
    );
    act(() => vi.advanceTimersByTime(1_000));
    expect(drive).not.toHaveBeenCalled();

    act(() => document.querySelector('[data-tour="shown"]')?.setAttribute("data-visible", ""));
    act(() => vi.advanceTimersByTime(250));
    expect(drive).toHaveBeenCalledTimes(1);
  });

  it("shows nothing while the flag is off", () => {
    vi.useFakeTimers();
    vi.mocked(useBooleanFlagValue).mockReturnValue(false);
    render(
      <TourProvider>
        <HelpButton />
        <Page />
      </TourProvider>,
    );
    act(() => vi.advanceTimersByTime(15_000));

    expect(drive).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "help" })).not.toBeInTheDocument();
  });

  it("offers the help button only on a page with a tour", () => {
    const { rerender } = render(
      <TourProvider>
        <HelpButton />
      </TourProvider>,
    );
    expect(screen.queryByRole("button", { name: "help" })).not.toBeInTheDocument();

    rerender(
      <TourProvider>
        <HelpButton />
        <Page />
      </TourProvider>,
    );
    expect(screen.getByRole("button", { name: "help" })).toBeInTheDocument();
  });

  it("ends the tour when its page is left", () => {
    markCompleted("page");
    const { rerender } = render(
      <TourProvider>
        <HelpButton />
        <Page />
      </TourProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "help" }));
    expect(drive).toHaveBeenCalledTimes(1);

    rerender(
      <TourProvider>
        <HelpButton />
      </TourProvider>,
    );
    expect(destroy).toHaveBeenCalled();
  });
});
