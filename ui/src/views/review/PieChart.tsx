import { clsx } from "clsx";

export interface Slice {
  label: string;
  value: number;
  /** Fills the slice, e.g. "fill-primary". */
  fillClass: string;
}

const CENTER = 50;
const RADIUS = 48;

/** A point on the circle, `fraction` of the way round from twelve o'clock. */
function point(fraction: number): [number, number] {
  const angle = fraction * 2 * Math.PI - Math.PI / 2;

  return [CENTER + RADIUS * Math.cos(angle), CENTER + RADIUS * Math.sin(angle)];
}

/**
 * A pie of a few slices, starting at twelve o'clock, with a surface-coloured gap between the
 * slices. Nothing for no data. The numbers belong in a legend next to it: the slices are not
 * labelled, and the picture is hidden from screen readers in favour of the caption.
 */
export function PieChart({
  slices,
  caption,
  className,
}: {
  slices: Slice[];
  /** What the pie shows, read out in place of the picture. */
  caption: string;
  className?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  const present = slices.filter((s) => s.value > 0);
  let from = 0;

  return (
    <figure className={clsx("shrink-0", className)}>
      <figcaption className="sr-only">{caption}</figcaption>
      <svg aria-hidden viewBox="0 0 100 100" className="h-32 w-32 print:h-20 print:w-20">
        {present.length === 1 ? (
          <circle cx={CENTER} cy={CENTER} r={RADIUS} className={present[0].fillClass}>
            <title>{present[0].label}</title>
          </circle>
        ) : (
          present.map((slice) => {
            const to = from + slice.value / total;
            const [x1, y1] = point(from);
            const [x2, y2] = point(to);
            const large = to - from > 0.5 ? 1 : 0;
            from = to;

            return (
              <path
                key={slice.label}
                d={`M ${CENTER} ${CENTER} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2} ${y2} Z`}
                className={clsx(slice.fillClass, "stroke-bg-elevated")}
                strokeWidth={2}
                strokeLinejoin="round"
              >
                <title>{`${slice.label}: ${slice.value}`}</title>
              </path>
            );
          })
        )}
      </svg>
    </figure>
  );
}
