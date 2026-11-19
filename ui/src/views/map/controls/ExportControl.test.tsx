import { render } from "@testing-library/react";
import i18next from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExportControl from "./ExportControl";

const mocks = vi.hoisted(() => ({
  created: [] as unknown[],
  useControl: vi.fn(),
}));

vi.mock("@watergis/maplibre-gl-export", () => ({
  Format: { PDF: "pdf" },
  PageOrientation: { Landscape: "landscape" },
  Size: { A3: [420, 297] },
  MaplibreExportControl: class {
    constructor(options: unknown) {
      mocks.created.push(options);
    }
  },
}));
vi.mock("@watergis/maplibre-gl-export/dist/maplibre-gl-export.css", () => ({}));
vi.mock("react-map-gl/maplibre", () => ({
  useControl: (factory: () => unknown, options: unknown) => {
    mocks.useControl(options);
    factory();
  },
}));

describe("ExportControl", () => {
  beforeEach(() => {
    mocks.created = [];
    mocks.useControl.mockClear();
  });

  it("renders nothing itself and adds the control at the requested position", () => {
    const { container } = render(<ExportControl position="top-left" />);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.useControl).toHaveBeenCalledWith({ position: "top-left" });
  });

  it("prints an A3 landscape PDF at 300 dpi", () => {
    render(<ExportControl />);

    expect(mocks.created[0]).toMatchObject({
      PageSize: [420, 297],
      PageOrientation: "landscape",
      Format: "pdf",
      DPI: 300,
    });
  });

  it.each([
    ["de", "de"],
    ["fr", "fr"],
    ["it", "en"],
    ["en", "en"],
  ])("offers the export dialog in the language for %s", (language, expected) => {
    i18next.language = language;

    render(<ExportControl />);

    expect(mocks.created[0]).toMatchObject({ Local: expected });
  });
});
