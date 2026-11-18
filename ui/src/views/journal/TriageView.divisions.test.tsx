import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import type { Division } from "types";
import { DivisionFlowChips } from "./TriageView";

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

const messageMap = {
  id: "d-map",
  name: "Karte",
  description: "Nachrichtenkarte",
  kind: "MESSAGE_MAP",
} as Division;
const chief = { id: "d-sc", name: "SC", description: "Stabschef", kind: "STANDARD" } as Division;

describe("DivisionFlowChips", () => {
  beforeEach(() => {
    language = "de";
  });

  it.each([
    ["de", "Nachrichtenkarte"],
    ["fr", "Carte de renseignements"],
    ["it", "Carta informativa"],
  ])("shows the Nachrichtenkarte division in %s", (lang, label) => {
    language = lang;
    render(
      <DivisionFlowChips divisions={[messageMap, chief]} assignments={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each(["fr", "it"])("does not show the stored German text in %s", (lang) => {
    language = lang;
    render(
      <DivisionFlowChips divisions={[messageMap, chief]} assignments={[]} onChange={vi.fn()} />,
    );

    expect(screen.queryByText("Nachrichtenkarte")).not.toBeInTheDocument();
  });

  it("keeps the stored label of a standard division", () => {
    language = "fr";
    render(
      <DivisionFlowChips divisions={[messageMap, chief]} assignments={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByText("Stabschef")).toBeInTheDocument();
  });

  it("assigns and removes a division", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DivisionFlowChips divisions={[messageMap, chief]} assignments={[]} onChange={onChange} />,
    );

    // one add button per chip, in order
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onChange).toHaveBeenLastCalledWith([messageMap]);

    rerender(
      <DivisionFlowChips
        divisions={[messageMap, chief]}
        assignments={[messageMap]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
