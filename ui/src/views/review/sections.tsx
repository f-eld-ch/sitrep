import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";
import type {
  IncidentReview,
  KpiDuration,
  KpiMetric,
  ReviewBenchmark,
  ReviewDivision,
  ReviewPriorityGroup,
} from "types";
import { divisionLongLabel } from "utils/divisionLabel";
import { formatDuration } from "utils/duration";
import { BarChart } from "./BarChart";
import { BenchmarkLegend, BenchmarkStrip } from "./BenchmarkStrip";
import { PieChart } from "./PieChart";
import { bucketLabel, chartTime, percent, rangeLabel, spansDays } from "./format";

const card = "rounded border border-border bg-bg-elevated p-3";
const heading = "mb-3 text-sm font-semibold text-fg";

/** Median, the time 90 % stayed within, and the longest. */
function DurationRows({ duration }: { duration: KpiDuration }) {
  const { t } = useTranslation();

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
      <dt className="text-fg-muted">{t("review.median")}</dt>
      <dd className="font-semibold text-fg tabular-nums">{formatDuration(duration.median)}</dd>
      <dt className="text-fg-muted">{t("review.p90")}</dt>
      <dd className="font-semibold text-fg tabular-nums">{formatDuration(duration.p90)}</dd>
      <dt className="text-fg-muted">{t("review.max")}</dt>
      <dd className="font-semibold text-fg tabular-nums">{formatDuration(duration.max)}</dd>
    </dl>
  );
}

/** A share of messages as a bar. Green when every message got through, the warning colour if not. */
function ShareBar({ ratio }: { ratio: number }) {
  return (
    <div aria-hidden className="h-2 overflow-hidden rounded bg-bg-subtle">
      <div
        className={clsx("h-full", ratio >= 1 ? "bg-success" : "bg-warning")}
        style={{ width: `${percent(ratio)}%` }}
      />
    </div>
  );
}

/**
 * The comparison with the other incidents, folded away until asked for. Folded, its heading still
 * says how this incident does on the time, which is what most people want to know.
 */
function ComparisonBlock({
  comparison,
}: {
  comparison: { median: ReviewBenchmark; share: ReviewBenchmark };
}) {
  const { t } = useTranslation();
  const { value, sufficient, betterThan } = comparison.median;
  const teaser =
    sufficient && value !== null && betterThan !== null
      ? t("review.fasterThan", { percent: percent(betterThan) })
      : undefined;

  return (
    <details className="group mt-4 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-fg-muted marker:hidden hover:text-fg [&::-webkit-details-marker]:hidden">
        <FontAwesomeIcon
          icon={faChevronRight}
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        <span>{t("review.comparisonTitle")}</span>
        {teaser && <span className="ml-auto text-right font-semibold text-fg">{teaser}</span>}
      </summary>

      <div className="mt-3 space-y-3">
        <BenchmarkStrip label={t("review.median")} benchmark={comparison.median} kind="time" />
        <BenchmarkStrip label={t("review.shareLabel")} benchmark={comparison.share} kind="share" />
        <BenchmarkLegend />
      </div>
    </details>
  );
}

function MetricCard({
  title,
  metric,
  doneKey,
  missingKey,
  noneKey,
  testId,
  comparison,
}: {
  title: string;
  metric: KpiMetric;
  /** How the median time and the share of messages compare with the other incidents. */
  comparison?: { median: ReviewBenchmark; share: ReviewBenchmark };
  /** "{{completed}} of {{total}} messages triaged" */
  doneKey: string;
  /** "{{count}} never triaged" */
  missingKey: string;
  /** Shown when the figure applied to no message at all. */
  noneKey: string;
  testId: string;
}) {
  const { t } = useTranslation();
  const { total, completed, ratio, duration, distribution } = metric;

  return (
    <section data-testid={testId} className={card} aria-label={title}>
      <h3 className={heading}>{title}</h3>

      {ratio === null ? (
        <p className="text-sm text-fg-muted">{t(noneKey)}</p>
      ) : (
        <>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold text-fg tabular-nums">{percent(ratio)} %</span>
            <span className="text-xs text-fg-muted">{t(doneKey, { completed, total })}</span>
          </div>
          <ShareBar ratio={ratio} />
          {/* The line is there even when nothing is missing, so the cards next to each other keep
              the same layout and their charts line up. */}
          <p className="mt-1 min-h-4 text-xs text-fg-muted">
            {completed < total ? t(missingKey, { count: total - completed }) : null}
          </p>
          {duration && (
            <div className="mt-3">
              <DurationRows duration={duration} />
            </div>
          )}
          {distribution.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1 text-xs font-medium text-fg-muted">
                {t("review.distributionHint")}
              </h4>
              <BarChart
                labels="alternate"
                caption={`${title}: ${t("review.distributionHint")}`}
                bars={distribution.map((b) => ({
                  label: rangeLabel(b.from, b.to),
                  value: b.count,
                }))}
              />
            </div>
          )}
          {comparison && <ComparisonBlock comparison={comparison} />}
        </>
      )}
    </section>
  );
}

export function FlowSection({ review }: { review: IncidentReview }) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="review-flow">
      <h2 id="review-flow" className="mb-2 text-base font-bold text-fg">
        {t("review.flow")}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-3">
        <MetricCard
          testId="review-triage"
          title={t("review.timeToTriage")}
          metric={review.triage}
          doneKey="review.triaged"
          missingKey="review.neverTriaged"
          noneKey="review.noMessages"
          comparison={{
            median: review.comparison.triageMedian,
            share: review.comparison.triageRatio,
          }}
        />
        <MetricCard
          testId="review-draw"
          title={t("review.timeToDraw")}
          metric={review.draw}
          doneKey="review.drawn"
          missingKey="review.neverDrawn"
          noneKey="review.noDrawMessages"
          comparison={{
            median: review.comparison.drawMedian,
            share: review.comparison.drawRatio,
          }}
        />
      </div>
      {/* On a line of its own, below the two times. */}
      <div className="mt-3">
        <PriorityCard high={review.triageHigh} normal={review.triageNormal} />
      </div>
    </section>
  );
}

function PriorityCard({
  high,
  normal,
}: {
  high: ReviewPriorityGroup;
  normal: ReviewPriorityGroup;
}) {
  const { t } = useTranslation();
  const total = high.count + normal.count;
  const groups = [
    {
      key: "high",
      label: t("review.priorityHigh"),
      group: high,
      fillClass: "fill-primary",
      swatchClass: "bg-primary",
    },
    {
      key: "normal",
      label: t("review.priorityNormal"),
      group: normal,
      fillClass: "fill-fg-muted/40",
      swatchClass: "bg-fg-muted/40",
    },
  ];

  return (
    <section data-testid="review-priority" className={card} aria-label={t("review.priority")}>
      <h3 className="mb-1 text-sm font-semibold text-fg">{t("review.priority")}</h3>
      <p className="mb-3 text-xs text-fg-muted">{t("review.priorityHint")}</p>

      {/* Three columns across the whole card: the pie, then the times of each priority. */}
      <div
        className={clsx(
          "grid grid-cols-1 gap-6 lg:gap-0",
          total > 0 ? "lg:grid-cols-3" : "lg:grid-cols-2",
        )}
      >
        {total > 0 && (
          <div className="flex items-center gap-4 lg:pr-6">
            <PieChart
              caption={t("review.priority")}
              slices={groups.map((g) => ({
                label: g.label,
                value: g.group.count,
                fillClass: g.fillClass,
              }))}
            />
            <ul className="space-y-1 text-sm">
              {groups.map((g) => (
                <li key={g.key} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={clsx("mt-1 size-3 shrink-0 rounded-sm", g.swatchClass)}
                  />
                  <span className="flex flex-col">
                    <span className="text-fg">{g.label}</span>
                    <span className="text-xs text-fg-muted tabular-nums">
                      {t("review.priorityShare", {
                        count: g.group.count,
                        percent: percent(g.group.count / total),
                      })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {groups.map((g, i) => (
          <div
            key={g.key}
            className={clsx(
              "min-w-0 lg:px-6",
              // A rule between the columns, but none in front of the first one.
              total > 0 || i > 0 ? "lg:border-l lg:border-border" : "lg:pl-0",
            )}
          >
            <div className="mb-1">
              <div className="text-sm font-semibold text-fg">{g.label}</div>
              <div className="text-xs text-fg-muted">{t("review.timeToTriage")}</div>
            </div>
            {g.group.duration ? (
              <DurationRows duration={g.group.duration} />
            ) : (
              <p className="text-sm text-fg-muted">{t("review.noneTriaged")}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function DivisionRow({
  name,
  count,
  max,
  detail,
  muted = false,
}: {
  name: string;
  count: number;
  max: number;
  detail?: string;
  muted?: boolean;
}) {
  return (
    <li className="py-2">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span
          className={clsx(
            "min-w-0 truncate text-sm font-semibold",
            muted ? "text-fg-muted" : "text-fg",
          )}
        >
          {name}
        </span>
        <span className="shrink-0 text-lg font-bold text-fg tabular-nums">{count}</span>
      </div>
      <div aria-hidden className="h-2 rounded bg-bg-subtle">
        <div
          className={clsx("h-full rounded-r-[4px]", muted ? "bg-fg-muted/40" : "bg-primary")}
          style={{ width: `${(count / max) * 100}%`, minWidth: count > 0 ? 2 : 0 }}
        />
      </div>
      {detail && <p className="mt-1 text-xs text-fg-muted">{detail}</p>}
    </li>
  );
}

function divisionDetail(
  d: ReviewDivision,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | undefined {
  if (d.assigned === 0) return undefined;

  const parts = [
    t(d.kind === "MESSAGE_MAP" ? "review.drawnOf" : "review.acknowledged", {
      acknowledged: d.acknowledged,
      assigned: d.assigned,
    }),
  ];

  if (d.duration) parts.push(`${t("review.median")} ${formatDuration(d.duration.median)}`);

  return parts.join(" · ");
}

export function DivisionSection({ review }: { review: IncidentReview }) {
  const { t } = useTranslation();
  const divisions = [...review.divisions].sort(
    (a, b) =>
      b.assigned - a.assigned || divisionLongLabel(a, t).localeCompare(divisionLongLabel(b, t)),
  );
  const max = Math.max(1, review.unassigned, ...divisions.map((d) => d.assigned));
  const anyTriaged = review.divisions.some((d) => d.assigned > 0) || review.unassigned > 0;

  return (
    <section aria-labelledby="review-divisions" className={card}>
      <h2 id="review-divisions" className="mb-1 text-base font-bold text-fg">
        {t("review.divisions")}
      </h2>
      <p className="mb-2 text-xs text-fg-muted">{t("review.divisionsHint")}</p>
      {anyTriaged ? (
        <ul className="divide-y divide-border">
          {divisions.map((d) => (
            <DivisionRow
              key={d.id}
              name={divisionLongLabel(d, t)}
              count={d.assigned}
              max={max}
              detail={divisionDetail(d, t)}
            />
          ))}
          {review.unassigned > 0 && (
            <DivisionRow
              muted
              name={t("review.unassigned")}
              count={review.unassigned}
              max={max}
              detail={t("review.unassignedHint")}
            />
          )}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t("review.noTriaged")}</p>
      )}
    </section>
  );
}

export function LoadSection({ review }: { review: IncidentReview }) {
  const { t } = useTranslation();
  const { load } = review;

  if (load.buckets.length === 0) return null;

  const days = spansDays(load.buckets.map((b) => b.start));
  const time = (d: Date) => chartTime(d, load.bucketSeconds, days);
  const enteredTitle = t("review.entered", { bucket: bucketLabel(load.bucketSeconds, t) });
  const backlogTitle = t("review.backlog");

  return (
    <section aria-labelledby="review-load" className={card}>
      <h2 id="review-load" className="mb-3 text-base font-bold text-fg">
        {t("review.load")}
      </h2>

      <div className="flex flex-col gap-8">
        <div>
          <h3 className="mb-1 text-sm font-semibold text-fg">{enteredTitle}</h3>
          {load.peakEnteredAt && (
            <p className="mb-2 text-xs text-fg-muted">
              {t("review.peakEntered", { count: load.peakEntered, time: time(load.peakEnteredAt) })}
            </p>
          )}
          <BarChart
            caption={enteredTitle}
            bars={load.buckets.map((b) => ({ label: time(b.start), value: b.entered }))}
          />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold text-fg">{backlogTitle}</h3>
          {load.peakBacklogAt && (
            <p className="mb-2 text-xs text-fg-muted">
              {t("review.peakBacklog", { count: load.peakBacklog, time: time(load.peakBacklogAt) })}
            </p>
          )}
          <BarChart
            caption={backlogTitle}
            bars={load.buckets.map((b) => ({ label: time(b.start), value: b.backlog }))}
          />
        </div>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-primary">{t("review.showTable")}</summary>
        <table className="mt-2 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-fg-muted">
              <th className="py-1 font-medium">{t("review.time")}</th>
              <th className="py-1 text-right font-medium">{t("review.enteredShort")}</th>
              <th className="py-1 text-right font-medium">{t("review.backlogShort")}</th>
            </tr>
          </thead>
          <tbody>
            {load.buckets.map((b) => (
              <tr key={b.start.toISOString()} className="border-t border-border">
                <td className="py-1">{time(b.start)}</td>
                <td className="py-1 text-right">{b.entered}</td>
                <td className="py-1 text-right">{b.backlog}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export function ReworkSection({ review }: { review: IncidentReview }) {
  const { t } = useTranslation();
  const { rework, reportingLag } = review;
  const rows = [
    { key: "moreInfo", label: t("review.moreInfo"), count: rework.moreInfo },
    { key: "reset", label: t("review.reset"), count: rework.reset },
    { key: "corrected", label: t("review.corrected"), count: rework.correctedAfterTriage },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
      <section aria-labelledby="review-rework" className={card}>
        <h2 id="review-rework" className="mb-1 text-base font-bold text-fg">
          {t("review.rework")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">
          {rework.reworked === 0
            ? t("review.noRework")
            : t("review.reworkSummary", { reworked: rework.reworked, total: rework.total })}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.key} className="contents">
              <dt className="text-fg-muted">{row.label}</dt>
              <dd className="font-semibold text-fg tabular-nums">{row.count}</dd>
            </div>
          ))}
        </dl>
      </section>

      {reportingLag && (
        <section aria-labelledby="review-lag" className={card}>
          <h2 id="review-lag" className="mb-1 text-base font-bold text-fg">
            {t("review.lag")}
          </h2>
          <p className="mb-3 text-xs text-fg-muted">{t("review.lagHint")}</p>
          <DurationRows duration={reportingLag} />
        </section>
      )}
    </div>
  );
}
