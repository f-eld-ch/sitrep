import {
  faBackwardStep,
  faClockRotateLeft,
  faForwardStep,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import dayjs from "dayjs";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { neighbourTick, thinTicks, timelineBounds, timelinePercent } from "../timeline";

const MINUTE = 60_000;
const MIN_TICK_GAP_PERCENT = 1.5;
const CLOCK_REFRESH_MS = 30_000;

/** The wall clock; event handlers read it when they run, never during render. */
const currentTime = () => Date.now();

export interface TimelineSliderProps {
  /** The point in time shown; undefined means live. */
  asOf: Date | undefined;
  onAsOfChange: (asOf: Date | undefined) => void;
  /** Where the slider starts (the incident's start); times of ticks extend it if earlier. */
  start?: Date;
  /** Times to put ticks at and to step between (message times). */
  tickTimes: number[];
  /** Extra content on the right of the label row, e.g. options that only make sense while live. */
  footerExtra?: ReactNode;
  className?: string;
}

/**
 * A slider along the incident timeline, from its start to now, with a tick for each of the given
 * times. Dragging it moves the point in time once it is released; the step buttons jump between
 * the ticks, and "Live" returns to the present. It only reports the chosen point in time: what
 * that changes (map, resources, messages) is up to the screen.
 */
export function TimelineSlider({
  asOf,
  onAsOfChange,
  start,
  tickTimes,
  footerExtra,
  className,
}: TimelineSliderProps) {
  const { t } = useTranslation();
  // The slider position while it is being dragged; the view only follows once it is released.
  const [draft, setDraft] = useState<number | undefined>();
  // Taken when the slider mounts and when the user goes live, not on every render.
  const [now, setNow] = useState(() => currentTime());
  const live = asOf === undefined;

  // While live the end of the slider follows the clock.
  useEffect(() => {
    if (!live) return;

    const timer = setInterval(() => setNow(currentTime()), CLOCK_REFRESH_MS);

    return () => clearInterval(timer);
  }, [live]);

  const bounds = timelineBounds([...(start ? [start.getTime()] : []), ...tickTimes], now);
  const ticks = thinTicks(tickTimes, bounds, MIN_TICK_GAP_PERCENT);
  const position = draft ?? asOf?.getTime() ?? bounds.max;

  const commit = () => {
    if (draft === undefined) return;
    onAsOfChange(draft >= bounds.max ? undefined : new Date(draft));
    setDraft(undefined);
  };
  const goLive = (clock: number) => {
    setNow(clock);
    onAsOfChange(undefined);
    setDraft(undefined);
  };
  const step = (direction: 1 | -1, clock: number) => {
    const target = neighbourTick(tickTimes, position, direction);
    if (target === undefined) {
      if (direction === 1) goLive(clock);
      return;
    }

    onAsOfChange(new Date(target));
  };

  const canScrub = bounds.max > bounds.min;
  const hasPrevious = neighbourTick(tickTimes, position, -1) !== undefined;
  const hasNext = !live;

  return (
    <div
      className={clsx(
        "flex w-full flex-col gap-1.5 rounded-lg border border-border bg-bg/95 px-3 py-2 text-xs text-fg shadow-lg backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded p-1 text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          aria-label={t("mapTimeline.previous")}
          title={t("mapTimeline.previous")}
          disabled={!canScrub || !hasPrevious}
          onClick={() => step(-1, currentTime())}
        >
          <FontAwesomeIcon icon={faBackwardStep} />
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            type="range"
            className="block w-full"
            aria-label={t("mapTimeline.slider")}
            min={bounds.min}
            max={bounds.max}
            step={MINUTE}
            value={Math.min(Math.max(position, bounds.min), bounds.max)}
            disabled={!canScrub}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
          <div className="pointer-events-none relative mt-0.5 h-2" aria-hidden>
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute top-0 h-2 w-px bg-primary/60"
                style={{ left: `${timelinePercent(tick, bounds)}%` }}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          className="rounded p-1 text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          aria-label={t("mapTimeline.next")}
          title={t("mapTimeline.next")}
          disabled={!hasNext}
          onClick={() => step(1, currentTime())}
        >
          <FontAwesomeIcon icon={faForwardStep} />
        </button>
        <button
          type="button"
          aria-pressed={live}
          disabled={live}
          onClick={() => goLive(currentTime())}
          className={clsx(
            "rounded-full border px-2.5 py-0.5 font-semibold transition-colors",
            live
              ? "border-transparent bg-success/15 text-success"
              : "border-border text-fg-muted hover:text-fg",
          )}
        >
          {t("mapTimeline.live")}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 text-fg-muted">
        <span className={clsx("flex items-center gap-1.5", !live && "font-semibold text-warning")}>
          {!live && <FontAwesomeIcon icon={faClockRotateLeft} />}
          {live
            ? t("mapTimeline.live")
            : t("mapTimeline.asOf", { time: dayjs(position).format("DD.MM.YY HH:mm") })}
        </span>
        {footerExtra}
      </div>
    </div>
  );
}

/** The point in time a datetime-local input shows, and the latest it may be set to. */
export const toLocalInput = (d: Date) => dayjs(d).format("YYYY-MM-DDTHH:mm");
