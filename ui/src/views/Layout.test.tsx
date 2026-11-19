import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserState } from "types";
import { UserContext } from "../utils/UserContext";
import { Layout, LayoutMarginLess } from "./Layout";

const changeLanguage = vi.hoisted(() => vi.fn());
const useIncidentSync = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage } }),
}));
vi.mock("utils/IncidentContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("utils/IncidentContext")>()),
  useIncidentSync,
}));
vi.mock("utils/ReloadSWPrompt", () => ({ ReloadPrompt: () => <p>reload prompt</p> }));
vi.mock("components", () => ({
  Navbar: () => <nav>navbar</nav>,
  Footer: () => <footer>footer</footer>,
}));
vi.mock("./Login", () => ({ Login: () => <p>login screen</p> }));

const loggedIn: UserState = { isLoggedin: true, username: "a", email: "a@b.c", sub: "s" };
const loggedOut: UserState = { isLoggedin: false, username: "", email: "", sub: "" };

function renderLayout(
  Component: typeof Layout,
  user: UserState,
  url = "/",
  children = <p>page content</p>,
) {
  return render(
    <UserContext.Provider value={{ state: user, dispatch: () => null }}>
      <MemoryRouter initialEntries={[url]}>
        <Component>{children}</Component>
      </MemoryRouter>
    </UserContext.Provider>,
  );
}

describe.each([
  ["Layout", Layout],
  ["LayoutMarginLess", LayoutMarginLess],
])("%s", (_name, Component) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the login screen instead of the page when nobody is logged in", () => {
    renderLayout(Component, loggedOut);

    expect(screen.getByText("login screen")).toBeInTheDocument();
    expect(screen.queryByText("page content")).not.toBeInTheDocument();
    expect(screen.queryByText("navbar")).not.toBeInTheDocument();
  });

  it("wraps the page of a logged-in user in navbar and footer", () => {
    renderLayout(Component, loggedIn);

    expect(screen.getByText("navbar")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.getByText("footer")).toBeInTheDocument();
    expect(screen.queryByText("login screen")).not.toBeInTheDocument();
  });

  it("follows the incident in the route", () => {
    renderLayout(Component, loggedIn);

    expect(useIncidentSync).toHaveBeenCalled();
  });

  it("switches to the language in the url", () => {
    renderLayout(Component, loggedIn, "/?lang=fr");

    expect(changeLanguage).toHaveBeenCalledWith("fr");
  });

  it("falls back to the detected language without a lang parameter", () => {
    renderLayout(Component, loggedIn);

    expect(changeLanguage).toHaveBeenCalledWith(undefined);
  });
});

describe("Layout", () => {
  it("offers the reload prompt to logged-in users only", () => {
    const { unmount } = renderLayout(Layout, loggedIn);
    expect(screen.getByText("reload prompt")).toBeInTheDocument();
    unmount();

    renderLayout(Layout, loggedOut);
    expect(screen.queryByText("reload prompt")).not.toBeInTheDocument();
  });
});
