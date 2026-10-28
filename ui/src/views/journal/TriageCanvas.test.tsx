import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";
import { TriageCanvas, TriageSaved } from "./TriageCanvas";

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

describe("TriageSaved", () => {
  const renderSaved = (props: Partial<Parameters<typeof TriageSaved>[0]> = {}) => {
    const onNext = vi.fn();
    const onAdjust = vi.fn();
    render(
      <MemoryRouter>
        <TriageSaved
          messageNumber={12}
          nextNumber={13}
          pendingCount={3}
          onNext={onNext}
          onAdjust={onAdjust}
          {...props}
        />
      </MemoryRouter>,
    );
    return { onNext, onAdjust };
  };

  it("confirms the save and offers the next pending message", () => {
    const { onNext } = renderSaved();

    expect(screen.getByText("triageSaved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "triageNextPending" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("lets the operator adjust the saved message", () => {
    const { onAdjust } = renderSaved();

    fireEvent.click(screen.getByRole("button", { name: "triageAdjust" }));
    expect(onAdjust).toHaveBeenCalledTimes(1);
  });

  it("advances on Enter", () => {
    const { onNext } = renderSaved();

    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("shows no next button when nothing is pending", () => {
    const { onNext } = renderSaved({ nextNumber: undefined, pendingCount: 0 });

    expect(screen.queryByRole("button", { name: "triageNextPending" })).toBeNull();
    expect(screen.getByText("triageCaughtUp")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(onNext).not.toHaveBeenCalled();
  });
});
