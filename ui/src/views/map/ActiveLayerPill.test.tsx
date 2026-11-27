import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import type { Layer } from "types/layer";
import { ActiveLayerPill } from "./ActiveLayerPill";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language: "de" } }),
}));

const layer = (overrides: Partial<Layer>) =>
  ({
    id: "l1",
    name: "Lage Nord",
    kind: "STANDARD",
    sourceIncidentId: "inc-1",
    sourceIncidentName: "Bergsturz",
    ...overrides,
  }) as Layer;

function renderPill(l: Layer, readOnly: boolean) {
  return render(
    <MemoryRouter initialEntries={["/incident/inc-1"]}>
      <Routes>
        <Route
          path="/incident/:incidentId"
          element={<ActiveLayerPill layer={l} readOnly={readOnly} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActiveLayerPill", () => {
  it("names the layer, with the Nachrichtenkarte translated", () => {
    renderPill(layer({}), false);
    expect(screen.getByText("Lage Nord")).toBeInTheDocument();

    renderPill(layer({ kind: "MESSAGE_MAP", name: "Nachrichtenkarte" }), true);
    expect(screen.getByText("Nachrichtenkarte")).toBeInTheDocument();
  });

  it("marks a layer that cannot be drawn on, and only that", () => {
    const { container, rerender } = renderPill(layer({}), false);
    expect(container.querySelector("[title]")).toBeNull();

    rerender(
      <MemoryRouter initialEntries={["/incident/inc-1"]}>
        <Routes>
          <Route
            path="/incident/:incidentId"
            element={<ActiveLayerPill layer={layer({})} readOnly />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTitle("Nur zum Ansehen")).toBeInTheDocument();
  });
});
