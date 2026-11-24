import { describe, expect, it, vi } from "vitest";
import {
  drawExportHeader,
  type ExportHeader,
  formatScale,
  formatState,
  headerRows,
  scaleDenominator,
} from "./exportHeader";

const header = (over: Partial<ExportHeader> = {}): ExportHeader => ({
  classification: "intern",
  organisation: "sitrep.example.ch",
  eventName: "Hochwasser",
  mapTitle: "Lage Nord",
  scale: 25000,
  state: new Date(2026, 10, 24, 9, 30),
  keeper: "Erika Muster",
  text: {
    classification: { intern: "Intern", vertraulich: "Vertraulich", geheim: "Geheim" },
    mapType: "Führungskarte",
    baseMap: "Landeskarte swisstopo",
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

  it("writes a time as the BABS examples do", () => {
    expect(formatState(new Date(2026, 10, 24, 9, 5))).toBe("24.11.26 / 09h05");
  });
});

describe("headerRows", () => {
  it("lists what the sheet says, top to bottom", () => {
    expect(headerRows(header()).map((r) => r.text)).toEqual([
      "INTERN",
      "sitrep.example.ch",
      "Hochwasser",
      "Führungskarte «Lage Nord»",
      "Landeskarte swisstopo / 1:25 000",
      "Stand: 24.11.26 / 09h30",
      "Kartenführung: Erika Muster",
    ]);
  });

  it("leaves out what is not known", () => {
    const rows = headerRows(
      header({ mapTitle: undefined, scale: undefined, eventName: "", keeper: "" }),
    ).map((r) => r.text);

    expect(rows).toContain("Führungskarte");
    expect(rows).toContain("Landeskarte swisstopo");
    expect(rows).not.toContain("Hochwasser");
    expect(rows.some((r) => r.startsWith("Kartenführung:"))).toBe(false);
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

    drawExportHeader(canvas, header(), 96);

    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    const [x, y, w] = ctx.fillRect.mock.calls[0];
    expect(x).toBeLessThan(30);
    expect(y).toBeLessThan(30);
    expect(w).toBeLessThan(1587 * 0.45);
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toContain("Hochwasser");
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toContain("INTERN");
  });

  it("takes the same part of the sheet at any resolution", () => {
    const low = fakeCanvas(1587);
    const high = fakeCanvas(4961);
    drawExportHeader(low.canvas, header(), 96);
    drawExportHeader(high.canvas, header(), 300);

    const share = (c: ReturnType<typeof fakeCanvas>, width: number) =>
      c.ctx.fillRect.mock.calls[0][2] / width;
    expect(share(high, 4961)).toBeCloseTo(share(low, 1587), 1);
  });

  it("cuts a line that is too long instead of running off the page", () => {
    const { canvas, ctx } = fakeCanvas(1000);

    drawExportHeader(canvas, header({ eventName: "x".repeat(400) }), 96);

    const drawn = ctx.fillText.mock.calls.map((c) => c[0] as string);
    expect(drawn.some((t) => t.endsWith("…"))).toBe(true);
  });

  it("copes with a canvas that cannot be drawn on", () => {
    expect(() =>
      drawExportHeader({ width: 100, height: 100, getContext: () => null } as never, header(), 96),
    ).not.toThrow();
  });
});
