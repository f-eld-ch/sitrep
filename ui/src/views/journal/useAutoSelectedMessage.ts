import { useCallback, useState } from "react";

export interface AutoSelectedMessage {
  /** The message to show: an explicit choice, else the locked default. */
  effectiveId: string | undefined;
  /** True once the user picked a message themselves (as opposed to the automatic default). */
  isExplicit: boolean;
  /** Pick a message explicitly, or pass undefined to fall back to the automatic default. */
  select: (id: string | undefined) => void;
  /**
   * The message was dealt with. Drops the current selection so the default moves on to the
   * next candidate, and keeps the stale cache from re-selecting this one before the
   * mutation's result lands.
   */
  handled: (id: string) => void;
}

/**
 * Selects a message automatically — the oldest one still needing attention — and keeps that
 * choice stable while the message list is polled.
 *
 * `defaultId` is the current candidate (e.g. the oldest undrawn message). The first one that
 * resolves while nothing is selected gets locked in, so a polling cycle that delivers an older
 * message does not silently switch the view under the operator.
 */
export function useAutoSelectedMessage(defaultId: string | undefined): AutoSelectedMessage {
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [lockedId, setLockedId] = useState<string | undefined>();
  const [handledId, setHandledId] = useState<string | undefined>();
  const [prevSelectedId, setPrevSelectedId] = useState<string | undefined>();
  const [prevDefaultId, setPrevDefaultId] = useState<string | undefined>();

  // Derived-state pattern: setState during render re-renders immediately, before paint.
  if (selectedId !== prevSelectedId || defaultId !== prevDefaultId) {
    setPrevSelectedId(selectedId);
    setPrevDefaultId(defaultId);

    if (selectedId !== undefined) {
      // An explicit choice replaces the lock, so a later reset picks a fresh default.
      if (lockedId !== undefined) setLockedId(undefined);
      if (handledId !== undefined) setHandledId(undefined);
    }
  }

  // A message only needs to be kept out of the running while the cache still reports it as the
  // candidate. Once the candidate has moved on it may become one again (its acknowledgement
  // revoked, or the message corrected), and then it is selected like any other.
  if (handledId !== undefined && defaultId !== handledId) {
    setHandledId(undefined);
  }

  // With nothing chosen or locked, the candidate is locked in. Checked on every render, not only
  // when the candidate changes: handling a message can find the candidate already advanced (the
  // mutation's result reaches the cache before the caller gets to say it is handled).
  if (
    selectedId === undefined &&
    lockedId === undefined &&
    defaultId !== undefined &&
    defaultId !== handledId
  ) {
    setLockedId(defaultId);
  }

  const select = useCallback((id: string | undefined) => setSelectedId(id), []);
  const handled = useCallback((id: string) => {
    setHandledId(id);
    setLockedId(undefined);
    setSelectedId(undefined);
  }, []);

  return {
    effectiveId: selectedId ?? lockedId,
    isExplicit: selectedId !== undefined,
    select,
    handled,
  };
}
