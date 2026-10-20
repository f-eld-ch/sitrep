import { describe, expect, it } from "vitest";
import { divisionLongLabel, divisionShortLabel, layerLabel } from "./divisionLabel";

const t = (key: string) => `t:${key}`;

describe("divisionLabel", () => {
  it("translates the message map division regardless of stored labels", () => {
    const d = { name: "Karte", description: "Nachrichtenkarte", kind: "MESSAGE_MAP" as const };
    expect(divisionShortLabel(d, t)).toBe("t:divisionsNames.Karte.name");
    expect(divisionLongLabel(d, t)).toBe("t:divisionsNames.Karte.description");
  });

  it("uses stored labels for standard divisions with fallbacks", () => {
    const d = { name: "SC", description: "Stabschef", kind: "STANDARD" as const };
    expect(divisionShortLabel(d, t)).toBe("SC");
    expect(divisionLongLabel(d, t)).toBe("Stabschef");
    expect(divisionShortLabel({ ...d, name: " " }, t)).toBe("Stabschef");
    expect(divisionLongLabel({ ...d, description: "" }, t)).toBe("SC");
  });

  it("translates only the message map layer", () => {
    expect(layerLabel({ name: "Nachrichtenkarte", kind: "MESSAGE_MAP" }, t)).toBe(
      "t:divisionsNames.Karte.description",
    );
    expect(layerLabel({ name: "Lage", kind: "STANDARD" }, t)).toBe("Lage");
  });
});
