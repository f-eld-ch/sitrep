/** Helpers for the map timeline slider. All times are epoch milliseconds. */

export interface TimelineBounds {
  min: number;
  max: number;
}

/**
 * The slider's range: from the earliest known point of the incident to now. Without any start
 * candidate the range is a single point at `now`, which the slider treats as "nothing to scrub".
 */
export function timelineBounds(startCandidates: number[], now: number): TimelineBounds {
  const valid = startCandidates.filter((t) => Number.isFinite(t) && t <= now);

  return { min: valid.length > 0 ? Math.min(...valid) : now, max: now };
}

/** Position of a time on the slider as a percentage, clamped to the range. */
export function timelinePercent(time: number, bounds: TimelineBounds): number {
  const span = bounds.max - bounds.min;
  if (span <= 0) return 100;

  return Math.min(100, Math.max(0, ((time - bounds.min) / span) * 100));
}

/**
 * The tick before or after `current`, or undefined when there is none in that direction.
 * `current` itself is never returned, so repeated calls walk through the ticks.
 */
export function neighbourTick(
  ticks: number[],
  current: number,
  direction: 1 | -1,
): number | undefined {
  const sorted = [...new Set(ticks)].sort((a, b) => a - b);

  return direction === 1
    ? sorted.find((t) => t > current)
    : sorted.reverse().find((t) => t < current);
}

/** Merges nearby ticks so a burst of messages does not draw an unreadable comb. */
export function thinTicks(
  ticks: number[],
  bounds: TimelineBounds,
  minPercentGap: number,
): number[] {
  const sorted = [...new Set(ticks)].sort((a, b) => a - b);
  const kept: number[] = [];

  for (const tick of sorted) {
    const last = kept[kept.length - 1];
    if (
      last === undefined ||
      timelinePercent(tick, bounds) - timelinePercent(last, bounds) >= minPercentGap
    ) {
      kept.push(tick);
    }
  }

  return kept;
}
