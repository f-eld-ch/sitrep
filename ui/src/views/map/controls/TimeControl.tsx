import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { useIncidentMessages } from "api/message";
import { IncidentContext } from "utils";
import { MapTimeContext } from "../MapTimeContext";
import { TimelineSlider, toLocalInput } from "./TimelineSlider";

/** Only the message times matter here, and they change slowly: no need to follow the 5 s journal poll. */
const TICK_REFRESH_MS = 60_000;

/** The wall clock; event handlers read it when they run, never during render. */
const currentTime = () => Date.now();

/**
 * Replays the map along the incident timeline, as an overlay at the bottom of the map. The
 * slider has a tick for every message drawn on the Nachrichtenkarte; stepping between ticks
 * shows the map as it was after each message. Away from "Live" the map is view-only.
 *
 * While live, free drawing can optionally take effect at a chosen past time instead of now.
 */
export function TimeControl() {
  const { t } = useTranslation();
  const { incidentId } = useParams();
  const { state: incidentState } = useContext(IncidentContext);
  const { asOf, setAsOf, drawAt, setDrawAt } = useContext(MapTimeContext);
  const messages = useIncidentMessages(incidentId ?? "", { pollInterval: TICK_REFRESH_MS });
  // Taken when the control mounts, for the latest time free drawing may be set to.
  const [now] = useState(() => currentTime());

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
  const live = asOf === undefined;
  const start = incidentState.incident?.createdAt;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-9 z-10 flex justify-center px-2">
      <TimelineSlider
        className="pointer-events-auto max-w-2xl"
        asOf={asOf}
        onAsOfChange={setAsOf}
        start={start}
        tickTimes={messageTimes}
        footerExtra={
          live && setDrawAt ? (
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
                  min={start ? toLocalInput(start) : undefined}
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
          ) : undefined
        }
      />
    </div>
  );
}
