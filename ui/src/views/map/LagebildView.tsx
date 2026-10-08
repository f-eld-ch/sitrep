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
  const messageIds = useFeatureMessageIds(featureId);
  const open = messageIds !== undefined;
  // The journal is only needed once there is a feature with messages to show.
  const messages = useIncidentMessages(incidentId ?? "", {
    skip: !open,
    pollInterval: SIDE_STACK_POLL_MS,
  });

  return (
    <div className="flex grow">
      {open && (
        <aside className="mt-[2.75rem] flex w-[22rem] shrink-0 flex-col border-r border-border bg-bg">
          <FilterableMessageStack
            messages={messages.status === "ready" ? messages.data.messages : []}
            focusMessageIds={messageIds}
            onClearFocus={() => {
              setFeatureId(undefined);
              setDeselectToken((token) => token + 1);
            }}
            effectiveId={selectedMessageId}
            onSelect={setSelectedMessageId}
            className="min-h-0 flex-1"
          />
        </aside>
      )}
      <IncidentMap onFeatureSelect={setFeatureId} deselectToken={deselectToken} />
    </div>
  );
}
