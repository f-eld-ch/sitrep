import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import { TriageCanvas, TriageSaved } from "./TriageCanvas";

// The real locale file, so a missing translation fails the test.
function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de);
  return typeof value === "string" ? value : key;
}
const t = lookup;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: lookup, i18n: { language: "de" } }),
}));

function renderCanvas(props: Parameters<typeof TriageCanvas>[0]) {
  return render(
    <MemoryRouter initialEntries={["/incident/inc-1/journal/triage"]}>
      <Routes>
        <Route path="/incident/:incidentId/journal/triage" element={<TriageCanvas {...props} />} />
        <Route path="/incident/:incidentId/journal/edit" element={<p>editor page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TriageCanvas", () => {
  it("shows what it is given", () => {
    renderCanvas({ children: <p>the message to triage</p> });

    expect(screen.getByRole("heading", { level: 1, name: t("triageView") })).toBeInTheDocument();
    expect(screen.getByText("the message to triage")).toBeInTheDocument();
  });

  it("only warns when the incident is closed, whatever else it is given", () => {
    renderCanvas({ incidentClosed: true, children: <p>the message to triage</p> });

    expect(screen.getByText(t("triageIncidentClosed"))).toBeInTheDocument();
    expect(screen.queryByText("the message to triage")).not.toBeInTheDocument();
  });

  it("leads to the editor when there are no messages yet", () => {
    renderCanvas({ hasMessages: false });

    fireEvent.click(screen.getByRole("button", { name: t("editor") }));

    expect(screen.getByText("editor page")).toBeInTheDocument();
  });

  describe("keyboard shortcut help", () => {
    const toggle = () => screen.getByRole("button", { name: t("keybindings.title") });

    it("opens and lists the shortcuts, with a heading of its own", () => {
      renderCanvas({});
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText(t("keybindings.nextStep"))).not.toBeInTheDocument();

      fireEvent.click(toggle());

      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      for (const key of ["prevMessage", "nextMessage", "nextStep", "deselect"]) {
        expect(screen.getByText(t(`keybindings.${key}`))).toBeInTheDocument();
      }
      expect(screen.getByText("Esc")).toBeInTheDocument();
    });

    it("closes with the button again", () => {
      renderCanvas({});
      fireEvent.click(toggle());

      fireEvent.click(toggle());

      expect(screen.queryByText(t("keybindings.nextStep"))).not.toBeInTheDocument();
    });

    it("closes on a click outside", () => {
      const { container } = renderCanvas({});
      fireEvent.click(toggle());

      fireEvent.click(container.querySelector(".fixed.inset-0") as HTMLElement);

      expect(screen.queryByText(t("keybindings.nextStep"))).not.toBeInTheDocument();
    });
  });
});

describe("TriageSaved keyboard", () => {
  function renderSaved() {
    const onNext = vi.fn();
    render(
      <TriageSaved
        messageNumber={12}
        nextNumber={13}
        pendingCount={0}
        onNext={onNext}
        onAdjust={vi.fn()}
      />,
    );
    return onNext;
  }

  it("leaves a plain Enter on a focused button to that button", () => {
    const onNext = renderSaved();

    fireEvent.keyDown(screen.getByRole("button", { name: t("triageAdjust") }), { key: "Enter" });

    expect(onNext).not.toHaveBeenCalled();
  });

  it("advances on Ctrl+Enter even from a focused button", () => {
    const onNext = renderSaved();

    fireEvent.keyDown(screen.getByRole("button", { name: t("triageAdjust") }), {
      key: "Enter",
      ctrlKey: true,
    });

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("does not advance again while the key is held down", () => {
    const onNext = renderSaved();

    fireEvent.keyDown(document.body, { key: "Enter", repeat: true });

    expect(onNext).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onNext = renderSaved();

    fireEvent.keyDown(document.body, { key: "a" });

    expect(onNext).not.toHaveBeenCalled();
  });
});
