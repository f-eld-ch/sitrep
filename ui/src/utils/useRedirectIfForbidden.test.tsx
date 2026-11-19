import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import type { ApiError } from "api";
import { useRedirectIfForbidden } from "./useRedirectIfForbidden";

const error = (code: string) => ({ code, message: code }) as unknown as ApiError;

function Page({ error }: { error: ApiError | undefined }) {
  useRedirectIfForbidden(error);
  return <span>secret</span>;
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

const renderAt = (entries: string[], index: number, apiError: ApiError | undefined) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/" element={<span>incident list</span>} />
        <Route path="/previous" element={<span>previous page</span>} />
        <Route path="/secret" element={<Page error={apiError} />} />
      </Routes>
    </MemoryRouter>,
  );

describe("useRedirectIfForbidden", () => {
  it("goes back to the previous route when the router has history", () => {
    renderAt(["/previous", "/secret"], 1, error("FORBIDDEN"));
    expect(screen.getByTestId("where")).toHaveTextContent("/previous");
    expect(screen.getByText("previous page")).toBeInTheDocument();
  });

  it("falls back to the incident list when the page was the first one visited", () => {
    renderAt(["/secret"], 0, error("FORBIDDEN"));
    expect(screen.getByTestId("where")).toHaveTextContent("/");
    expect(screen.getByText("incident list")).toBeInTheDocument();
  });

  it.each([
    ["no error", undefined],
    ["another error", error("NOT_FOUND")],
  ])("stays on the page with %s", (_name, apiError) => {
    renderAt(["/previous", "/secret"], 1, apiError);
    expect(screen.getByTestId("where")).toHaveTextContent("/secret");
    expect(screen.getByText("secret")).toBeInTheDocument();
  });
});
