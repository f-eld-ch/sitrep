import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import de from "../../../i18n/locales/de/translations.json";
import fr from "../../../i18n/locales/fr/translations.json";
import it_ from "../../../i18n/locales/it/translations.json";
import { List, New, NewForm } from ".";

const locales: Record<string, Record<string, unknown>> = { de, fr, it: it_ };
let language = "de";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => (locales[language][key] as string) ?? key }),
}));

describe("immediate measures", () => {
  it.each(["de", "fr", "it"])("titles the list in %s", (lang) => {
    language = lang;
    render(<List />);

    expect(
      screen.getByRole("heading", { level: 1, name: locales[lang].immediateMeasures as string }),
    ).toBeInTheDocument();
  });

  it.each(["de", "fr", "it"])("titles the creation page in %s", (lang) => {
    language = lang;
    render(<New />);

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: locales[lang].createNewImmediateMeasures as string,
      }),
    ).toBeInTheDocument();
  });

  it("has no form yet", () => {
    const { container } = render(<NewForm />);

    expect(container).toBeEmptyDOMElement();
  });
});
