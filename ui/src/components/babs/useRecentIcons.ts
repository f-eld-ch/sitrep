import { type BabsIconId, isBabsIconId } from "@f-eld-ch/babs-core";
import { useCallback, useMemo } from "react";
import { useLocalStorage } from "usehooks-ts";
import { isPickableIcon } from "./excludedIcons";

const STORAGE_KEY = "sitrep.recentIcons";
export const MAX_RECENT_ICONS = 8;

/**
 * The symbols this browser placed last, most recent first. Kept in localStorage: what somebody
 * reaches for again is personal, and needs no server.
 *
 * What is stored is not trusted: a value written by an older build, or edited by hand, is
 * filtered down to symbols the picker offers.
 */
export function useRecentIcons(): {
  recent: BabsIconId[];
  remember: (id: BabsIconId) => void;
} {
  const [stored, setStored] = useLocalStorage<unknown>(STORAGE_KEY, []);

  const recent = useMemo(
    () =>
      (Array.isArray(stored) ? stored : [])
        .filter((id): id is BabsIconId => typeof id === "string" && isBabsIconId(id))
        .filter(isPickableIcon)
        .slice(0, MAX_RECENT_ICONS),
    [stored],
  );

  const remember = useCallback(
    (id: BabsIconId) => {
      setStored((previous: unknown) => {
        const others = (Array.isArray(previous) ? previous : []).filter((x) => x !== id);

        return [id, ...others].slice(0, MAX_RECENT_ICONS);
      });
    },
    [setStored],
  );

  return { recent, remember };
}
