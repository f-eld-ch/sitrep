import { describe, expect, it } from "vitest";
import { aliasFor } from "./iconResolver";
import { ColorForCategory } from "./lineAndZoneTypes";
import { propertiesWithIcon } from "./placeIcon";

describe("propertiesWithIcon", () => {
  it("stores the alias and the colour of the category and keeps the other properties", () => {
    const result = propertiesWithIcon({ name: "Kapo", other: 1 }, "4103", "4");

    expect(result).toEqual({
      name: "Kapo",
      other: 1,
      icon: aliasFor("4103"),
      color: ColorForCategory["4"],
    });
  });

  it("works for a feature without properties", () => {
    expect(propertiesWithIcon(undefined, "5103", "5")).toEqual({
      icon: aliasFor("5103"),
      color: ColorForCategory["5"],
    });
  });

  it("replaces the previous symbol and drops empty values", () => {
    const result = propertiesWithIcon({ icon: "old", note: "" }, "7114", "7");

    expect(result?.icon).toBe(aliasFor("7114"));
    expect(result).not.toHaveProperty("note");
  });

  it("never writes the old duplicate iconType", () => {
    expect(propertiesWithIcon({}, "7114", "7")).not.toHaveProperty("iconType");
  });
});
