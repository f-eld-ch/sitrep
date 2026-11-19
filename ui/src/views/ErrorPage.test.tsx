import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import de from "../i18n/locales/de/translations.json";
import fr from "../i18n/locales/fr/translations.json";
import it_ from "../i18n/locales/it/translations.json";
import { ErrorPage } from "./ErrorPage";

// The real locale files, so a missing translation fails the test.
const locales: Record<string, unknown> = { de, fr, it: it_ };
let language = "de";

function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      locales[language],
    );
  return typeof value === "string" ? value : key;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language } }),
}));
vi.mock("components", () => ({ Navbar: () => <nav>navbar</nav> }));

/** Renders the error page as the error element of a route whose loader throws `thrown`. */
function renderError(thrown: unknown, extra: { initial?: string[] } = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <p>home page</p>,
      },
      {
        path: "/broken",
        loader: () => {
          throw thrown;
        },
        element: <p>never shown</p>,
        HydrateFallback: () => null,
        errorElement: <ErrorPage />,
      },
    ],
    {
      initialEntries: extra.initial ?? ["/", "/broken"],
      initialIndex: (extra.initial ?? ["/", "/broken"]).length - 1,
    },
  );
  render(<RouterProvider router={router} />);
  return router;
}

// The first render of the route error element can be slow while the whole suite runs in parallel.
const SLOW = { timeout: 10_000 };

const fieldValue = (label: string) =>
  screen.getByText(label).closest("div")?.querySelector("dd")?.textContent;

describe("ErrorPage", () => {
  beforeEach(() => {
    language = "de";
  });

  it("explains a 404 as an unreachable target", async () => {
    renderError(new Response("", { status: 404, statusText: "Not Found" }));

    expect(await screen.findByText(de.errorPage.notFoundTitle, undefined, SLOW)).toBeVisible();
    expect(screen.getByText(de.errorPage.notFoundDesc)).toBeInTheDocument();
    expect(screen.getByText("#404")).toBeInTheDocument();
    expect(fieldValue(de.errorPage.fieldStatus)).toBe("Not Found");
  });

  it("falls back to the status code when the response has no status text", async () => {
    renderError(new Response("", { status: 404 }));

    await screen.findByText(de.errorPage.notFoundTitle, undefined, SLOW);
    expect(fieldValue(de.errorPage.fieldStatus)).toBe("404");
  });

  it("shows the detail of another error response", async () => {
    renderError(new Response("Kaputt", { status: 500, statusText: "Server Error" }));

    expect(await screen.findByText(de.errorPage.title, undefined, SLOW)).toBeVisible();
    expect(screen.getByText("#500")).toBeInTheDocument();
    expect(screen.getByText("Kaputt")).toBeInTheDocument();
  });

  it("falls back to the unknown-error text for an error response without a body", async () => {
    renderError(new Response("", { status: 503, statusText: "Unavailable" }));

    await screen.findByText(de.errorPage.title, undefined, SLOW);
    expect(screen.getByText(de.errorPage.unknown)).toBeInTheDocument();
  });

  it("shows the name and message of a thrown Error", async () => {
    renderError(new TypeError("cannot read x"));

    await screen.findByText(de.errorPage.title, undefined, SLOW);
    expect(screen.getByText("cannot read x")).toBeInTheDocument();
    expect(fieldValue(de.errorPage.fieldStatus)).toBe("TypeError");
    expect(screen.queryByText(/^#/)).not.toBeInTheDocument();
  });

  it("shows the generic text for anything else that was thrown", async () => {
    renderError("just a string");

    await screen.findByText(de.errorPage.unknown, undefined, SLOW);
    expect(fieldValue(de.errorPage.fieldStatus)).toBe(de.errorPage.title);
  });

  it.each([
    ["de", de],
    ["fr", fr],
    ["it", it_],
  ])("is translated into %s", async (lang, texts) => {
    language = lang;
    renderError(new Response("", { status: 404 }));

    expect(await screen.findByText(texts.errorPage.notFoundTitle, undefined, SLOW)).toBeVisible();
    expect(screen.getByText(texts.errorPage.footer)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: texts.errorPage.goBack })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: texts.errorPage.goHome })).toBeInTheDocument();
  });

  it("shows the navbar and the current path", async () => {
    renderError(new Error("x"));

    await screen.findByText(de.errorPage.title, undefined, SLOW);
    expect(screen.getByText("navbar")).toBeInTheDocument();
    expect(fieldValue(de.errorPage.fieldLocation)).toBe(window.location.pathname);
  });

  it("goes back to the previous page", async () => {
    const router = renderError(new Error("x"));

    fireEvent.click(await screen.findByText(de.errorPage.goBack, undefined, SLOW));

    expect(await screen.findByText("home page", undefined, SLOW)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("goes to the start page", async () => {
    const router = renderError(new Error("x"), { initial: ["/broken"] });

    fireEvent.click(await screen.findByText(de.errorPage.goHome, undefined, SLOW));

    expect(await screen.findByText("home page", undefined, SLOW)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
