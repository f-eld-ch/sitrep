import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Incident, Journal } from "types";
import { IncidentContext, UserContext } from "utils";
import { vi } from "vitest";
import Navbar from "./Navbar";

const mockDispatch = vi.fn();

// Mock the useTranslation hook
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock the useBooleanFlagValue hook
vi.mock("@openfeature/react-sdk", () => ({
  useBooleanFlagValue: vi.fn().mockReturnValue(false),
}));

// Mock the useDate hook
vi.mock("../utils/useDate", () => ({
  useDate: () => ({
    time: "12:00 PM",
    date: "2023-10-01",
  }),
}));

// Mock the useDarkMode hook
const mockToggle = vi.fn();
vi.mock("../utils/useDarkMode", () => ({
  useDarkMode: () => ({
    isDarkMode: false,
    toggle: mockToggle,
  }),
}));

const userState = {
  isLoggedin: true,
  email: "test@example.com",
  username: "testuser",
};

describe("Navbar Component", () => {
  describe("Rendering", () => {
    it("renders the Navbar component", () => {
      render(
        <UserContext.Provider value={{ state: userState, dispatch: mockDispatch }}>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<Navbar />} />
            </Routes>
          </MemoryRouter>
        </UserContext.Provider>,
      );

      // Check if the logo is rendered
      expect(screen.getByAltText("Logo")).toBeInTheDocument();

      // Check if the incident link is rendered
      expect(screen.getByText("incident")).toBeInTheDocument();

      // Check if the user email is rendered
      expect(screen.getByText(userState.email)).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("toggles the menu when the burger button is clicked", () => {
      render(
        <UserContext.Provider value={{ state: userState, dispatch: mockDispatch }}>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<Navbar />} />
            </Routes>
          </MemoryRouter>
        </UserContext.Provider>,
      );

      const burgerButton = screen.getByRole("button", { name: /Toggle menu/i });
      expect(burgerButton).toHaveAttribute("aria-controls", "navbarBasic");
      expect(burgerButton).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(burgerButton);
      expect(burgerButton).toHaveAttribute("aria-expanded", "true");

      // Check if the menu is active
      const navbarMenu = screen.getByTestId("navbar-menu");
      expect(navbarMenu).toHaveAttribute("id", "navbarBasic");
      expect(navbarMenu).toHaveClass("is-active");
    });

    it("renders translated journal feed label", () => {
      render(
        <UserContext.Provider value={{ state: userState, dispatch: mockDispatch }}>
          <IncidentContext.Provider
            value={{
              state: {
                incident: { id: "incident-id", name: "Incident Name" } as Incident,
                journal: { id: "journal-id", name: "Journal Name" } as Journal,
              },
              dispatch: mockDispatch,
            }}
          >
            <MemoryRouter initialEntries={["/incident/incident-id/journal/journal-id"]}>
              <Routes>
                <Route
                  path="/incident/:incidentId/journal/:journalId"
                  element={<Navbar />}
                />
              </Routes>
            </MemoryRouter>
          </IncidentContext.Provider>
        </UserContext.Provider>,
      );

      expect(screen.getByText("journalFeed")).toBeInTheDocument();
      expect(screen.getByText(/journal Journal Name/)).toBeInTheDocument();
    });
  });

  describe("User Context", () => {
    it("displays user email when logged in", () => {
      render(
        <UserContext.Provider value={{ state: userState, dispatch: mockDispatch }}>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<Navbar />} />
            </Routes>
          </MemoryRouter>
        </UserContext.Provider>,
      );

      // Check if the user email is rendered
      expect(screen.getByText(userState.email)).toBeInTheDocument();
    });

    it("does not display user email when not logged in", () => {
      const loggedOutState = {
        isLoggedin: false,
        email: "",
        username: "",
      };

      render(
        <UserContext.Provider value={{ state: loggedOutState, dispatch: mockDispatch }}>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<Navbar />} />
            </Routes>
          </MemoryRouter>
        </UserContext.Provider>,
      );

      // Check if the user email is not rendered
      expect(screen.queryByText(userState.email)).not.toBeInTheDocument();
    });
  });

  describe("Dark Mode", () => {
    it("toggles dark mode when the button is clicked", () => {
      render(
        <UserContext.Provider value={{ state: userState, dispatch: mockDispatch }}>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<Navbar />} />
            </Routes>
          </MemoryRouter>
        </UserContext.Provider>,
      );

      const darkModeButton = screen.getByRole("button", { name: /Light/i });
      fireEvent.click(darkModeButton);

      // Check if the toggle function is called
      expect(mockToggle).toHaveBeenCalled();
    });
  });
});
