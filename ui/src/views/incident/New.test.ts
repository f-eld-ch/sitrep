import { describe, expect, it } from "vitest";
import type { Incident } from "types/incident";
import {
  canEditParentIncident,
  canRemoveDivision,
  initialDivisions,
  initializeDivision,
  updateDivision,
} from "./New";

const baseIncident: Incident = {
  id: "incident-1",
  parentId: null,
  name: "KFS",
  createdAt: new Date(0),
  updatedAt: null,
  deletedAt: null,
  closedAt: null,
  canWrite: true,
  canManage: true,
  canDelete: true,
  canManageAccess: true,
  accessMode: "OPEN_OPERATIONAL" as const,
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
      initializeDivision(
        { id: "division-1", name: "Ops", description: "Operations", kind: "STANDARD" },
        0,
      ),
    ).toEqual({ id: "division-1", name: "Ops", description: "Operations", kind: "STANDARD" });
  });

  it("fills missing legacy division fields with stable defaults", () => {
    expect(
      initializeDivision({ id: "division-1", name: " ", description: "", kind: "STANDARD" }, 1),
    ).toEqual({
      id: "division-1",
      name: "Division 2",
      description: "Division 2",
      kind: "STANDARD",
    });
  });
});

describe("initialDivisions", () => {
  it("does not list the backend-managed Nachrichtenkarte in the creation defaults", () => {
    const names = initialDivisions(undefined, (key) => key).map((d) => d.name);
    expect(names).not.toContain("divisionsNames.Karte.name");
    expect(names).toEqual(["divisionsNames.CLage.name", "divisionsNames.SC.name"]);
  });

  it("hides system divisions when editing an existing incident", () => {
    const incident = {
      ...baseIncident,
      divisions: [
        { id: "m", name: "Karte", description: "Nachrichtenkarte", kind: "MESSAGE_MAP" as const },
        { id: "s", name: "SC", description: "Stabschef", kind: "STANDARD" as const },
      ],
    };
    expect(initialDivisions(incident, (key) => key).map((d) => d.id)).toEqual(["s"]);
  });

  it("uses an existing incident's empty division list instead of creation defaults", () => {
    expect(initialDivisions(baseIncident, (key) => key)).toEqual([]);
  });
});

describe("updateDivision", () => {
  it("updates one division without changing the others", () => {
    expect(
      updateDivision(
        [
          { id: "division-1", name: "Ops", description: "Operations", kind: "STANDARD" },
          { id: "division-2", name: "Map", description: "Mapping", kind: "STANDARD" },
        ],
        1,
        { name: "Situation" },
      ),
    ).toEqual([
      { id: "division-1", name: "Ops", description: "Operations", kind: "STANDARD" },
      { id: "division-2", name: "Situation", description: "Mapping", kind: "STANDARD" },
    ]);
  });
});

describe("canRemoveDivision", () => {
  it("allows removing unsaved divisions", () => {
    expect(
      canRemoveDivision({ id: "", name: "Ops", description: "Operations", kind: "STANDARD" }),
    ).toBe(true);
  });

  it("hides removal for persisted divisions in the UI", () => {
    expect(
      canRemoveDivision({
        id: "division-1",
        name: "Ops",
        description: "Operations",
        kind: "STANDARD",
      }),
    ).toBe(false);
  });
});
