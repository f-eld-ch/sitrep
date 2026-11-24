import { describe, expect, it, vi } from "vitest";
import {
  drawExportHeader,
  type ExportHeader,
  formatScale,
  formatState,
  headerRows,
  pageScale,
  scaleDenominator,
  wrapText,
} from "./exportHeader";

const header = (over: Partial<ExportHeader> = {}): ExportHeader => ({
  classification: "intern",
  organisation: "sitrep.example.ch",
  eventName: "Hochwasser",
  mapTitle: "Lage Nord",
  scale: 25000,
  state: new Date(2026, 10, 24, 9, 30),
  locale: "de-CH",
  keeper: "Erika Muster",
  text: {
    classification: { intern: "Intern", vertraulich: "Vertraulich", geheim: "Geheim" },
    mapType: "Führungskarte",
    baseMapLabel: "Basiskarte",
    baseMap: "Landeskarte swisstopo",
    scaleLabel: "Massstab",
    state: "Stand",
    keeper: "Kartenführung",
  },
  ...over,
});

describe("scaleDenominator", () => {
  it("is the scale of a page at 96 DPI, to two digits", () => {
    // at zoom 15 and 47° latitude a CSS pixel covers about 1.6 m: about 1:6 200 on the page
    const n = scaleDenominator({ zoom: 15, center: [8, 47] });
    expect(n).toBeGreaterThan(5800);
    expect(n).toBeLessThan(6600);
    expect(String(n).replace(/0+$/, "").length).toBeLessThanOrEqual(2);
  });

  it("halves with each zoom level", () => {
    const a = scaleDenominator({ zoom: 14, center: [8, 47] })!;
    const b = scaleDenominator({ zoom: 15, center: [8, 47] })!;
    expect(a / b).toBeGreaterThan(1.8);
    expect(a / b).toBeLessThan(2.2);
  });

  it("has none for a tilted map, which has no single scale", () => {
    expect(scaleDenominator({ zoom: 15, center: [8, 47], pitch: 30 })).toBeUndefined();
  });

  it("has none for a view that is not a number", () => {
    expect(scaleDenominator({ zoom: Number.NaN, center: [8, 47] })).toBeUndefined();
  });
});

describe("formatting", () => {
  it("writes a scale with the space of the BABS examples", () => {
    expect(formatScale(50000)).toBe("1:50 000");
    expect(formatScale(2500)).toBe("1:2 500");
    expect(formatScale(500)).toBe("1:500");
  });

  it("writes the date and the time of a Swiss locale as 24.11.2026 / 09:28", () => {
    const time = new Date(2026, 10, 24, 9, 28);

    for (const locale of ["de-CH", "fr-CH", "it-CH", "en-CH"]) {
      expect(formatState(time, locale)).toBe("24.11.2026 / 09:28");
    }
  });

  it("keeps the time on a 24 hour clock, with the hour in two digits", () => {
    expect(formatState(new Date(2026, 0, 5, 0, 5), "de-CH")).toBe("05.01.2026 / 00:05");
    expect(formatState(new Date(2026, 0, 5, 21, 40), "de-CH")).toBe("05.01.2026 / 21:40");
  });

  it("follows another locale", () => {
    expect(formatState(new Date(2026, 10, 24, 9, 28), "en-US")).toBe("11/24/2026 / 09:28");
  });
});

describe("headerRows", () => {
  it("lists the lines across the table, then the labelled rows", () => {
    expect(headerRows(header())).toEqual([
      { kind: "span", text: "INTERN", size: 0.9, bold: true },
      { kind: "span", text: "sitrep.example.ch", size: 1, bold: false },
      { kind: "span", text: "Hochwasser", size: 1.8, bold: true },
      { kind: "span", text: "Führungskarte «Lage Nord»", size: 1.1, bold: true },
      { kind: "pair", label: "Basiskarte", value: "Landeskarte swisstopo" },
      { kind: "pair", label: "Massstab", value: "1:25 000" },
      { kind: "pair", label: "Stand", value: "24.11.2026 / 09:30" },
      { kind: "pair", label: "Kartenführung", value: "Erika Muster" },
    ]);
  });

  it("leaves out a row that has nothing to say", () => {
    const rows = headerRows(
      header({ mapTitle: undefined, scale: undefined, eventName: "", keeper: " " }),
    );
    const labels = rows.map((r) => (r.kind === "pair" ? r.label : r.text));

    expect(labels).toContain("Führungskarte");
    expect(labels).not.toContain("Hochwasser");
    expect(labels).not.toContain("Massstab");
    expect(labels).not.toContain("Kartenführung");
  });
});

describe("pageScale", () => {
  it("is how many pixels a pixel of the page at 96 DPI is", () => {
    // A3 is 420 mm wide: 1 587 pixels at 96 DPI, 4 961 at 300 DPI
    expect(pageScale(1587, 420)).toBeCloseTo(1, 2);
    expect(pageScale(4961, 420)).toBeCloseTo(300 / 96, 2);
  });
});

describe("wrapText", () => {
  // six pixels a letter
  const ctx = { measureText: (text: string) => ({ width: text.length * 6 }) } as never;

  it("breaks at the spaces", () => {
    expect(wrapText(ctx, "Hochwasser Gemeinde Musterwil", 100, 3)).toEqual([
      "Hochwasser",
      "Gemeinde",
      "Musterwil",
    ]);
    expect(wrapText(ctx, "Brand Altstadt", 100, 3)).toEqual(["Brand Altstadt"]);
  });

  it("breaks a word that is longer than a line", () => {
    const lines = wrapText(ctx, "Hochwasserschutzverbandsversammlung", 60, 5);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("Hochwasserschutzverbandsversammlung");
    expect(lines.every((l) => l.length * 6 <= 60)).toBe(true);
  });

  it("cuts what does not fit in the lines allowed, ending in an ellipsis", () => {
    const lines = wrapText(ctx, "eins zwei drei vier fünf sechs sieben acht", 60, 2);

    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(lines[1].length * 6).toBeLessThanOrEqual(60);
  });

  it("copes with an empty text and with a width smaller than a letter", () => {
    expect(wrapText(ctx, "   ", 100, 3)).toEqual([]);
    expect(() => wrapText(ctx, "abc", 2, 3)).not.toThrow();
  });
});

describe("drawExportHeader", () => {
  const fakeCanvas = (width: number) => {
    const calls: string[] = [];
    const ctx = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      measureText: (text: string) => ({
        width: text.length * 0.5 * Number.parseFloat(ctx.font.replace(/^bold /, "")),
      }),
      fillRect: vi.fn((...a: number[]) => calls.push(`fillRect ${a.join(",")}`)),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn((text: string) => calls.push(`text ${text}`)),
      font: "",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      textBaseline: "",
    };

    return { canvas: { width, height: width / 1.4, getContext: () => ctx } as never, ctx, calls };
  };

  it("draws the frame in the top left and every line in it", () => {
    const { canvas, ctx } = fakeCanvas(1587);

    drawExportHeader(canvas, header(), 1);

    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    const [x, y, w] = ctx.fillRect.mock.calls[0];
    expect(x).toBeLessThan(30);
    expect(y).toBeLessThan(30);
    expect(w).toBeLessThan(1587 * 0.45);
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toContain("Hochwasser");
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toContain("INTERN");
  });

  it("rules the rows off and the labels from their values, as a table", () => {
    const { canvas, ctx } = fakeCanvas(1587);

    drawExportHeader(canvas, header(), 1);

    // eight rows: seven rules between them, and one between label and value for each labelled row
    expect(ctx.moveTo).toHaveBeenCalledTimes(7 + 4);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    const texts = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(texts).toEqual(expect.arrayContaining(["Stand", "24.11.2026 / 09:30", "Kartenführung"]));
  });

  it("does not draw for a scale that is not usable", () => {
    const { canvas, ctx } = fakeCanvas(1000);

    drawExportHeader(canvas, header(), 0);
    drawExportHeader(canvas, header(), Number.NaN);

    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it("takes the same part of the sheet at any resolution", () => {
    const low = fakeCanvas(1587);
    const high = fakeCanvas(4961);
    drawExportHeader(low.canvas, header(), 1);
    drawExportHeader(high.canvas, header(), 300 / 96);

    const share = (c: ReturnType<typeof fakeCanvas>, width: number) =>
      c.ctx.fillRect.mock.calls[0][2] / width;
    expect(share(high, 4961)).toBeCloseTo(share(low, 1587), 1);
  });

  it("lets a long event name run on in the lines below, inside the table", () => {
    const { canvas, ctx } = fakeCanvas(1587);

    drawExportHeader(
      canvas,
      header({ eventName: "Hochwasser Gemeinde Musterwil Oberdorf Süd" }),
      1,
    );

    const drawn = ctx.fillText.mock.calls.map((c) => c[0] as string);
    const name = drawn.filter((t) => "Hochwasser Gemeinde Musterwil Oberdorf Süd".includes(t));
    expect(name.length).toBeGreaterThan(1);
    expect(name.join(" ")).toBe("Hochwasser Gemeinde Musterwil Oberdorf Süd");
    // and the table keeps to its width
    expect(ctx.fillRect.mock.calls[0][2]).toBeLessThanOrEqual(1587 * 0.4);
  });

  it("does not make the table wider for a long event name", () => {
    const short = fakeCanvas(1587);
    const long = fakeCanvas(1587);

    drawExportHeader(short.canvas, header({ eventName: "Brand" }), 1);
    drawExportHeader(
      long.canvas,
      header({ eventName: "Hochwasser Gemeinde Musterwil Oberdorf Süd Unterdorf Nord" }),
      1,
    );

    expect(long.ctx.fillRect.mock.calls[0][2]).toBe(short.ctx.fillRect.mock.calls[0][2]);
  });

  it("makes the row as tall as its lines", () => {
    const short = fakeCanvas(1587);
    const long = fakeCanvas(1587);

    drawExportHeader(short.canvas, header({ eventName: "Brand" }), 1);
    drawExportHeader(
      long.canvas,
      header({ eventName: "Hochwasser Gemeinde Musterwil Oberdorf Süd" }),
      1,
    );

    expect(long.ctx.fillRect.mock.calls[0][3]).toBeGreaterThan(short.ctx.fillRect.mock.calls[0][3]);
  });

  it("cuts a line that is too long instead of running off the page", () => {
    const { canvas, ctx } = fakeCanvas(1000);

    drawExportHeader(canvas, header({ eventName: "x".repeat(400) }), 1);

    const drawn = ctx.fillText.mock.calls.map((c) => c[0] as string);
    expect(drawn.some((t) => t.endsWith("…"))).toBe(true);
  });

  it("copes with a canvas that cannot be drawn on", () => {
    expect(() =>
      drawExportHeader({ width: 100, height: 100, getContext: () => null } as never, header(), 1),
    ).not.toThrow();
  });
});
