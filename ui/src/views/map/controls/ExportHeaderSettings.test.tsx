import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useExportHeaderSettings } from "./ExportHeaderSettings";

beforeEach(() => window.localStorage.clear());

describe("useExportHeaderSettings", () => {
  it("starts with the header on and the sheet classified as internal", () => {
    const { result } = renderHook(() => useExportHeaderSettings());

    expect(result.current[0]).toEqual({ enabled: true, classification: "intern" });
  });

  it("keeps a change, in the browser", () => {
    const { result } = renderHook(() => useExportHeaderSettings());

    act(() => result.current[1]({ classification: "vertraulich" }));
    expect(result.current[0]).toEqual({ enabled: true, classification: "vertraulich" });

    act(() => result.current[1]({ enabled: false }));
    expect(result.current[0]).toEqual({ enabled: false, classification: "vertraulich" });
    expect(JSON.parse(window.localStorage.getItem("sitrep.exportHeader") ?? "{}")).toEqual({
      enabled: false,
      classification: "vertraulich",
    });
  });

  it.each([
    ["not json at all", "{"],
    ["a string", JSON.stringify("x")],
    ["null", "null"],
    ["unknown values", JSON.stringify({ enabled: "yes", classification: "top" })],
  ])("falls back to the defaults for %s", (_name, stored) => {
    window.localStorage.setItem("sitrep.exportHeader", stored);

    const { result } = renderHook(() => useExportHeaderSettings());

    expect(result.current[0]).toEqual({ enabled: true, classification: "intern" });
  });
});
