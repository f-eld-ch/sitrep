import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import AccessPage from "./AccessPage";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "incidentAccess.title" ? de.incidentAccess.title : key),
  }),
}));
vi.mock("./Access", () => ({
  default: ({ incidentId }: { incidentId: string }) => <p>access of {incidentId}</p>,
}));

describe("AccessPage", () => {
  it("shows the access section of the incident in the url", () => {
    render(
      <MemoryRouter initialEntries={["/incident/i7/access"]}>
        <Routes>
          <Route path="/incident/:incidentId/access" element={<AccessPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: de.incidentAccess.title })).toBeInTheDocument();
    expect(screen.getByText("access of i7")).toBeInTheDocument();
  });

  it("renders nothing without an incident id", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/access"]}>
        <Routes>
          <Route path="/access" element={<AccessPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
