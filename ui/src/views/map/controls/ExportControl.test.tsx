import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncidentContext } from "utils";

const mocks = vi.hoisted(() => ({
  controls: [] as { options: { Filename?: string }; dialogState?: { fileName: string } }[],
}));

vi.mock("@watergis/maplibre-gl-export", () => ({
  Format: { PDF: "pdf" },
  PageOrientation: { Landscape: "landscape" },
  Size: { A3: "a3" },
  MaplibreExportControl: class {
    options: { Filename?: string };
    dialogState?: { fileName: string };
    constructor(options: { Filename?: string }) {
      this.options = options;
      mocks.controls.push(this);
    }
  },
}));
vi.mock("@watergis/maplibre-gl-export/dist/maplibre-gl-export.css", () => ({}));
vi.mock("i18next", () => ({ default: { language: "de" } }));
vi.mock("react-map-gl/maplibre", async () => {
  const { useMemo } = await import("react");
  return {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one instance, like the real hook
    useControl: (factory: () => unknown) => useMemo(factory, []),
  };
});

import ExportControl, { exportFileName } from "./ExportControl";

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

describe("ExportControl", () => {
  beforeEach(() => {
    mocks.controls.length = 0;
  });

  const render_ = (name: string | undefined) => {
    const tree = (n: string | undefined): ReactNode => (
      <IncidentContext.Provider
        value={{
          state: { incident: n ? { name: n } : null, loadedForId: "i" } as never,
          dispatch: () => null,
        }}
      >
        <ExportControl />
      </IncidentContext.Provider>
    );
    const view = render(tree(name));

    return { rerender: (n: string | undefined) => view.rerender(tree(n)) };
  };

  it("offers the name of the incident as the name of the file", () => {
    render_("Hochwasser");

    expect(mocks.controls[0].options.Filename).toBe("sitrep-map-Hochwasser");
  });

  it("offers the plain prefix until the incident is known, then the incident's name", () => {
    const view = render_(undefined);
    expect(mocks.controls[0].options.Filename).toBe("sitrep-map");

    view.rerender("Brand");
    expect(mocks.controls[0].options.Filename).toBe("sitrep-map-Brand");
  });

  it("follows the incident in an open dialog while the user has not typed a name of their own", () => {
    const view = render_("Brand");
    const control = mocks.controls[0];
    control.dialogState = { fileName: "sitrep-map-Brand" };

    view.rerender("Brand Nord");
    expect(control.dialogState.fileName).toBe("sitrep-map-Brand-Nord");

    control.dialogState.fileName = "mein-name";
    view.rerender("Brand Süd");
    expect(control.dialogState.fileName).toBe("mein-name");
  });
});
