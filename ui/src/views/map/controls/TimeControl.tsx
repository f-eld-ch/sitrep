import { useContext, useState } from "react";
import { useParams } from "react-router";
import { useIncidentMessages } from "api/message";
import { IncidentContext } from "utils";
import { MapTimeContext } from "../MapTimeContext";
import { TimelineSlider } from "./TimelineSlider";

/** Only the message times matter here, and they change slowly: no need to follow the 5 s journal poll. */
const TICK_REFRESH_MS = 60_000;

/** The wall clock; event handlers read it when they run, never during render. */
const currentTime = () => Date.now();

/**
 * Replays the map along the incident timeline, as an overlay at the bottom of the map. The
 * slider has a tick for every message drawn on the Nachrichtenkarte; stepping between ticks
 * shows the map as it was after each message. Away from "Live" the map is view-only.
 */
export function TimeControl() {
  const { incidentId } = useParams();
  const { state: incidentState } = useContext(IncidentContext);
  const { asOf, setAsOf } = useContext(MapTimeContext);
  const messages = useIncidentMessages(incidentId ?? "", { pollInterval: TICK_REFRESH_MS });
  // Taken when the control mounts; only used when the incident has no start time yet.
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
  // Messages carry the time of the event they report, which can precede the incident's record
  // (recorded late), so the slider starts at the earliest of all of them.
  const allMessageTimes =
    messages.status === "ready" ? messages.data.messages.map((m) => m.time.getTime()) : [];
  const createdAt = incidentState.incident?.createdAt;
  const start = new Date(
    Math.min(...allMessageTimes, ...(createdAt ? [createdAt.getTime()] : [now])),
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-9 z-10 flex justify-center px-2">
      <TimelineSlider
        className="pointer-events-auto max-w-2xl"
        asOf={asOf}
        onAsOfChange={setAsOf}
        start={start}
        tickTimes={messageTimes}
      />
    </div>
  );
}
