import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapPanel, MapPanelBlock, MapPanelTabs } from "./MapPanel";

describe("MapPanel", () => {
  it("shows its title and content and closes with the close button", () => {
    const onClose = vi.fn();
    render(
      <MapPanel title="Layer" onClose={onClose}>
        <p>Inhalt</p>
      </MapPanel>,
    );

    expect(screen.getByText("Layer")).toBeInTheDocument();
    expect(screen.getByText("Inhalt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("MapPanelTabs", () => {
  const tabs = [
    { key: "drawing", label: "Zeichnung" },
    { key: "wms", label: "WMS" },
  ];

  it("reports the tab that is clicked", () => {
    const onChange = vi.fn();
    render(<MapPanelTabs tabs={tabs} activeTab="drawing" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "WMS" }));

    expect(onChange).toHaveBeenCalledWith("wms");
  });

  it("marks only the active tab", () => {
    render(<MapPanelTabs tabs={tabs} activeTab="wms" onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "WMS" }).className).toContain("bg-primary");
    expect(screen.getByRole("button", { name: "Zeichnung" }).className).not.toContain(
      "bg-primary ",
    );
  });
});

describe("MapPanelBlock", () => {
  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<MapPanelBlock onClick={onClick}>Basiskarte</MapPanelBlock>);

    fireEvent.click(screen.getByText("Basiskarte"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is not clickable when disabled, and says so", () => {
    const onClick = vi.fn();
    render(
      <MapPanelBlock onClick={onClick} disabled title="Offline nicht verfügbar">
        Satellit
      </MapPanelBlock>,
    );

    fireEvent.click(screen.getByText("Satellit"));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByTitle("Offline nicht verfügbar")).toHaveAttribute("aria-disabled", "true");
  });

  it("does not claim to be disabled otherwise", () => {
    render(<MapPanelBlock>Basiskarte</MapPanelBlock>);

    expect(screen.getByText("Basiskarte")).not.toHaveAttribute("aria-disabled");
  });
});
