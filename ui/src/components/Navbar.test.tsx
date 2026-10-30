import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { useBooleanFlagValue } from "@openfeature/react-sdk";
import { IncidentContext, UserContext } from "utils";
import { afterEach, vi } from "vitest";
import Navbar from "./Navbar";

const mockDispatch = vi.fn();

// The build version comes from `git describe`, which is a release tag on a release commit and
// something else everywhere else. Tests must not depend on that, so the version is fixed here.
const build = vi.hoisted(() => ({ version: "v26.10.0" }));
vi.mock("utils/version", async (importOriginal) => ({
  ...(await importOriginal<typeof import("utils/version")>()),
  get CURRENT_VERSION() {
    return build.version;
  },
  CURRENT_SHA: "abc1234",
}));

// Mock the useTranslation hook. LanguageSwitcher reads i18n off the same hook, so the
// mock has to supply it or every render of the navbar throws.
const mockChangeLanguage = vi.fn();
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      resolvedLanguage: "de",
      language: "de",
      changeLanguage: mockChangeLanguage,
    },
  }),
}));

// Mock the useBooleanFlagValue hook
vi.mock("@openfeature/react-sdk", () => ({
  useBooleanFlagValue: vi.fn().mockReturnValue(false),
}));

// Mock the api module — Navbar checks group-management permission for the Administration link.
vi.mock("api", () => ({
  useMyGlobalRoles: vi.fn().mockReturnValue({
    status: "ready",
    data: { grants: [] },
    error: undefined,
    isRefreshing: false,
    refresh: vi.fn(),
  }),
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
  sub: "",
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

      // The incident menu only appears when an incident is active — not rendered here.

      // Check if the user email is rendered
      expect(screen.getAllByText(userState.email)[0]).toBeInTheDocument();
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
      expect(burgerButton).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(burgerButton);
      expect(burgerButton).toHaveAttribute("aria-expanded", "true");

      // Check if the menu is visible (conditionally rendered, not toggled via class)
      const navbarMenu = screen.getByTestId("navbar-menu");
      expect(navbarMenu).toHaveAttribute("id", "navbarBasic");
      expect(navbarMenu).toBeInTheDocument();
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
      expect(screen.getAllByText(userState.email)[0]).toBeInTheDocument();
    });

    it("does not display user email when not logged in", () => {
      const loggedOutState = {
        isLoggedin: false,
        email: "",
        username: "",
        sub: "",
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

  describe("Help links", () => {
    const renderNavbar = () =>
      render(
        <UserContext.Provider value={{ state: userState, dispatch: mockDispatch }}>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<Navbar />} />
            </Routes>
          </MemoryRouter>
        </UserContext.Provider>,
      );

    it("offers the user documentation in the desktop dropdown and the mobile menu", () => {
      renderNavbar();

      const docs = screen.getAllByRole("link", { name: "documentation" });
      expect(docs.length).toBeGreaterThan(0);
      for (const link of docs) {
        expect(link).toHaveAttribute("href", "https://sitrep.ch/docs/user/");
      }
    });

    it("links the version of a release to its entry on the changelog", () => {
      build.version = "v26.10.0";
      renderNavbar();

      for (const link of screen.getAllByRole("link", { name: "v26.10.0" })) {
        expect(link).toHaveAttribute("href", "https://sitrep.ch/changelog/#v26.10.0");
      }
    });

    it("links a dev build to the changelog at its commit", () => {
      build.version = "v26.10.0-64-g136b9bf0";
      renderNavbar();

      for (const link of screen.getAllByRole("link", { name: "v26.10.0-64-g136b9bf0" })) {
        expect(link).toHaveAttribute(
          "href",
          "https://github.com/f-eld-ch/sitrep/blob/abc1234/CHANGELOG.md",
        );
      }
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

      // DarkModeSwitcher renders in both desktop and mobile nav — pick the first
      const darkModeButton = screen.getAllByRole("button", { name: /Light/i })[0];
      fireEvent.click(darkModeButton);

      // Check if the toggle function is called
      expect(mockToggle).toHaveBeenCalled();
    });
  });

  describe("Review entry", () => {
    // Only the flag of the review is on; the others stay off.
    const withFlag = (on: boolean) =>
      vi.mocked(useBooleanFlagValue).mockImplementation((key) => on && key === "incident-review");

    afterEach(() => {
      vi.mocked(useBooleanFlagValue).mockReset();
      vi.mocked(useBooleanFlagValue).mockReturnValue(false);
    });

    const renderAtIncident = () =>
      render(
        <UserContext.Provider value={{ state: userState, dispatch: mockDispatch }}>
          <IncidentContext.Provider
            value={{
              state: { incident: { id: "inc-1", name: "Lage" }, loadedForId: "inc-1" } as never,
              dispatch: vi.fn(),
            }}
          >
            <MemoryRouter initialEntries={["/incident/inc-1/dashboard"]}>
              <Routes>
                <Route path="/incident/:incidentId/*" element={<Navbar />} />
              </Routes>
            </MemoryRouter>
          </IncidentContext.Provider>
        </UserContext.Provider>,
      );

    const reviewLinks = () =>
      screen
        .queryAllByRole("link")
        .filter((a) => a.getAttribute("href") === "/incident/inc-1/review");

    it("is in the incident menu, on desktop and in the mobile menu, with the flag", () => {
      withFlag(true);
      renderAtIncident();

      // The mobile menu only exists once it is opened.
      fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));

      expect(reviewLinks()).toHaveLength(2);
    });

    it("is hidden without the flag, in both menus", () => {
      withFlag(false);
      renderAtIncident();

      fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));

      expect(reviewLinks()).toHaveLength(0);
      // The rest of the incident menu is still there.
      expect(
        screen
          .getAllByRole("link")
          .some((a) => a.getAttribute("href") === "/incident/inc-1/dashboard"),
      ).toBe(true);
    });
  });

  describe("Nachrichtenkarte entry", () => {
    const messageMapPath = "/incident/inc-1/journal/messagemap";

    const renderAtIncident = () =>
      render(
        <UserContext.Provider value={{ state: userState, dispatch: mockDispatch }}>
          <IncidentContext.Provider
            value={{
              state: { incident: { id: "inc-1", name: "Lage" }, loadedForId: "inc-1" } as never,
              dispatch: vi.fn(),
            }}
          >
            <MemoryRouter initialEntries={["/incident/inc-1/map"]}>
              <Routes>
                <Route path="/incident/:incidentId/*" element={<Navbar />} />
              </Routes>
            </MemoryRouter>
          </IncidentContext.Provider>
        </UserContext.Provider>,
      );

    const linksTo = (path: string) =>
      screen.queryAllByRole("link").filter((a) => a.getAttribute("href") === path);

    it("sits under the Lagebild, not under the journal", () => {
      vi.mocked(useBooleanFlagValue).mockReturnValue(true);
      renderAtIncident();

      const [entry] = linksTo(messageMapPath);
      const group = entry.closest(".group") as HTMLElement;

      expect(group).not.toBeNull();
      expect(Array.from(group.querySelectorAll("a")).map((a) => a.getAttribute("href"))).toEqual([
        "/incident/inc-1/map",
        messageMapPath,
      ]);
      expect(group.querySelector('a[href$="/journal/messages"]')).toBeNull();
    });

    it("is not under the journal's menu either", () => {
      vi.mocked(useBooleanFlagValue).mockReturnValue(true);
      renderAtIncident();

      const journal = linksTo("/incident/inc-1/journal/messages")[0].closest(
        ".group",
      ) as HTMLElement;

      expect(journal.querySelector(`a[href="${messageMapPath}"]`)).toBeNull();
    });

    it("is in the mobile menu below the Lagebild", () => {
      vi.mocked(useBooleanFlagValue).mockReturnValue(true);
      renderAtIncident();
      fireEvent.click(screen.getByRole("button", { name: /Toggle menu/i }));

      const mobile = screen.getByTestId("navbar-menu");
      const hrefs = Array.from(mobile.querySelectorAll("a")).map((a) => a.getAttribute("href"));

      expect(hrefs.indexOf(messageMapPath)).toBe(hrefs.indexOf("/incident/inc-1/map") + 1);
    });

    it("is hidden without the flag, and the Lagebild stays a plain link", () => {
      vi.mocked(useBooleanFlagValue).mockReturnValue(false);
      renderAtIncident();

      expect(linksTo(messageMapPath)).toHaveLength(0);
      expect(linksTo("/incident/inc-1/map").length).toBeGreaterThan(0);
    });
  });
});
