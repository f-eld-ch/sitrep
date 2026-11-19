import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapStyleProvider, MapStyles, StyleController, useMapStyle } from "./StyleController";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const available = vi.hoisted(() => ({ value: true }));
vi.mock("./satelliteAvailability", () => ({ useSatelliteAvailable: () => available.value }));

function Selected() {
  return <output>{useMapStyle().selectedStyle.name}</output>;
}

const renderController = () =>
  render(
    <MapStyleProvider>
      <StyleController />
      <Selected />
    </MapStyleProvider>,
  );

describe("StyleController", () => {
  beforeEach(() => {
    available.value = true;
  });

  it("opens the list of maps and closes it again without changing the map", () => {
    renderController();

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("styleController.maps")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.queryByText("styleController.maps")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(MapStyles[0].name);
  });

  it("selects a map and closes the list", () => {
    renderController();
    fireEvent.click(screen.getByRole("button"));

    fireEvent.click(screen.getByText("styleController.Satellit"));

    expect(screen.getByRole("status")).toHaveTextContent("Satellit");
    expect(screen.queryByText("styleController.maps")).not.toBeInTheDocument();
  });

  it("falls back to the base map when the satellite map becomes unavailable", () => {
    const { rerender } = renderController();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("styleController.Satellit"));
    expect(screen.getByRole("status")).toHaveTextContent("Satellit");

    available.value = false;
    rerender(
      <MapStyleProvider>
        <StyleController />
        <Selected />
      </MapStyleProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Basiskarte");
  });
});
