import { render, screen, fireEvent } from "@testing-library/react";
import { IncidentCard, IncidentCards } from "./List";
import { vi } from "vitest";
import type { Incident } from "../../types";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock useTranslation
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Mock dayjs
vi.mock("dayjs", () => {
  const actual = vi.importActual("dayjs");
  return {
    __esModule: true,
    default: (_date: string | Date) => ({ format: () => "formatted-date" }),
    ...actual,
  };
});

describe("IncidentCard", () => {
  const baseIncident: Incident = {
    id: "1",
    name: "Test Incident",
    location: { name: "Test Location", id: "loc1", coordinates: "0,0" },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: new Date(0),
    closedAt: new Date(0),
    divisions: [],
    journals: [],
    layers: [],
  };
  const mockCloseIncident = vi.fn();

  it("renders incident name and location", () => {
    render(
      <IncidentCard
        incident={baseIncident}
        closeIncident={mockCloseIncident}
      />,
    );
    expect(screen.getByText("Test Incident")).toBeInTheDocument();
    expect(screen.getByText("Test Location")).toBeInTheDocument();
  });

  it("renders close button when incident is open", () => {
    render(
      <IncidentCard
        incident={{ ...baseIncident, closedAt: null }}
        closeIncident={mockCloseIncident}
      />,
    );
    expect(screen.getByTestId("close-button")).toBeInTheDocument();
    expect(screen.queryByTestId("open-button")).not.toBeInTheDocument();
  });

  it("renders open button when incident is closed", () => {
    render(
      <IncidentCard
        incident={{ ...baseIncident, closedAt: new Date() }}
        closeIncident={mockCloseIncident}
      />,
    );
    expect(screen.getByTestId("open-button")).toBeInTheDocument();
    expect(screen.queryByTestId("close-button")).not.toBeInTheDocument();
  });

  it("calls navigate when enter button is clicked", () => {
    render(
      <IncidentCard
        incident={baseIncident}
        closeIncident={mockCloseIncident}
      />,
    );
    fireEvent.click(screen.getByTestId("enter-button"));
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("calls navigate when edit button is clicked", () => {
    render(
      <IncidentCard
        incident={baseIncident}
        closeIncident={mockCloseIncident}
      />,
    );
    fireEvent.click(screen.getByTestId("edit-button"));
    expect(mockNavigate).toHaveBeenCalled();
  });

  it("calls closeIncident when close button is clicked", () => {
    render(
      <IncidentCard
        incident={{ ...baseIncident, closedAt: null }}
        closeIncident={mockCloseIncident}
      />,
    );
    fireEvent.click(screen.getByTestId("close-button"));
    expect(mockCloseIncident).toHaveBeenCalled();
  });

  it("calls closeIncident when open button is clicked", () => {
    render(
      <IncidentCard
        incident={{ ...baseIncident, closedAt: new Date() }}
        closeIncident={mockCloseIncident}
      />,
    );
    const openButton = screen.getByTestId("open-button");
    fireEvent.click(openButton);
    expect(mockCloseIncident).toHaveBeenCalled();
  });
});

describe("IncidentCards", () => {
  const baseIncident: Incident = {
    id: "1",
    name: "Test Incident",
    location: { name: "Test Location", id: "loc1", coordinates: "0,0" },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: new Date(0),
    closedAt: new Date(0),
    divisions: [],
    journals: [],
    layers: [],
  };
  const mockCloseIncident = vi.fn();

  it("renders multiple IncidentCard components", () => {
    render(
      <IncidentCards
        incidents={[
          baseIncident,
          { ...baseIncident, id: "2", name: "Another Incident" },
        ]}
        closeIncident={mockCloseIncident}
      />,
    );
    expect(screen.getByText("Test Incident")).toBeInTheDocument();
    expect(screen.getByText("Another Incident")).toBeInTheDocument();
    // Assert the number of IncidentCard children by counting a unique test id
    expect(screen.getAllByTestId("edit-button")).toHaveLength(2);
  });
});
