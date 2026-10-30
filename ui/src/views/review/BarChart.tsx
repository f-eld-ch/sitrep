import { clsx } from "clsx";

export interface Bar {
  /** Where the bar is on the time axis, e.g. "09:15". */
  label: string;
  value: number;
}

/** The height of the plot: shorter on paper, where a page holds more than a screen. */
const PLOT_HEIGHT = "h-32 print:h-20";

/** About this many gridlines, including the baseline. */
const TARGET_INTERVALS = 4;

/**
 * Round tick values for counts: from 0 up to a round number at or above the highest bar, in whole
 * steps of 1, 2, 5, 10, 20, 50, …
 */
export function niceTicks(max: number): number[] {
  const highest = Math.max(1, max);
  const raw = highest / TARGET_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 1);
  const top = Math.ceil(highest / step) * step;

  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** Positions on the time axis that get a label: the ends and the quarters in between. */
function labelIndices(count: number): number[] {
  if (count === 0) return [];

  const last = count - 1;

  return [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * last)))];
}

/**
 * Bars over time, one chart for one measure, with a labelled y axis and light gridlines. Thin bars
 * with rounded tops on a common baseline and a gap between them; the numbers are in the tooltip of
 * each bar and in the table the page offers next to the chart.
 */
export function BarChart({
  bars,
  caption,
  className,
  labels = "ends",
}: {
  bars: Bar[];
  /** What the chart shows, read out in place of the picture. */
  caption: string;
  className?: string;
  /**
   * "ends": the first and last bar and the quarters in between, for a time axis with many bars.
   * "alternate": every other bar, for a few categories whose labels are too wide for all of them
   * side by side; the tooltip of each bar carries its label.
   */
  labels?: "ends" | "alternate";
}) {
  const ticks = niceTicks(Math.max(0, ...bars.map((b) => b.value)));
  const top = ticks[ticks.length - 1];
  const at = (value: number) => `${(value / top) * 100}%`;
  const labelled = labelIndices(bars.length);
  const last = bars.length - 1;

  return (
    <figure className={clsx("min-w-0", className)}>
      <figcaption className="sr-only">{caption}</figcaption>
      <div aria-hidden className="pt-2">
        <div className="flex gap-2">
          <div
            className={clsx(
              "relative w-8 shrink-0 text-xs text-fg-muted tabular-nums",
              PLOT_HEIGHT,
            )}
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 translate-y-1/2 leading-none"
                style={{ bottom: at(tick) }}
              >
                {tick}
              </span>
            ))}
          </div>

          <div className={clsx("relative min-w-0 flex-1", PLOT_HEIGHT)}>
            {ticks.map((tick) => (
              <div
                key={tick}
                className={clsx(
                  "absolute inset-x-0 border-t",
                  tick === 0 ? "border-border" : "border-border/50",
                )}
                style={{ bottom: at(tick) }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-px sm:gap-1">
              {bars.map((bar, i) => (
                <div
                  key={`${bar.label}-${i}`}
                  title={`${bar.label}: ${bar.value}`}
                  className={clsx(
                    "min-w-0 flex-1 rounded-t-[4px]",
                    bar.value > 0 ? "bg-primary" : "bg-transparent",
                  )}
                  style={{ height: at(bar.value), minHeight: bar.value > 0 ? 2 : 0 }}
                />
              ))}
            </div>
          </div>
        </div>

        {labels === "alternate" ? (
          <div className="mt-1 ml-10 flex gap-px text-[10px] text-fg-muted tabular-nums sm:gap-1 sm:text-xs print:text-[9px]">
            {bars.map((bar, i) => (
              <div key={`${bar.label}-${i}`} className="flex min-w-0 flex-1 justify-center">
                {i % 2 === 0 && <span className="whitespace-nowrap">{bar.label}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative mt-1 ml-10 h-4 text-xs text-fg-muted tabular-nums">
            {labelled.map((i) => (
              <span
                key={i}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${((i + 0.5) / bars.length) * 100}%`,
                  transform:
                    i === 0 ? "none" : i === last ? "translateX(-100%)" : "translateX(-50%)",
                }}
              >
                {bars[i].label}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
