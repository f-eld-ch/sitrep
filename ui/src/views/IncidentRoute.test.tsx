import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter, useRouteError } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIncidentDetails } from "api";
import { ApiError } from "api/errors";
import { errorResult, loadingResult, readyResult } from "api/testing/results";
import type { Incident } from "types";
import { IncidentContextProvider } from "utils";
import { IncidentRoute } from "./IncidentRoute";

vi.mock("api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("api")>()),
  useIncidentDetails: vi.fn(),
}));

const incident = { id: "inc-1", name: "Hauptereignis" } as Incident;

function RouteError() {
  const error = useRouteError() as Response;
  return <p>route error {error.status}</p>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/incident/:incidentId",
        element: <IncidentRoute />,
        errorElement: <RouteError />,
        children: [{ index: true, element: <p>incident page</p> }],
      },
    ],
    { initialEntries: [path] },
  );
  const view = render(
    <IncidentContextProvider>
      <RouterProvider router={router} />
    </IncidentContextProvider>,
  );
  return { ...view, router };
}

describe("IncidentRoute", () => {
  beforeEach(() => {
    // React logs a thrown route error; the router catches it and renders the errorElement.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows a spinner and not the page while the incident loads", () => {
    vi.mocked(useIncidentDetails).mockReturnValue(loadingResult());
    const { container } = renderAt("/incident/inc-1");

    expect(container.querySelector(".fa-spin")).toBeInTheDocument();
    expect(screen.queryByText("incident page")).not.toBeInTheDocument();
  });

  it("renders the nested route once the incident is loaded", async () => {
    vi.mocked(useIncidentDetails).mockReturnValue(readyResult({ incident }));
    renderAt("/incident/inc-1");

    expect(await screen.findByText("incident page")).toBeInTheDocument();
  });

  it("turns a failed load of an incident into a 404 route error", async () => {
    vi.mocked(useIncidentDetails).mockReturnValue(errorResult(new ApiError("NOT_FOUND")));
    renderAt("/incident/inc-1");

    expect(await screen.findByText("route error 404")).toBeInTheDocument();
    expect(screen.queryByText("incident page")).not.toBeInTheDocument();
  });
});
