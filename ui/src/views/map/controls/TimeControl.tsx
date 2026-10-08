import {
  faBackwardStep,
  faClockRotateLeft,
  faForwardStep,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import dayjs from "dayjs";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useIncidentMessages } from "api/message";
import { IncidentContext } from "utils";
import { MapTimeContext } from "../MapTimeContext";
import { neighbourTick, thinTicks, timelineBounds, timelinePercent } from "../timeline";

const MINUTE = 60_000;

/** The wall clock; event handlers read it when they run, never during render. */
const currentTime = () => Date.now();
const MIN_TICK_GAP_PERCENT = 1.5;

/** Value for a datetime-local input, in the browser's local time. */
const toLocalInput = (d: Date) => dayjs(d).format("YYYY-MM-DDTHH:mm");

/**
 * Replays the map along the incident timeline. The slider runs from the start of the incident
 * to now, with a tick for every message drawn on the Nachrichtenkarte; stepping between ticks
 * shows the map as it was after each message. Away from "Live" the map is view-only.
 *
 * While live, free drawing can optionally take effect at a chosen past time instead of now.
 */
export function TimeControl() {
  const { t } = useTranslation();
  const { incidentId } = useParams();
  const { state: incidentState } = useContext(IncidentContext);
  const { asOf, setAsOf, drawAt, setDrawAt } = useContext(MapTimeContext);
  const messages = useIncidentMessages(incidentId ?? "");
  // The slider position while it is being dragged; the map only follows once it is released.
  const [draft, setDraft] = useState<number | undefined>();
  // Taken when the control mounts and when the user goes live, not on every render.
  const [now, setNow] = useState(() => currentTime());
  const live = asOf === undefined;

  // While live the end of the slider follows the clock.
  useEffect(() => {
    if (!live) return;

    const timer = setInterval(() => setNow(currentTime()), 30_000);

    return () => clearInterval(timer);
  }, [live]);

  if (!setAsOf) return null;

  const mapDivision =
    messages.status === "ready"
      ? messages.data.incidentDivisions.find((d) => d.kind === "MESSAGE_MAP")
      : undefined;
  const messageTimes =
    messages.status === "ready" && mapDivision
      ? messages.data.messages
          .filter((m) => m.divisions.some((d) => d.division.id === mapDivision.id))
          .map((m) => m.time.getTime())
      : [];

  const incidentStart = incidentState.incident?.createdAt?.getTime();
  const bounds = timelineBounds(
    [...(incidentStart === undefined ? [] : [incidentStart]), ...messageTimes],
    now,
  );
  const ticks = thinTicks(messageTimes, bounds, MIN_TICK_GAP_PERCENT);
  const position = draft ?? asOf?.getTime() ?? bounds.max;

  const commit = () => {
    if (draft === undefined) return;
    setAsOf(draft >= bounds.max ? undefined : new Date(draft));
    setDraft(undefined);
  };
  const goLive = (clock: number) => {
    setNow(clock);
    setAsOf(undefined);
    setDraft(undefined);
  };
  const step = (direction: 1 | -1, clock: number) => {
    const target = neighbourTick(messageTimes, position, direction);
    if (target === undefined) {
      if (direction === 1) goLive(clock);
      return;
    }

    setAsOf(new Date(target));
  };

  const canScrub = bounds.max > bounds.min;
  const hasPrevious = neighbourTick(messageTimes, position, -1) !== undefined;
  const hasNext = !live;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-9 z-10 flex justify-center px-2">
      <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-1.5 rounded-lg border border-border bg-bg/95 px-3 py-2 text-xs text-fg shadow-lg backdrop-blur">
        {!live && (
          <p className="flex items-center gap-1.5 font-semibold text-warning">
            <FontAwesomeIcon icon={faClockRotateLeft} />
            {t("mapTimeline.viewOnly")}
          </p>
        )}
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
          <span>
            {live
              ? t("mapTimeline.live")
              : t("mapTimeline.asOf", { time: dayjs(position).format("DD.MM.YY HH:mm") })}
          </span>
          {live && setDrawAt && (
            <label className="flex items-center gap-1.5" title={t("mapTimeline.drawAtHint")}>
              <input
                type="checkbox"
                checked={drawAt !== undefined}
                onChange={(e) => setDrawAt(e.target.checked ? new Date(now) : undefined)}
              />
              {t("mapTimeline.drawAt")}
              {drawAt !== undefined && (
                <input
                  type="datetime-local"
                  aria-label={t("mapTimeline.drawAtInput")}
                  className="rounded border border-border bg-bg px-1 py-0.5 text-fg"
                  min={toLocalInput(new Date(bounds.min))}
                  max={toLocalInput(new Date(now))}
                  value={toLocalInput(drawAt)}
                  onChange={(e) => {
                    const picked = new Date(e.target.value);
                    if (!Number.isNaN(picked.getTime()) && picked.getTime() <= now)
                      setDrawAt(picked);
                  }}
                />
              )}
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
