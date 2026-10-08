import { useFeatureMessages } from "api";

/**
 * The ids of the messages a map feature was drawn for, to filter a message stack with.
 *
 * Undefined while nothing is selected, while the answer is still loading, and for a feature
 * without any message (freely drawn): in all of these the stack should stay as it is rather
 * than go empty.
 */
export function useFeatureMessageIds(featureId: string | undefined): string[] | undefined {
  const result = useFeatureMessages(featureId);

  if (featureId === undefined || result.status !== "ready" || result.data.messages.length === 0) {
    return undefined;
  }

  return result.data.messages.map((message) => message.id);
}
