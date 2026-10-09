import { useState } from "react";
import { useParams } from "react-router";
import { useIncidentMessages } from "api/message";
import { FilterableMessageStack } from "views/journal/FilterableMessageStack";
import { Map as IncidentMap } from "./index";
import { useFeatureMessageIds } from "./useFeatureMessageIds";

/** How often the messages are refreshed while the side stack is open. */
const SIDE_STACK_POLL_MS = 30_000;

/**
 * The Lagebild: the full-page map. Clicking a feature opens a message stack beside the map with
 * the messages that feature was drawn for; deselecting it (empty map, Escape, or the filter chip)
 * closes the stack again. Features without messages (freely drawn) open nothing.
 */
export default function LagebildView() {
  const { incidentId } = useParams();
  const [featureId, setFeatureId] = useState<string | undefined>();
  const [deselectToken, setDeselectToken] = useState(0);
  const [selectedMessageId, setSelectedMessageId] = useState<string | undefined>();
  // The point in time the map's slider shows; undefined is live.
  const [asOf, setAsOf] = useState<Date | undefined>();
  const messageIds = useFeatureMessageIds(featureId);
  const open = messageIds !== undefined;
  // The journal is only needed once there is a feature with messages to show.
  const messages = useIncidentMessages(incidentId ?? "", {
    skip: !open,
    pollInterval: SIDE_STACK_POLL_MS,
  });

  // Messages that existed at the shown point in time; later ones appear as the slider moves on.
  const shownMessages = (messages.status === "ready" ? messages.data.messages : []).filter(
    (message) => asOf === undefined || message.time.getTime() <= asOf.getTime(),
  );

  // The feature's messages, and the one shown in full in the stack: the one picked, or the only
  // one there is.
  const focused = messageIds
    ? shownMessages.filter((message) => messageIds.includes(message.id))
    : [];
  const effectiveId = focused.some((message) => message.id === selectedMessageId)
    ? selectedMessageId
    : focused.length === 1
      ? focused[0].id
      : undefined;

  return (
    <div className="relative flex grow">
      {open && (
        // Over the map, not beside it: the map keeps its size when the stack comes and goes, so it
        // does not resize and redraw. As tall as its messages need, centred, and never so tall that
        // it runs into the map's own controls.
        <aside className="absolute top-1/2 left-2 z-10 flex max-h-[calc(100%-14rem)] min-h-0 w-[26rem] -translate-y-1/2 flex-col overflow-hidden rounded border border-border bg-bg shadow-lg">
          <FilterableMessageStack
            messages={shownMessages}
            focusMessageIds={messageIds}
            onClearFocus={() => {
              setFeatureId(undefined);
              setDeselectToken((token) => token + 1);
            }}
            effectiveId={effectiveId}
            onSelect={setSelectedMessageId}
            expandSelected
            className="min-h-0"
          />
        </aside>
      )}
      <IncidentMap
        onFeatureSelect={setFeatureId}
        deselectToken={deselectToken}
        onTimeChange={setAsOf}
      />
    </div>
  );
}
