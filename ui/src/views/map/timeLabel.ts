import dayjs from "dayjs";

/**
 * The time a drawing first appeared, as it is written on the map: the clock time alone when it
 * is on the same day as the point the map is showing, with the date when it is not.
 */
export function formatTimeLabel(placedAt: Date, reference: Date): string {
  const at = dayjs(placedAt);

  return at.format(at.isSame(reference, "day") ? "HH:mm" : "DD.MM.YYYY HH:mm");
}
