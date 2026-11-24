import dayjs from "dayjs";

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
  baseMap: string;
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

/** "24.11.26 / 09h30", as the BABS examples write a time. */
export const formatState = (time: Date): string => dayjs(time).format("DD.MM.YY / HH[h]mm");

export interface HeaderRow {
  text: string;
  /** Relative size: 1 is the body text. */
  size: number;
  bold?: boolean;
}

/** The lines of the header, top to bottom. */
export function headerRows(header: ExportHeader): HeaderRow[] {
  const { text } = header;
  const scale = header.scale === undefined ? "" : ` / ${formatScale(header.scale)}`;

  return [
    { text: text.classification[header.classification].toUpperCase(), size: 0.9, bold: true },
    { text: header.organisation, size: 1 },
    { text: header.eventName, size: 1.8, bold: true },
    {
      text: header.mapTitle ? `${text.mapType} «${header.mapTitle}»` : text.mapType,
      size: 1.1,
      bold: true,
    },
    { text: `${text.baseMap}${scale}`, size: 1 },
    { text: `${text.state}: ${formatState(header.state)}`, size: 1 },
    { text: header.keeper.trim() === "" ? "" : `${text.keeper}: ${header.keeper}`, size: 1 },
  ].filter((row) => row.text.trim() !== "");
}

const BODY_SIZE = 12;
const PADDING = 10;
const LINE_GAP = 4;
const FONT = "B612, sans-serif";

/** Cuts a line to the width, ending in an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;

  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > width) end -= 1;

  return `${text.slice(0, end)}…`;
}

/**
 * Draws the header in the top left corner of the page, on a white box with a thin frame.
 *
 * Sizes are in the pixels of a page at 96 DPI and scaled by `dpi / 96`, so the header takes the
 * same part of the sheet at any resolution. It is at most 40 % of the width of the page.
 */
export function drawExportHeader(
  canvas: HTMLCanvasElement,
  header: ExportHeader,
  dpi: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const k = dpi / 96;
  const rows = headerRows(header);
  if (rows.length === 0) return;

  const font = (row: HeaderRow) =>
    `${row.bold ? "bold " : ""}${BODY_SIZE * row.size * k}px ${FONT}`;

  ctx.save();
  ctx.textBaseline = "top";

  const maxWidth = Math.max(canvas.width * 0.4 - 2 * PADDING * k, 40 * k);
  let width = 0;
  for (const row of rows) {
    ctx.font = font(row);
    width = Math.max(width, Math.min(ctx.measureText(row.text).width, maxWidth));
  }
  const height =
    rows.reduce((sum, row) => sum + BODY_SIZE * row.size * k + LINE_GAP * k, 0) - LINE_GAP * k;

  const margin = 12 * k;
  const boxWidth = width + 2 * PADDING * k;
  const boxHeight = height + 2 * PADDING * k;

  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillRect(margin, margin, boxWidth, boxHeight);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(1, k);
  ctx.strokeRect(margin, margin, boxWidth, boxHeight);

  ctx.fillStyle = "#000000";
  let y = margin + PADDING * k;
  for (const row of rows) {
    ctx.font = font(row);
    ctx.fillText(fit(ctx, row.text, maxWidth), margin + PADDING * k, y);
    y += BODY_SIZE * row.size * k + LINE_GAP * k;
  }

  ctx.restore();
}
