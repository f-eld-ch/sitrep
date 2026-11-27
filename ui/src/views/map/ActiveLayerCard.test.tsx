import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import de from "../../i18n/locales/de/translations.json";
import fr from "../../i18n/locales/fr/translations.json";
import it_ from "../../i18n/locales/it/translations.json";
import { ActiveLayerCard } from "./ActiveLayerCard";

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
  name: "Nachrichtenkarte",
  kind: "MESSAGE_MAP" as const,
  sourceIncidentName: "Bergsturz",
};

describe("ActiveLayerCard", () => {
  beforeEach(() => {
    language = "de";
  });

  it.each([
    ["de", "Nachrichtenkarte"],
    ["fr", "Carte de renseignements"],
    ["it", "Carta informativa"],
  ])("names the message map layer in %s", (lang, label) => {
    language = lang;
    render(<ActiveLayerCard layer={messageMap} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each(["fr", "it"])("does not show the stored German name in %s", (lang) => {
    language = lang;
    render(<ActiveLayerCard layer={messageMap} />);

    expect(screen.queryByText("Nachrichtenkarte")).not.toBeInTheDocument();
  });

  it("keeps the name of a layer the user named", () => {
    language = "fr";
    render(
      <ActiveLayerCard
        layer={{ name: "Lage Nord", kind: "STANDARD", sourceIncidentName: "Bergsturz" }}
      />,
    );

    expect(screen.getByText("Lage Nord")).toBeInTheDocument();
  });

  it("says that the layer is read-only only when asked", () => {
    const { rerender } = render(<ActiveLayerCard layer={messageMap} />);
    expect(screen.queryByText("Nur zum Ansehen")).not.toBeInTheDocument();

    rerender(<ActiveLayerCard layer={messageMap} readOnly />);
    expect(screen.getByText("Nur zum Ansehen")).toBeInTheDocument();
  });

  it.each([
    ["fr", "Lecture seule"],
    ["it", "Sola lettura"],
  ])("says it in %s", (lang, text) => {
    language = lang;
    render(<ActiveLayerCard layer={messageMap} readOnly />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("names the incident the layer comes from", () => {
    render(<ActiveLayerCard layer={messageMap} />);

    expect(screen.getByText("Bergsturz")).toBeInTheDocument();
  });
});
