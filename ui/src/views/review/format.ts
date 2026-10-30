import dayjs from "dayjs";
import { formatDuration } from "utils/duration";

/** The share as a whole percent. Never rounds up to 100 while a message is still missing. */
export function percent(ratio: number): number {
  return ratio >= 1 ? 100 : Math.floor(ratio * 100);
}

/** The width of a chart bucket as people say it: "15 min", "2 h". */
export function bucketLabel(
  seconds: number,
  t: (key: string, options: { count: number }) => string,
): string {
  return seconds >= 3600
    ? t("review.bucketHours", { count: Math.round(seconds / 3600) })
    : t("review.bucketMinutes", { count: Math.round(seconds / 60) });
}

/**
 * A point in time on a chart: just the clock time while the chart stays within a day, with the
 * date once it spans several, and only the date for buckets of a day.
 */
export function chartTime(time: Date, bucketSeconds: number, spansDays: boolean): string {
  if (bucketSeconds >= 86400) return dayjs(time).format("DD.MM.");

  return dayjs(time).format(spansDays ? "DD.MM. HH:mm" : "HH:mm");
}

/** Whether the buckets of a chart reach into more than one calendar day. */
export function spansDays(starts: Date[]): boolean {
  return starts.length > 1 && !dayjs(starts[0]).isSame(starts[starts.length - 1], "day");
}

function unit(seconds: number): "s" | "min" | "h" {
  if (seconds < 60) return "s";

  return seconds < 3600 ? "min" : "h";
}

function amount(seconds: number): number {
  const divisor = { s: 1, min: 60, h: 3600 }[unit(seconds)];

  return Math.round(seconds / divisor);
}

/**
 * The range of a histogram bar: "< 30 s", "30 s–1 min", "1–2 min", "> 2 h". The unit is only
 * written once when both ends have it.
 */
export function rangeLabel(from: number, to: number | null): string {
  if (to === null) return `> ${formatDuration(from)}`;
  if (from === 0) return `< ${formatDuration(to)}`;

  return unit(from) === unit(to)
    ? `${amount(from)}–${formatDuration(to)}`
    : `${formatDuration(from)}–${formatDuration(to)}`;
}
