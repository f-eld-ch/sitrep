import { describe, expect, it } from "vitest";
import type { Incident } from "types/incident";
import { canEditParentIncident, initializeDivision, updateDivision } from "./New";

const baseIncident: Incident = {
  id: "incident-1",
  parentId: null,
  name: "KFS",
  createdAt: new Date(0),
  updatedAt: null,
  deletedAt: null,
  closedAt: null,
  location: { id: "", name: "", coordinates: "" },
  divisions: [],
  childIncidents: [],
  layers: [],
};

describe("canEditParentIncident", () => {
  it("allows parent selection while creating an incident", () => {
    expect(canEditParentIncident(undefined)).toBe(true);
  });

  it("allows parent selection for incidents without children", () => {
    expect(canEditParentIncident(baseIncident)).toBe(true);
  });

  it("hides parent selection for incidents with children", () => {
    expect(
      canEditParentIncident({
        ...baseIncident,
        childIncidents: [{ ...baseIncident, id: "child-1", name: "GFS" }],
      }),
    ).toBe(false);
  });

  it("hides parent selection when the incident list contains a child", () => {
    expect(
      canEditParentIncident(baseIncident, [
        baseIncident,
        { ...baseIncident, id: "child-1", name: "GFS", parentId: baseIncident.id },
      ]),
    ).toBe(false);
  });

  it("ignores deleted children when deciding whether parent selection is editable", () => {
    expect(
      canEditParentIncident(baseIncident, [
        baseIncident,
        {
          ...baseIncident,
          id: "child-1",
          name: "GFS",
          parentId: baseIncident.id,
          deletedAt: new Date(0),
        },
      ]),
    ).toBe(true);
  });
});

describe("initializeDivision", () => {
  it("keeps existing valid division fields", () => {
    expect(
      initializeDivision({ id: "division-1", name: "Ops", description: "Operations" }, 0),
    ).toEqual({ id: "division-1", name: "Ops", description: "Operations" });
  });

  it("fills missing legacy division fields with stable defaults", () => {
    expect(initializeDivision({ id: "division-1", name: " ", description: "" }, 1)).toEqual({
      id: "division-1",
      name: "Division 2",
      description: "Division 2",
    });
  });
});

describe("updateDivision", () => {
  it("updates one division without changing the others", () => {
    expect(
      updateDivision(
        [
          { id: "division-1", name: "Ops", description: "Operations" },
          { id: "division-2", name: "Map", description: "Mapping" },
        ],
        1,
        { name: "Situation" },
      ),
    ).toEqual([
      { id: "division-1", name: "Ops", description: "Operations" },
      { id: "division-2", name: "Situation", description: "Mapping" },
    ]);
  });
});
