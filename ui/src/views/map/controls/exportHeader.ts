/**
 * The header of an exported map, after the BABS "Beschriftungsnormen" for the Führungskarte and the
 * Nachrichtenkarte (Behelf Einsatz Lage): who the map is for, what it shows, at which scale and as
 * of when, and who kept it. Only the lines that make sense for a map made on a screen are kept; the
 * phases, coordinate crosses and the like belong to the paper map.
 *
 * It is drawn on top of the map, in the top left corner of the page.
 */

export const CLASSIFICATIONS = ["intern", "vertraulich", "geheim"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export interface ExportHeaderText {
  /** The words of the sheet, in the language of the interface. */
  classification: Record<Classification, string>;
  /** "Nachrichtenkarte" or "Führungskarte". */
  mapType: string;
  baseMapLabel: string;
  baseMap: string;
  scaleLabel: string;
  state: string;
  keeper: string;
}

export interface ExportHeader {
  classification: Classification;
  /** Who the map is made by: the domain of the server. */
  organisation: string;
  eventName: string;
  /** The title of the map, if it has one of its own: the name of the layer. */
  mapTitle?: string;
  /** The denominator of the scale (1:N), if it can be stated. */
  scale?: number;
  /** The time the map shows. */
  state: Date;
  /** How dates and times are written, e.g. "de-CH": 24.11.2026 / 09:28. */
  locale: string;
  /** The full name of the user keeping the map. */
  keeper: string;
  text: ExportHeaderText;
}

/** Metres on the ground that one CSS pixel (1/96 inch) of a map at `zoom` covers at `latitude`. */
const metresPerPixel = (zoom: number, latitude: number): number =>
  (78271.51696402048 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;

/** Metres on the page that one CSS pixel covers. */
const METRES_PER_PAGE_PIXEL = 0.0254 / 96;

/**
 * The denominator of the scale a page shows its centre at, rounded to two significant digits and
 * so stated as "about". Not meaningful for a tilted map, which has no single scale.
 */
export function scaleDenominator(view: {
  zoom: number;
  center: [number, number];
  pitch?: number;
}): number | undefined {
  if ((view.pitch ?? 0) > 0) return undefined;

  const denominator = metresPerPixel(view.zoom, view.center[1]) / METRES_PER_PAGE_PIXEL;
  if (!Number.isFinite(denominator) || denominator <= 0) return undefined;

  const magnitude = 10 ** (Math.floor(Math.log10(denominator)) - 1);

  return Math.round(denominator / magnitude) * magnitude;
}

/** "1:50 000", with the space of the BABS examples. */
export const formatScale = (denominator: number): string =>
  `1:${Math.round(denominator)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, "\u0020")}`;

/**
 * The date and the time in the form of the locale, the date with the year in full and the time on
 * a 24 hour clock: for the Swiss locales "24.11.2026 / 09:28".
 */
export function formatState(time: Date, locale: string): string {
  const date = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(time);
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(time);

  return `${date} / ${clock}`;
}

/** A line of the table across its whole width, or a label with its value. */
export type HeaderRow =
  | {
      kind: "span";
      text: string;
      /** Relative size: 1 is the body text. */
      size: number;
      bold?: boolean;
    }
  | { kind: "pair"; label: string; value: string };

/** The rows of the header table, top to bottom; a row without a value is left out. */
export function headerRows(header: ExportHeader): HeaderRow[] {
  const { text } = header;
  const span = (value: string, size: number, bold = false): HeaderRow[] =>
    value.trim() === "" ? [] : [{ kind: "span", text: value, size, bold }];
  const pair = (label: string, value: string | undefined): HeaderRow[] =>
    value === undefined || value.trim() === "" ? [] : [{ kind: "pair", label, value }];

  return [
    ...span(text.classification[header.classification].toUpperCase(), 0.9, true),
    ...span(header.organisation, 1),
    ...span(header.eventName, 1.8, true),
    ...span(header.mapTitle ? `${text.mapType} «${header.mapTitle}»` : text.mapType, 1.1, true),
    ...pair(text.baseMapLabel, text.baseMap),
    ...pair(text.scaleLabel, header.scale === undefined ? undefined : formatScale(header.scale)),
    ...pair(text.state, formatState(header.state, header.locale)),
    ...pair(text.keeper, header.keeper),
  ];
}

const BODY_SIZE = 12;
const CELL_X = 7;
const CELL_Y = 4;
const LINE_HEIGHT = 1.15;
/** The table is at least this wide, in pixels of a page at 96 DPI. */
const MIN_WIDTH = 240;
const FONT = "B612, sans-serif";

/** How many lines a text may take before it is cut short: the event name more than the rest. */
const MAX_LINES_SPAN = 4;
const MAX_LINES_VALUE = 2;

/**
 * Breaks a text into lines of at most `width`, at the spaces, and in the middle of a word that is
 * longer than a line. What does not fit in `maxLines` ends the last line in an ellipsis.
 */
export function wrapText(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  width: number,
  maxLines: number,
): string[] {
  const fits = (candidate: string) => ctx.measureText(candidate).width <= width;
  const lines: string[] = [];
  let line = "";

  const push = (value: string) => {
    lines.push(value);
    line = "";
  };

  for (const word of text.trim().split(/\s+/)) {
    if (word === "") continue;

    const attempt = line === "" ? word : `${line} ${word}`;
    if (fits(attempt)) {
      line = attempt;
      continue;
    }
    if (line !== "") push(line);

    // A word that does not fit a line of its own is broken where the line ends.
    let rest = word;
    while (!fits(rest)) {
      let end = rest.length - 1;
      while (end > 1 && !fits(rest.slice(0, end))) end -= 1;
      push(rest.slice(0, Math.max(end, 1)));
      rest = rest.slice(Math.max(end, 1));
    }
    line = rest;
  }
  if (line !== "") push(line);

  if (lines.length <= maxLines) return lines;

  // Too long: the lines that fit, the last one ending in an ellipsis.
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;

  return kept;
}

/** How many canvas pixels a pixel of the page at 96 DPI is, for a canvas of the whole page. */
export const pageScale = (canvasWidth: number, pageWidthMm: number): number =>
  canvasWidth / ((pageWidthMm / 25.4) * 96);

/**
 * Draws the header as a table in the top left corner of the page: a white box with a frame, the
 * lines across its width on top, then the labelled rows in two columns, every row ruled off. The
 * table does not grow with a long event name: it runs on in the lines below, up to a few, before
 * it is cut short.
 *
 * Sizes are in the pixels of a page at 96 DPI and scaled by `scale` (see `pageScale`), so the
 * table takes the same part of the sheet at any resolution. It is at most 40 % of the page wide.
 */
export function drawExportHeader(
  canvas: HTMLCanvasElement,
  header: ExportHeader,
  scale: number,
): void {
  const ctx = canvas.getContext("2d");
  const rows = headerRows(header);
  if (!ctx || rows.length === 0 || !(scale > 0)) return;

  const k = scale;
  const px = (size: number) => BODY_SIZE * size * k;
  const font = (size: number, bold = false) => `${bold ? "bold " : ""}${px(size)}px ${FONT}`;

  ctx.save();
  ctx.textBaseline = "top";

  const maxWidth = Math.max(canvas.width * 0.4, 80 * k);
  const textWidth = (text: string, size: number, bold = false) => {
    ctx.font = font(size, bold);

    return ctx.measureText(text).width;
  };
  const pad = 2 * CELL_X * k;

  // The label column is as wide as its widest label, the table as wide as its widest row, up to
  // its limit.
  const labelWidth = Math.max(
    0,
    ...rows.flatMap((r) => (r.kind === "pair" ? [textWidth(r.label, 1)] : [])),
  );
  const labelColumn = labelWidth + pad;
  // The table is as wide as its labelled rows, the classification and the organisation need, and at
  // least MIN_WIDTH. The event name and the map title are not: they run on in lines instead of
  // making the table wider, however long they are.
  const rowWidth = (row: HeaderRow) =>
    row.kind === "pair"
      ? labelColumn + textWidth(row.value, 1, true) + pad
      : row.size <= 1
        ? textWidth(row.text, row.size, row.bold) + pad
        : 0;
  const width = Math.min(Math.max(MIN_WIDTH * k, ...rows.map(rowWidth)), maxWidth);

  // Every row's lines, once the width is known.
  const laid = rows.map((row) => {
    if (row.kind === "span") {
      ctx.font = font(row.size, row.bold);

      return {
        row,
        size: row.size,
        lines: wrapText(ctx, row.text, width - pad, MAX_LINES_SPAN),
      };
    }
    ctx.font = font(1, true);

    return {
      row,
      size: 1,
      lines: wrapText(ctx, row.value, width - labelColumn - pad, MAX_LINES_VALUE),
    };
  });
  const heightOf = (item: (typeof laid)[number]) =>
    px(item.size) * LINE_HEIGHT * item.lines.length + 2 * CELL_Y * k;
  const height = laid.reduce((sum, item) => sum + heightOf(item), 0);

  const x0 = 12 * k;
  const y0 = 12 * k;

  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.fillRect(x0, y0, width, height);

  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#000000";
  ctx.lineWidth = Math.max(1, k);

  let y = y0;
  laid.forEach((item, index) => {
    const { row } = item;
    if (index > 0) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + width, y);
      ctx.stroke();
    }

    const lineStep = px(item.size) * LINE_HEIGHT;
    if (row.kind === "span") {
      ctx.font = font(row.size, row.bold);
      item.lines.forEach((line, i) => {
        ctx.fillText(line, x0 + CELL_X * k, y + CELL_Y * k + i * lineStep);
      });
    } else {
      ctx.font = font(1);
      ctx.fillText(
        wrapText(ctx, row.label, labelColumn - pad, 1)[0],
        x0 + CELL_X * k,
        y + CELL_Y * k,
      );
      ctx.font = font(1, true);
      item.lines.forEach((line, i) => {
        ctx.fillText(line, x0 + labelColumn + CELL_X * k, y + CELL_Y * k + i * lineStep);
      });
      // the rule between the label and its value
      ctx.beginPath();
      ctx.moveTo(x0 + labelColumn, y);
      ctx.lineTo(x0 + labelColumn, y + heightOf(item));
      ctx.stroke();
    }
    y += heightOf(item);
  });

  ctx.strokeRect(x0, y0, width, height);
  ctx.restore();
}
