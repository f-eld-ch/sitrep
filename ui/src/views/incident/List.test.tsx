import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import type { Incident } from "../../types";
import { IncidentCard, IncidentCards } from "./List";

const mockFlag = vi.hoisted(() => ({ review: false }));
vi.mock("@openfeature/react-sdk", () => ({
  useBooleanFlagValue: (key: string) => key === "incident-review" && mockFlag.review,
}));

const mockNavigate = vi.fn();
vi.mock("react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
    deletedAt: null,
    closedAt: null,
    parentId: null,
    canWrite: true,
    canManage: true,
    canDelete: true,
    canManageAccess: true,
    accessMode: "OPEN_OPERATIONAL" as const,
    divisions: [],
    childIncidents: [],
    layers: [],
  };
  const mockCloseIncident = vi.fn();
  const mockReopenIncident = vi.fn();
  const mockDeleteIncident = vi.fn();

  it("renders incident name and location", () => {
    render(
      <IncidentCard
        incident={baseIncident}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
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
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    expect(screen.getByTestId("close-button")).toBeInTheDocument();
    expect(screen.queryByTestId("open-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("delete-button")).not.toBeInTheDocument();
  });

  it("renders open button when incident is closed", () => {
    render(
      <IncidentCard
        incident={{ ...baseIncident, closedAt: new Date() }}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    expect(screen.getByTestId("open-button")).toBeInTheDocument();
    expect(screen.queryByTestId("close-button")).not.toBeInTheDocument();
  });

  it("renders delete button when incident is closed", () => {
    render(
      <IncidentCard
        incident={{ ...baseIncident, closedAt: new Date() }}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    expect(screen.getByTestId("open-button")).toBeInTheDocument();
    expect(screen.queryByTestId("delete-button")).toBeInTheDocument();
  });

  it("calls navigate when enter button is clicked", () => {
    render(
      <IncidentCard
        incident={baseIncident}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    fireEvent.click(screen.getByTestId("enter-button"));
    expect(mockNavigate).toHaveBeenCalled();
  });

  describe("review link", () => {
    const renderCard = (closedAt: Date | null) =>
      render(
        <IncidentCard
          incident={{ ...baseIncident, closedAt }}
          closeIncident={mockCloseIncident}
          reopenIncident={mockReopenIncident}
          deleteIncident={mockDeleteIncident}
        />,
      );

    afterEach(() => {
      mockFlag.review = false;
    });

    it("links the review of a closed incident, with the flag", () => {
      mockFlag.review = true;
      renderCard(new Date());

      fireEvent.click(screen.getByTestId("review-button"));
      expect(mockNavigate).toHaveBeenLastCalledWith(`../${baseIncident.id}/review`);
    });

    it("has none for an open incident, flag or not", () => {
      mockFlag.review = true;
      renderCard(null);

      expect(screen.queryByTestId("review-button")).not.toBeInTheDocument();
    });

    it("is hidden without the flag, also for a closed incident", () => {
      mockFlag.review = false;
      renderCard(new Date());

      expect(screen.queryByTestId("review-button")).not.toBeInTheDocument();
      // The other actions of a closed incident are not affected.
      expect(screen.getByTestId("open-button")).toBeInTheDocument();
    });
  });

  it("calls navigate when edit button is clicked", () => {
    render(
      <IncidentCard
        incident={baseIncident}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
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
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    fireEvent.click(screen.getByTestId("close-button"));
    expect(mockCloseIncident).toHaveBeenCalled();
  });

  it("calls reopenIncident when open button is clicked", () => {
    render(
      <IncidentCard
        incident={{ ...baseIncident, closedAt: new Date() }}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    const openButton = screen.getByTestId("open-button");
    fireEvent.click(openButton);
    expect(mockReopenIncident).toHaveBeenCalled();
  });
});

describe("IncidentCards", () => {
  const baseIncident: Incident = {
    id: "1",
    name: "Test Incident",
    location: { name: "Test Location", id: "loc1", coordinates: "0,0" },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    closedAt: null,
    parentId: null,
    canWrite: true,
    canManage: true,
    canDelete: true,
    canManageAccess: true,
    accessMode: "OPEN_OPERATIONAL" as const,
    divisions: [],
    childIncidents: [],
    layers: [],
  };
  const mockCloseIncident = vi.fn();
  const mockReopenIncident = vi.fn();
  const mockDeleteIncident = vi.fn();

  it("renders multiple IncidentCard components", () => {
    render(
      <IncidentCards
        incidents={[baseIncident, { ...baseIncident, id: "2", name: "Another Incident" }]}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    expect(screen.getByText("Test Incident")).toBeInTheDocument();
    expect(screen.getByText("Another Incident")).toBeInTheDocument();
    expect(screen.getAllByTestId("edit-button")).toHaveLength(2);
  });

  it("renders only non-deleted IncidentCard components", () => {
    render(
      <IncidentCards
        incidents={[
          baseIncident,
          { ...baseIncident, id: "2", name: "Another Incident", deletedAt: new Date() },
        ]}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    expect(screen.getByText("Test Incident")).toBeInTheDocument();
    expect(screen.getAllByTestId("edit-button")).toHaveLength(1);
  });

  it("nests children under their parent", () => {
    render(
      <IncidentCards
        incidents={[baseIncident, { ...baseIncident, id: "2", name: "Child", parentId: "1" }]}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    expect(screen.getByText("Test Incident")).toBeInTheDocument();
    expect(screen.getByText("Child")).toBeInTheDocument();
  });

  it("renders orphaned child incidents only once", () => {
    render(
      <IncidentCards
        incidents={[{ ...baseIncident, id: "2", name: "Child", parentId: "missing-parent" }]}
        closeIncident={mockCloseIncident}
        reopenIncident={mockReopenIncident}
        deleteIncident={mockDeleteIncident}
      />,
    );
    expect(screen.getAllByText("Child")).toHaveLength(1);
  });
});
