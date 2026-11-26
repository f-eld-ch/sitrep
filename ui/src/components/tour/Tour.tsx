import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { driver, type Alignment, type Driver, type DriveStep, type Side } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

// The tour is being rolled out; remove the flag once it is released to everyone.
export const TOUR_FLAG = "ui-tour";

export const STORAGE_KEY = "sitrep.tour.completed";

/** How often, and how many times, an auto-starting tour looks for its page's first element. */
const WAIT_INTERVAL_MS = 250;
const WAIT_ATTEMPTS = 40;

export interface TourStep {
  /** CSS selector of the element to highlight. Without one, the popover sits in the middle. */
  element?: string;
  title: string;
  description: string;
  side?: Side;
  align?: Alignment;
}

interface RegisteredTour {
  id: string;
  getSteps: () => TourStep[];
}

interface TourContextValue {
  enabled: boolean;
  register: (tour: RegisteredTour) => () => void;
  start: (id?: string) => void;
  /** The tour of the page on screen, if it has one. */
  currentTourId: string | null;
}

// Without a provider (a component rendered on its own, as in a test) there is simply no tour.
const TourContext = createContext<TourContextValue>({
  enabled: false,
  register: () => () => {},
  start: () => {},
  currentTourId: null,
});

export function readCompleted(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function markCompleted(id: string) {
  try {
    const completed = readCompleted();
    if (!completed.includes(id)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed, id]));
    }
  } catch {
    // No storage (a private window, say): the tour then shows again on the next visit.
  }
}

/**
 * The first element matching the selector that is on screen. The navbar renders its items twice
 * (desktop and mobile), and a page leaves out what it has no data for.
 */
export function findVisible(selector: string): Element | undefined {
  for (const element of document.querySelectorAll(selector)) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return element;
  }
  return undefined;
}

/** The steps that can be shown right now, each bound to its element; the others are skipped. */
export function resolveSteps(steps: TourStep[]): DriveStep[] {
  return steps.flatMap((step) => {
    const element = step.element === undefined ? undefined : findVisible(step.element);
    if (step.element !== undefined && element === undefined) return [];
    return [
      {
        element,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
        },
      },
    ];
  });
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const enabled = useBooleanFlagValue(TOUR_FLAG, false);
  const tours = useRef<RegisteredTour[]>([]);
  const active = useRef<{ id: string; driver: Driver } | undefined>(undefined);
  const [currentTourId, setCurrentTourId] = useState<string | null>(null);

  const register = useCallback((tour: RegisteredTour) => {
    tours.current = [...tours.current.filter((other) => other.id !== tour.id), tour];
    setCurrentTourId(tour.id);

    return () => {
      // Leaving the page (with the browser's back button, say) ends its tour.
      if (active.current?.id === tour.id) active.current.driver.destroy();
      tours.current = tours.current.filter((other) => other !== tour);
      setCurrentTourId(tours.current.at(-1)?.id ?? null);
    };
  }, []);

  const start = useCallback(
    (id?: string) => {
      if (!enabled) return;
      const tour =
        id === undefined ? tours.current.at(-1) : tours.current.find((other) => other.id === id);
      if (!tour) return;

      const steps = resolveSteps(tour.getSteps());
      if (steps.length === 0) return;

      active.current?.driver.destroy();
      const instance = driver({
        steps,
        showProgress: true,
        // The placeholders are passed through for driver.js to fill in, not i18next.
        progressText: t("tour.progress", { current: "{{current}}", total: "{{total}}" }),
        nextBtnText: t("tour.next"),
        prevBtnText: t("tour.previous"),
        doneBtnText: t("tour.done"),
        closeBtnLabel: t("tour.close"),
        popoverClass: "sitrep-tour",
        stagePadding: 4,
        stageRadius: 6,
        // A tour closed early counts as seen: whoever skips it is not asked again on every visit.
        onDestroyed: () => {
          markCompleted(tour.id);
          if (active.current?.driver === instance) active.current = undefined;
        },
      });
      active.current = { id: tour.id, driver: instance };
      instance.drive();
    },
    [enabled, t],
  );

  useEffect(() => () => active.current?.driver.destroy(), []);

  const value = useMemo(
    () => ({ enabled, register, start, currentTourId: enabled ? currentTourId : null }),
    [enabled, register, start, currentTourId],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTourControls() {
  return useContext(TourContext);
}

/**
 * Gives the page a tour. It starts by itself on the first visit, once the first element it
 * highlights is on screen (pages render theirs after loading, the map later still), and the
 * navbar's help button starts it again. `null` as id means no tour, as hooks cannot be skipped.
 */
export function useTour(id: string | null, steps: TourStep[]) {
  const { enabled, register, start } = useTourControls();

  // The latest steps (translated, and depending on the page's data) without registering anew.
  const stepsRef = useRef(steps);
  useLayoutEffect(() => {
    stepsRef.current = steps;
  });

  useEffect(() => {
    if (id === null) return;
    return register({ id, getSteps: () => stepsRef.current });
  }, [id, register]);

  useEffect(() => {
    if (id === null || !enabled || readCompleted().includes(id)) return;

    const anchor = stepsRef.current.find((step) => step.element !== undefined)?.element;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const ready = anchor === undefined || findVisible(anchor) !== undefined;
      if (ready || attempts >= WAIT_ATTEMPTS) {
        window.clearInterval(timer);
        if (ready) start(id);
      }
    }, WAIT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [id, enabled, start]);
}
