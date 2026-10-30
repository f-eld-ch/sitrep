import { describe, expect, it } from "vitest";
import { schadenplatzLabel } from "./schadenplatz";

describe("schadenplatzLabel", () => {
  it("shows the default Schadenplatz as the incident", () => {
    expect(schadenplatzLabel({ isDefault: true, name: "x" }, "Brand Altdorf", "fallback")).toBe(
      "Brand Altdorf",
    );
  });

  it("falls back while the incident name is not known", () => {
    expect(schadenplatzLabel({ isDefault: true, name: "x" }, undefined, "fallback")).toBe(
      "fallback",
    );
    expect(schadenplatzLabel({ isDefault: true, name: "x" }, "", "fallback")).toBe("fallback");
  });

  it("keeps the name of a named Schadenplatz", () => {
    expect(schadenplatzLabel({ isDefault: false, name: "Nordseite" }, "Brand Altdorf", "f")).toBe(
      "Nordseite",
    );
  });
});
