import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDarkMode } from "./useDarkMode";

const originalMatchMedia = window.matchMedia;

function stubPrefersDark(dark: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    media: query,
    matches: dark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(window, "matchMedia", { value: matchMedia, configurable: true });
  return matchMedia;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-color-mode");
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { value: originalMatchMedia, configurable: true });
});

describe("useDarkMode", () => {
  it("follows the operating system preference when nothing is stored", () => {
    const matchMedia = stubPrefersDark(true);
    const { result } = renderHook(() => useDarkMode());
    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(result.current.isDarkMode).toBe(true);
  });

  it("is light when the operating system prefers light", () => {
    stubPrefersDark(false);
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDarkMode).toBe(false);
  });

  it("prefers an explicit default value over the operating system", () => {
    stubPrefersDark(true);
    const { result } = renderHook(() => useDarkMode({ defaultValue: false }));
    expect(result.current.isDarkMode).toBe(false);
  });

  it("prefers the stored choice over the operating system", () => {
    stubPrefersDark(true);
    window.localStorage.setItem("usehooks-ts-dark-mode", "false");
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDarkMode).toBe(false);
  });

  it("sets the theme attributes on the document element", () => {
    stubPrefersDark(true);
    renderHook(() => useDarkMode());
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute("data-color-mode", "dark");
  });

  it("updates the attributes and storage when toggled, enabled, disabled and set", () => {
    stubPrefersDark(false);
    const { result } = renderHook(() => useDarkMode());
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    act(() => result.current.toggle());
    expect(result.current.isDarkMode).toBe(true);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("usehooks-ts-dark-mode")).toBe("true");

    act(() => result.current.toggle());
    expect(result.current.isDarkMode).toBe(false);

    act(() => result.current.enable());
    expect(result.current.isDarkMode).toBe(true);
    act(() => result.current.disable());
    expect(result.current.isDarkMode).toBe(false);
    act(() => result.current.set(true));
    expect(result.current.isDarkMode).toBe(true);
    expect(document.documentElement).toHaveAttribute("data-color-mode", "dark");
  });

  it("stores the choice under a custom key", () => {
    stubPrefersDark(false);
    const { result } = renderHook(() => useDarkMode({ localStorageKey: "my-key" }));
    act(() => result.current.enable());
    expect(window.localStorage.getItem("my-key")).toBe("true");
    expect(window.localStorage.getItem("usehooks-ts-dark-mode")).toBeNull();
  });
});
