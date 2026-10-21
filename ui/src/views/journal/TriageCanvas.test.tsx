import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";
import { TriageCanvas } from "./TriageCanvas";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const renderCanvas = (props: Parameters<typeof TriageCanvas>[0]) =>
  render(
    <MemoryRouter initialEntries={["/incident/inc-1/journal/triage"]}>
      <Routes>
        <Route path="/incident/:incidentId/*" element={<TriageCanvas {...props} />} />
      </Routes>
    </MemoryRouter>,
  );

describe("TriageCanvas empty states", () => {
  it("says everything is triaged when there are messages but none left", () => {
    renderCanvas({ hasMessages: true });

    expect(screen.getByText("triageCaughtUp")).toBeInTheDocument();
    expect(screen.queryByText("triageNoMessages")).toBeNull();
  });

  it("points to the editor when no message was created at all", () => {
    renderCanvas({ hasMessages: false });

    expect(screen.getByText("triageNoMessages")).toBeInTheDocument();
    expect(screen.queryByText("triageCaughtUp")).toBeNull();
    expect(screen.getByRole("button", { name: /editor/ })).toBeInTheDocument();
  });
});
