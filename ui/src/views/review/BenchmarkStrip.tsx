import { useTranslation } from "react-i18next";
import type { ReviewBenchmark } from "types";
import { formatDuration } from "utils/duration";
import { percent } from "./format";

type Kind = "time" | "share";

function formatValue(value: number, kind: Kind): string {
  return kind === "time" ? formatDuration(value) : `${percent(value)} %`;
}

/** Where on the strip a value lies, from 0 to 100, with the strip running from `min` to `max`. */
function position(value: number, min: number, max: number): number {
  return max > min ? ((value - min) / (max - min)) * 100 : 50;
}

/**
 * Where an incident lies among the other incidents on one measure: a strip from the lowest to the
 * highest value of the others, with the middle half of them shaded, their median marked and this
 * incident as a dot. The words next to it say the same, for anyone who cannot see the strip.
 */
export function BenchmarkStrip({
  label,
  benchmark,
  kind,
}: {
  label: string;
  benchmark: ReviewBenchmark;
  kind: Kind;
}) {
  const { t } = useTranslation();
  const { value, peers, sufficient, lowest, q1, median, q3, highest, betterThan } = benchmark;

  if (peers === 0 || !sufficient) {
    return (
      <div data-testid="benchmark" className="text-sm">
        <span className="font-medium text-fg">{label}</span>{" "}
        <span className="text-fg-muted">
          {peers === 0 ? t("review.noPeers") : t("review.fewPeers", { peers })}
        </span>
      </div>
    );
  }

  // The dot must always be on the strip, also for an incident outside the range of the others.
  const min = Math.min(lowest, value ?? lowest);
  const max = Math.max(highest, value ?? highest);
  const at = (v: number) => `${position(v, min, max)}%`;

  return (
    <div data-testid="benchmark">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="text-fg-muted">
          {t("review.typical", { value: formatValue(median, kind) })}
          {" · "}
          {t("review.peers", { count: peers })}
        </span>
      </div>

      <div aria-hidden className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded bg-bg-subtle" />
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-fg-muted/30"
          style={{
            left: at(q1),
            width: `max(2px, ${position(q3, min, max) - position(q1, min, max)}%)`,
          }}
          title={`${formatValue(q1, kind)} – ${formatValue(q3, kind)}`}
        />
        <div
          className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-fg-muted"
          style={{ left: at(median) }}
          title={formatValue(median, kind)}
        />
        {value !== null && (
          <div
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-bg-elevated"
            style={{ left: at(value) }}
            title={formatValue(value, kind)}
          />
        )}
      </div>

      <div aria-hidden className="mt-0.5 flex justify-between text-xs text-fg-muted tabular-nums">
        <span>{formatValue(min, kind)}</span>
        <span>{formatValue(max, kind)}</span>
      </div>

      {value !== null && betterThan !== null && (
        <p className="mt-1 text-sm font-semibold text-fg">
          {t(kind === "time" ? "review.fasterThan" : "review.higherThan", {
            percent: percent(betterThan),
          })}
        </p>
      )}
    </div>
  );
}

/** What the marks on the strips mean. */
export function BenchmarkLegend() {
  const { t } = useTranslation();

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full bg-primary" />
        {t("review.legendThis")}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-4 rounded-sm bg-fg-muted/30" />
        {t("review.legendRange")}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-0.5 bg-fg-muted" />
        {t("review.legendMedian")}
      </li>
    </ul>
  );
}
