import { useBooleanFlagValue } from "@openfeature/react-sdk";

/** The feature flag of the searchable symbol picker (see ui/features.yaml). */
export const ICON_PICKER_FLAG = "icon-picker-v2";

/**
 * Whether the searchable symbol picker is on.
 *
 * In development the flag service is out of reach, so `localStorage["icon-picker-v2"] = "1"`
 * turns it on there. The override is compiled out of production builds.
 */
export function useIconPickerV2(): boolean {
  const flag = useBooleanFlagValue(ICON_PICKER_FLAG, false);

  return flag || devOverride();
}

function devOverride(): boolean {
  if (!import.meta.env.DEV) return false;

  try {
    return window.localStorage.getItem(ICON_PICKER_FLAG) === "1";
  } catch {
    return false;
  }
}
