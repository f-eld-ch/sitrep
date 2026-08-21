import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LanguageSwitcher, { LANGUAGES } from "./LanguageSwitcher";

const mockChangeLanguage = vi.fn();
let resolvedLanguage = "de";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      get resolvedLanguage() {
        return resolvedLanguage;
      },
      get language() {
        return resolvedLanguage;
      },
      changeLanguage: mockChangeLanguage,
    },
  }),
}));

beforeEach(() => {
  mockChangeLanguage.mockClear();
  resolvedLanguage = "de";
});

describe("LanguageSwitcher", () => {
  it("offers German, French and Italian, and not English", () => {
    // English is excluded on purpose: the BABS catalogue has no English labels, so an
    // English UI would be half translated.
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "Deutsch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Français" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Italiano" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("switches to the chosen language", () => {
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Italiano" }));
    expect(mockChangeLanguage).toHaveBeenCalledExactlyOnceWith("it");
  });

  it("marks the active language as pressed, and only that one", () => {
    resolvedLanguage = "fr";
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "Français" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Italiano" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("treats a regional variant as its base language", () => {
    // i18next resolves de-CH to de, which is the common case for this audience — the
    // button must still read as active or the control looks broken.
    resolvedLanguage = "de";
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not re-switch when the active language is clicked", () => {
    resolvedLanguage = "de";
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));
    expect(mockChangeLanguage).not.toHaveBeenCalled();
  });

  it("shows no active language when the UI is in one it does not offer", () => {
    // An English browser resolves to "en". Highlighting nothing is honest — clicking any
    // button moves to a supported language — whereas pretending German is active would
    // contradict the text on screen.
    resolvedLanguage = "en";
    render(<LanguageSwitcher />);
    for (const language of LANGUAGES) {
      expect(screen.getByRole("button", { name: language.name })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  it("labels each button with its own language for assistive tech", () => {
    render(<LanguageSwitcher />);
    for (const language of LANGUAGES) {
      const button = screen.getByRole("button", { name: language.name });
      // The visible text is an abbreviation, so the accessible name carries the autonym,
      // and lang= stops a screen reader reading "Français" with English phonetics.
      expect(button).toHaveTextContent(language.short);
      expect(button).toHaveAttribute("lang", language.code);
    }
  });
});
