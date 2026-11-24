import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentContext, UserContext } from "utils";
import { LayerContext, type LayerState } from "../LayerContext";
import { MapTimeContext } from "../MapTimeContext";

const mocks = vi.hoisted(() => ({
  controls: [] as unknown[],
  superExport: vi.fn(),
  generate: vi.fn(),
  draw: vi.fn(),
  pdfImage: vi.fn(),
  saved: [] as { name: string; type: string }[],
}));

vi.mock("@watergis/maplibre-gl-export", () => ({
  Format: { PDF: "pdf", PNG: "png" },
  PageOrientation: { Landscape: "landscape" },
  Size: { A3: "a3" },
  MaplibreExportControl: class {
    options: { Filename?: string };
    dialogState?: { fileName: string };
    constructor(options: { Filename?: string }) {
      this.options = options;
      mocks.controls.push(this);
    }
    openDialog() {}
    exportMap(...args: unknown[]) {
      return mocks.superExport(...args);
    }
    createGeneratorConfig(settings: unknown) {
      return { settings };
    }
    createGenerator(_map: unknown, config: unknown) {
      return { toCanvas: () => mocks.generate(config) };
    }
  },
}));
vi.mock("@watergis/maplibre-gl-export/dist/maplibre-gl-export.css", () => ({}));
vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 420, getHeight: () => 297 } };
    addImage(...args: unknown[]) {
      mocks.pdfImage(...args);
    }
    output() {
      return new Blob(["pdf"], { type: "application/pdf" });
    }
  },
}));
vi.mock("./exportHeader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./exportHeader")>()),
  drawExportHeader: mocks.draw,
}));
vi.mock("i18next", () => ({ default: { language: "de" } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("react-map-gl/maplibre", async () => {
  const { useMemo } = await import("react");
  return {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one instance, like the real hook
    useControl: (factory: () => unknown) => useMemo(factory, []),
  };
});

import ExportControl, { canHaveHeader, exportFileName, SitrepExportControl } from "./ExportControl";

describe("exportFileName", () => {
  it.each([
    ["Hochwasser", "sitrep-map-Hochwasser"],
    ["Brand Altstadt 2026", "sitrep-map-Brand-Altstadt-2026"],
    ["Übung «Rhone»", "sitrep-map-Übung-«Rhone»"],
    ['A/B: "C"?*<>|', "sitrep-map-A-B-C"],
    ["  Lage   Nord  ", "sitrep-map-Lage-Nord"],
    ["..versteckt..", "sitrep-map-versteckt"],
  ])("makes %j into %j", (name, expected) => {
    expect(exportFileName(name)).toBe(expected);
  });

  it("falls back to the plain prefix without a usable name", () => {
    expect(exportFileName(undefined)).toBe("sitrep-map");
    expect(exportFileName("")).toBe("sitrep-map");
    expect(exportFileName(" /// ")).toBe("sitrep-map");
  });

  it("keeps a very long name to a length a file can have", () => {
    expect(exportFileName("x".repeat(300)).length).toBeLessThanOrEqual("sitrep-map-".length + 80);
  });
});

describe("canHaveHeader", () => {
  it.each([
    ["pdf", false, true],
    ["png", false, true],
    ["jpg", false, true],
    ["webp", false, true],
    ["pdf", true, false],
    ["svg", false, false],
    ["tif", false, false],
  ])("for %s with vector %s: %s", (format, vector, expected) => {
    expect(canHaveHeader({ format, vector })).toBe(expected);
  });
});

type Control = InstanceType<typeof SitrepExportControl>;

const layerState = (kind: "STANDARD" | "MESSAGE_MAP", name: string): LayerState =>
  ({
    layers: [{ layer: { id: "l1", kind, name }, isVisible: true }],
    activeLayer: "l1",
  }) as unknown as LayerState;

function mount(
  options: {
    incident?: string;
    kind?: "STANDARD" | "MESSAGE_MAP";
    layerName?: string;
    asOf?: Date;
    user?: { username: string; name?: string };
  } = {},
) {
  const tree = (o: typeof options): ReactNode => (
    <IncidentContext.Provider
      value={{
        state: { incident: o.incident ? { name: o.incident } : null, loadedForId: "i" } as never,
        dispatch: () => null,
      }}
    >
      <UserContext.Provider
        value={{
          state: { isLoggedin: true, email: "", sub: "s", ...(o.user ?? { username: "user" }) },
          dispatch: () => null,
        }}
      >
        <LayerContext.Provider
          value={{
            state: layerState(o.kind ?? "STANDARD", o.layerName ?? "Lage Nord"),
            dispatch: () => null,
          }}
        >
          <MapTimeContext.Provider value={{ asOf: o.asOf }}>
            <ExportControl />
          </MapTimeContext.Provider>
        </LayerContext.Provider>
      </UserContext.Provider>
    </IncidentContext.Provider>
  );
  const view = render(tree(options));

  return {
    control: () => mocks.controls[0] as Control,
    rerender: (o: typeof options) => view.rerender(tree(o)),
  };
}

/** The name the control offers; `options` is protected in the library. */
const filenameOf = (control: Control) =>
  (control as unknown as { options: { Filename?: string } }).options.Filename;

const settings = (over: Record<string, unknown> = {}) => ({
  size: [420, 297] as [number, number],
  dpi: 300,
  format: "pdf",
  fileName: "sitrep-map-Brand",
  vector: false,
  view: { center: [8, 47] as [number, number], zoom: 15, bearing: 0, pitch: 0 },
  ...over,
});

const exportMap = (control: Control, s: ReturnType<typeof settings>) =>
  (control as unknown as { exportMap: (map: unknown, s: unknown) => Promise<boolean> }).exportMap(
    {},
    s,
  );

const canvas = () => ({
  width: 4961,
  height: 3508,
  toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob(["img"], { type })),
});

beforeEach(() => {
  mocks.controls.length = 0;
  mocks.superExport.mockReset().mockResolvedValue(true);
  mocks.generate.mockReset().mockImplementation(async () => canvas());
  mocks.draw.mockReset();
  mocks.pdfImage.mockReset();
  window.localStorage.clear();
  const click = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    click();
    mocks.saved.push({ name: this.download, type: "" });
  });
  mocks.saved.length = 0;
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
});

describe("ExportControl file name", () => {
  it("offers the name of the incident as the name of the file", () => {
    const view = mount({ incident: "Hochwasser" });

    expect(filenameOf(view.control())).toBe("sitrep-map-Hochwasser");
  });

  it("offers the plain prefix until the incident is known, then the incident's name", () => {
    const view = mount();
    expect(filenameOf(view.control())).toBe("sitrep-map");

    view.rerender({ incident: "Brand" });
    expect(filenameOf(view.control())).toBe("sitrep-map-Brand");
  });

  it("follows the incident in an open dialog while the user has not typed a name of their own", () => {
    const view = mount({ incident: "Brand" });
    // the dialog's state is protected in the library; it is the control's own data here
    const state = { fileName: "sitrep-map-Brand" };
    (view.control() as unknown as { dialogState: typeof state }).dialogState = state;

    view.rerender({ incident: "Brand Nord" });
    expect(state.fileName).toBe("sitrep-map-Brand-Nord");

    state.fileName = "mein-name";
    view.rerender({ incident: "Brand Süd" });
    expect(state.fileName).toBe("mein-name");
  });
});

describe("ExportControl header", () => {
  it("draws the header on the page of a PDF and writes the page into a PDF", async () => {
    const view = mount({
      incident: "Brand",
      layerName: "Lage Nord",
      user: { username: "emuster", name: "Erika Muster" },
      asOf: new Date(2026, 10, 24, 9, 30),
    });

    await expect(exportMap(view.control(), settings())).resolves.toBe(true);

    expect(mocks.superExport).not.toHaveBeenCalled();
    // the page is made as an image, which the header is drawn on
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({ format: "png" });
    const [, header, dpi] = mocks.draw.mock.calls[0];
    expect(dpi).toBe(300);
    expect(header).toMatchObject({
      classification: "intern",
      eventName: "Brand",
      mapTitle: "Lage Nord",
      keeper: "Erika Muster",
      organisation: window.location.hostname,
    });
    expect(header.state).toEqual(new Date(2026, 10, 24, 9, 30));
    expect(header.scale).toBeGreaterThan(0);
    expect(header.text.mapType).toBe("exportHeader.commandMap");
    expect(mocks.pdfImage).toHaveBeenCalledTimes(1);
    expect(mocks.saved[0].name).toBe("sitrep-map-Brand.pdf");
  });

  it("uses the user name when there is no full name, and the Nachrichtenkarte without a title of its own", async () => {
    const view = mount({ kind: "MESSAGE_MAP", layerName: "Nachrichtenkarte" });

    await exportMap(view.control(), settings());

    const [, header] = mocks.draw.mock.calls[0];
    expect(header.keeper).toBe("user");
    expect(header.mapTitle).toBeUndefined();
    expect(header.text.mapType).toBe("exportHeader.messageMap");
  });

  it("writes an image for PNG", async () => {
    const view = mount({ incident: "Brand" });

    await exportMap(view.control(), settings({ format: "png", fileName: "x.png" }));

    expect(mocks.pdfImage).not.toHaveBeenCalled();
    expect(mocks.saved[0].name).toBe("x.png");
  });

  it("leaves the export to the library for what cannot carry the header", async () => {
    const view = mount({ incident: "Brand" });
    const control = view.control();

    await exportMap(control, settings({ format: "svg" }));
    await exportMap(control, settings({ format: "pdf", vector: true }));

    expect(mocks.superExport).toHaveBeenCalledTimes(2);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("leaves it to the library when the header is switched off", async () => {
    window.localStorage.setItem(
      "sitrep.exportHeader",
      JSON.stringify({ enabled: false, classification: "intern" }),
    );
    const view = mount({ incident: "Brand" });

    await exportMap(view.control(), settings());

    expect(mocks.superExport).toHaveBeenCalledTimes(1);
    expect(mocks.draw).not.toHaveBeenCalled();
  });

  it("uses the classification that was chosen", async () => {
    window.localStorage.setItem(
      "sitrep.exportHeader",
      JSON.stringify({ enabled: true, classification: "geheim" }),
    );
    const view = mount({ incident: "Brand" });

    await exportMap(view.control(), settings());

    expect(mocks.draw.mock.calls[0][1].classification).toBe("geheim");
  });

  it("reports a page that could not be made as a failed export", async () => {
    mocks.generate.mockRejectedValue(new Error("no canvas"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const view = mount({ incident: "Brand" });

    await expect(exportMap(view.control(), settings())).resolves.toBe(false);
  });
});
