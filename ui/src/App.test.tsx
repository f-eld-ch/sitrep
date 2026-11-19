import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const i18n = vi.hoisted(() => ({
  language: "de",
  changeLanguage: vi.fn(),
}));
const useDarkMode = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n }),
}));
vi.mock("./tailwind.css", () => ({}));
vi.mock("./i18n", () => ({}));
vi.mock("@apollo/client/react", () => ({
  ApolloProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="apollo">{children}</div>
  ),
}));
vi.mock("client", () => ({ default: {} }));
vi.mock("./FeatureFlags", () => ({
  Provider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("utils", () => ({
  UserProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="user-provider">{children}</div>
  ),
  IncidentContextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("utils/useDarkMode", () => ({ useDarkMode }));
vi.mock("components", () => ({ Spinner: () => <p>spinner</p> }));

// Each screen is tested on its own; here only the routing between them matters.
vi.mock("views/Layout", () => ({
  Layout: ({ children }: { children: ReactNode }) => <div data-layout="padded">{children}</div>,
  LayoutMarginLess: ({ children }: { children: ReactNode }) => (
    <div data-layout="marginless">{children}</div>
  ),
}));
vi.mock("views/ErrorPage", () => ({ ErrorPage: () => <p>error page</p> }));
vi.mock("views/IncidentRoute", async () => {
  const { Outlet } = await import("react-router");
  return { IncidentRoute: () => <Outlet /> };
});
vi.mock("./views/admin", async () => {
  const { Outlet } = await import("react-router");
  return {
    AdminLayout: () => (
      <div>
        admin layout
        <Outlet />
      </div>
    ),
    DefaultAccess: () => <p>default access</p>,
    GlobalRoles: () => <p>global roles</p>,
    GroupDetail: () => <p>group detail</p>,
    Groups: () => <p>groups</p>,
  };
});
vi.mock("views/incident", () => ({
  Editor: () => <p>incident editor</p>,
  Dashboard: () => <p>incident dashboard</p>,
  List: () => <p>incident list</p>,
  New: () => <p>incident new</p>,
  AccessPage: () => <p>incident access</p>,
}));
vi.mock("views/journal", () => ({
  List: () => <p>journal messages</p>,
  TriageView: () => <p>journal triage</p>,
}));
vi.mock("views/journal/Editor", () => ({ default: () => <p>journal editor</p> }));
vi.mock("views/journal/MessageMapView", () => ({ default: () => <p>message map</p> }));
vi.mock("views/map/LagebildView", () => ({ default: () => <p>lagebild</p> }));
vi.mock("views/measures/immediateMeasures", () => ({ List: () => <p>immediate measures</p> }));
vi.mock("views/measures/requests", () => ({ List: () => <p>requests</p> }));
vi.mock("views/measures/tasks", () => ({ List: () => <p>tasks</p> }));
vi.mock("views/resource", () => ({ List: () => <p>resources</p> }));
vi.mock("views/casualties", () => ({ List: () => <p>casualties</p> }));
vi.mock("views/review", () => ({ Review: () => <p>review</p> }));

/**
 * The router is created when the module is first evaluated and reads the browser location then,
 * so each test sets the url first and loads a fresh copy of the app.
 */
async function renderAt(path: string) {
  window.history.pushState({}, "", path);
  vi.resetModules();
  const { default: App } = await import("./App");
  return render(<App />);
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18n.language = "de";
  });

  it.each([
    ["/", "incident list"],
    ["/incident/list", "incident list"],
    ["/incident/new", "incident new"],
    ["/incident/i1", "incident dashboard"],
    ["/incident/i1/dashboard", "incident dashboard"],
    ["/incident/i1/edit", "incident editor"],
    ["/incident/i1/access", "incident access"],
    ["/incident/i1/resources", "resources"],
    ["/incident/i1/casualties", "casualties"],
    ["/incident/i1/review", "review"],
    ["/incident/i1/map", "lagebild"],
    ["/incident/i1/tasks", "tasks"],
    ["/incident/i1/requests", "requests"],
    ["/incident/i1/soma", "immediate measures"],
    ["/incident/i1/journal", "journal editor"],
    ["/incident/i1/journal/view", "journal editor"],
    ["/incident/i1/journal/edit", "journal editor"],
    ["/incident/i1/journal/messages", "journal messages"],
    ["/incident/i1/journal/messagemap", "message map"],
    ["/incident/i1/journal/triage", "journal triage"],
    ["/admin/access", "groups"],
    ["/admin/access/groups", "groups"],
    ["/admin/access/groups/g1", "group detail"],
    ["/admin/access/global-roles", "global roles"],
    ["/admin/access/default-access", "default access"],
  ])("routes %s to %s", async (path, screenText) => {
    await renderAt(path);

    expect(await screen.findByText(screenText)).toBeInTheDocument();
  });

  it.each([
    ["/incident/list", "padded"],
    ["/incident/i1/review", "padded"],
    ["/incident/i1/dashboard", "marginless"],
    ["/incident/i1/map", "marginless"],
    ["/incident/i1/journal/triage", "marginless"],
    ["/incident/i1/journal/messagemap", "marginless"],
  ])("renders %s in the %s layout", async (path, layout) => {
    const { container } = await renderAt(path);

    await screen.findByText(/./);
    await vi.waitFor(() =>
      expect(container.querySelector(`[data-layout="${layout}"]`)).not.toBeNull(),
    );
    expect(container.querySelector("[data-layout]")).toHaveAttribute("data-layout", layout);
  });

  it("shows the error page for an unknown url", async () => {
    await renderAt("/nowhere/at/all");

    expect(await screen.findByText("error page")).toBeInTheDocument();
  });

  it("wraps the screens in the user and api providers", async () => {
    await renderAt("/incident/list");

    const user = await screen.findByTestId("user-provider");
    expect(user).toContainElement(screen.getByTestId("apollo"));
    expect(screen.getByTestId("apollo")).toContainElement(screen.getByText("incident list"));
  });

  it("applies the stored theme and detects the language", async () => {
    await renderAt("/incident/list");

    expect(useDarkMode).toHaveBeenCalled();
    expect(i18n.changeLanguage).toHaveBeenCalledWith();
  });

  it.each([
    ["de", "de"],
    ["fr", "fr"],
    ["it", "it"],
    ["en", "en"],
    ["pt", "en"],
  ])("sets the date locale for the language %s to %s", async (language, expected) => {
    i18n.language = language;
    await renderAt("/incident/list");

    await vi.waitFor(() => expect(dayjs.locale()).toBe(expected));
  });
});
