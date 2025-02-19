import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { UserContext } from "utils";
import Navbar from "./Navbar";
import { vi } from "vitest";

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
      fireEvent.click(burgerButton);

      // Check if the menu is active
      const navbarMenu = screen.getByTestId("navbar-menu");
      expect(navbarMenu).toHaveClass("is-active");
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
