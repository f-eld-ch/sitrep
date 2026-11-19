import { act, render, screen } from "@testing-library/react";
import { useContext } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResult } from "api/result";
import { errorResult, loadingResult, readyResult } from "api/testing/results";
import type { Incident } from "types";
import {
  IncidentContext,
  IncidentContextProvider,
  IncidentContextSetter,
  useIncidentSync,
} from "./IncidentContext";

const useIncidentDetails = vi.hoisted(() => vi.fn());
vi.mock("api", () => ({ useIncidentDetails }));

const incident = (id: string) => ({ id, name: `incident ${id}` }) as unknown as Incident;
const details = (id: string) => readyResult({ incident: incident(id) });
const failure = (code: string) =>
  errorResult({ code, message: code } as unknown as Parameters<typeof errorResult>[0]);

function Reader() {
  const { state } = useContext(IncidentContext);
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="incident">{state.incident?.id ?? "none"}</span>
      <span data-testid="loadedFor">{state.loadedForId ?? "none"}</span>
      <button type="button" onClick={() => navigate("/incident/2")}>
        next
      </button>
      <button type="button" onClick={() => navigate("/")}>
        leave
      </button>
    </div>
  );
}

function Sync() {
  useIncidentSync();
  return null;
}

const renderAt = (path: string, sync = <Sync />) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <IncidentContextProvider>
        <Routes>
          <Route path="/incident/:incidentId" element={sync} />
          <Route path="*" element={sync} />
        </Routes>
        <Reader />
      </IncidentContextProvider>
    </MemoryRouter>,
  );

const incidentText = () => screen.getByTestId("incident").textContent;
const loadedFor = () => screen.getByTestId("loadedFor").textContent;

beforeEach(() => {
  useIncidentDetails.mockReset().mockReturnValue(loadingResult());
});

describe("IncidentContext", () => {
  it("has no incident by default", () => {
    render(<Reader />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    expect(incidentText()).toBe("none");
    expect(loadedFor()).toBe("none");
  });
});

describe("useIncidentSync", () => {
  it("looks the incident up by the id in the URL", () => {
    renderAt("/incident/1");
    expect(useIncidentDetails).toHaveBeenCalledWith("1");
  });

  it("shares the loaded incident through the context", () => {
    useIncidentDetails.mockReturnValue(details("1"));
    renderAt("/incident/1");
    expect(incidentText()).toBe("1");
    expect(loadedFor()).toBe("1");
  });

  it("does nothing while the incident is loading", () => {
    renderAt("/incident/1");
    expect(incidentText()).toBe("none");
    expect(loadedFor()).toBe("none");
  });

  it.each(["NOT_FOUND", "FORBIDDEN", "NETWORK"])(
    "marks an incident that fails to load with %s as absent, remembering which one it tried",
    (code) => {
      useIncidentDetails.mockReturnValue(failure(code));
      renderAt("/incident/1");
      expect(incidentText()).toBe("none");
      expect(loadedFor()).toBe("1");
    },
  );

  it("clears the incident when the URL has no incident id", () => {
    useIncidentDetails.mockReturnValue(details("1"));
    renderAt("/incident/1");
    expect(incidentText()).toBe("1");
    act(() => screen.getByText("leave").click());
    expect(incidentText()).toBe("none");
    expect(loadedFor()).toBe("none");
  });

  it("switches to another incident once it has loaded", () => {
    useIncidentDetails.mockImplementation((id: string) => details(id));
    renderAt("/incident/1");
    expect(incidentText()).toBe("1");
    act(() => screen.getByText("next").click());
    expect(incidentText()).toBe("2");
    expect(loadedFor()).toBe("2");
  });

  it("keeps the loaded incident when a refetch of it fails", () => {
    let result: QueryResult<{ incident: Incident }> = details("1");
    useIncidentDetails.mockImplementation(() => result);
    const { rerender } = renderAt("/incident/1");
    expect(incidentText()).toBe("1");

    result = failure("NETWORK") as typeof result;
    rerender(
      <MemoryRouter initialEntries={["/incident/1"]}>
        <IncidentContextProvider>
          <Routes>
            <Route path="/incident/:incidentId" element={<Sync />} />
          </Routes>
          <Reader />
        </IncidentContextProvider>
      </MemoryRouter>,
    );
    // a transient failure of the incident already on screen must not blank the page
    expect(incidentText()).toBe("1");
  });

  it("drops the loaded incident when another one fails to load", () => {
    useIncidentDetails.mockImplementation((id: string) =>
      id === "1" ? details("1") : failure("NOT_FOUND"),
    );
    renderAt("/incident/1");
    expect(incidentText()).toBe("1");
    act(() => screen.getByText("next").click());
    expect(incidentText()).toBe("none");
    expect(loadedFor()).toBe("2");
  });
});

describe("IncidentContextSetter", () => {
  it("syncs the incident like the hook does", () => {
    useIncidentDetails.mockReturnValue(details("1"));
    renderAt("/incident/1", <IncidentContextSetter />);
    expect(incidentText()).toBe("1");
  });
});
