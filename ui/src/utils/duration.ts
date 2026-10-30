/**
 * A duration for people to read: "45 s", "4 min 12 s", "1 h 5 min". Whole seconds, and no unit
 * that is zero except when nothing is left ("0 s").
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return secs > 0 ? `${minutes} min ${secs} s` : `${minutes} min`;

  return `${secs} s`;
}
