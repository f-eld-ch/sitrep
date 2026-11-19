import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import de from "../../../i18n/locales/de/translations.json";
import LayerControl from "./LayerControl";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: lookup }) }));
vi.mock("./ActiveLayersControl", () => ({ default: () => <div>drawing layers</div> }));
vi.mock("./WMSLayerMenu", () => ({ default: () => <div>wms layers</div> }));

describe("LayerControl", () => {
  it("is a single button until it is opened", () => {
    render(<LayerControl />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("drawing layers")).not.toBeInTheDocument();
  });

  it("opens on the drawing layers", () => {
    render(<LayerControl />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Layer")).toBeInTheDocument();
    expect(screen.getByText("drawing layers")).toBeInTheDocument();
    expect(screen.queryByText("wms layers")).not.toBeInTheDocument();
  });

  it("switches to the WMS layers and back", () => {
    render(<LayerControl />);
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByRole("button", { name: "WMS-Layer" }));
    expect(screen.getByText("wms layers")).toBeInTheDocument();
    expect(screen.queryByText("drawing layers")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zeichnungs-Layer" }));
    expect(screen.getByText("drawing layers")).toBeInTheDocument();
  });

  it("collapses again with the close button", () => {
    render(<LayerControl />);
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.queryByText("drawing layers")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
