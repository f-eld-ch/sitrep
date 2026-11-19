import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import de from "../i18n/locales/de/translations.json";
import fr from "../i18n/locales/fr/translations.json";
import { Login } from "./Login";

const locales: Record<string, Record<string, unknown>> = { de, fr };
let language = "de";
const changeLanguage = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (locales[language][key] as string) ?? key,
    i18n: { changeLanguage, language },
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Login />
    </MemoryRouter>,
  );
}

describe("Login", () => {
  const replace = vi.fn();

  beforeEach(() => {
    language = "de";
    changeLanguage.mockClear();
    replace.mockClear();
    vi.stubGlobal("location", { replace });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["de", de],
    ["fr", fr],
  ])("shows the tagline and the sign-in button in %s", (lang, locale) => {
    language = lang;
    renderAt("/login");

    expect(screen.getByText(locale.loginTagline as string)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: locale.login as string })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "sitrep" })).toBeInTheDocument();
  });

  it("sends the user to the OIDC sign-in", () => {
    renderAt("/login");

    fireEvent.click(screen.getByRole("button", { name: de.login }));

    expect(replace).toHaveBeenCalledExactlyOnceWith("/oauth2/sign_in");
  });

  it("switches to the language of the lang parameter", () => {
    renderAt("/login?lang=fr");

    expect(changeLanguage).toHaveBeenCalledWith("fr");
  });

  it("lets the detector choose the language without a lang parameter", () => {
    renderAt("/login");

    expect(changeLanguage).toHaveBeenCalledWith(undefined);
  });
});
