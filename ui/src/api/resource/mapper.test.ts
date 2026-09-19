import { describe, expect, it } from "vitest";
import type { GetIncidentResourcesQuery } from "./documents";
import {
  toContactMedium,
  toResource,
  toResourceFormation,
  toResourceStatus,
  toResourceUnitSize,
} from "./mapper";

// Derive the wire type the same way mapper.ts does, so refactors break both
// the mapper and the test rather than silently diverging.
type WireResource = NonNullable<
  GetIncidentResourcesQuery["incident"]
>["schadenplaetze"][0]["resources"][0];

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WIRE_DEPLOYMENT_PERIOD = {
  startedAt: "2024-03-10T08:00:00Z",
  endedAt: "2024-03-10T18:00:00Z",
  schadenplatzId: "sp-1",
  formation: "FW" as const,
  name: "Alpha Trupp",
  homeLocationName: "Feuerwehr Depot",
  deploymentLabel: "Sektor A",
  hauptaufgabe: "Löschen",
  personnelCount: 6,
};

const WIRE_RESOURCE: WireResource = {
  id: "res-1",
  incidentId: "inc-1",
  schadenplatzId: "sp-1",
  formation: "FW",
  name: "Alpha Trupp",
  size: "TRUPP",
  personnelCount: 6,
  hauptaufgabe: "Löschen",
  contact: { medium: "RADIO", detail: "Kanal 3" },
  homeLocation: { name: "Feuerwehr Depot", lat: 47.0, lng: 8.0 },
  deploymentLocation: { lat: 47.01, lng: 8.01, label: "Sektor A" },
  status: "EINGESETZT",
  statusAt: "2024-03-15T10:00:00Z",
  alertedAt: "2024-03-15T08:00:00Z",
  readyAt: "2024-03-15T09:00:00Z",
  deployedAt: "2024-03-15T10:00:00Z",
  stoodDownAt: null,
  relievedAt: null,
  einsatzBeginn: "2024-03-15T10:00:00Z",
  einsatzEnde: null,
  predecessorId: null,
  successorId: null,
  sourceMessageId: "msg-5",
  deploymentHistory: [WIRE_DEPLOYMENT_PERIOD],
};

// ── toResourceFormation ───────────────────────────────────────────────────────

describe("toResourceFormation", () => {
  it.each(["FW", "POL", "ARMEE", "ZS", "TECHNB", "SAN", "OTHER"] as const)(
    "maps known value %s to itself",
    (val) => {
      expect(toResourceFormation(val)).toBe(val);
    },
  );

  it("falls back to OTHER for an unknown value", () => {
    expect(toResourceFormation("ZIVILSCHUTZ_UNKNOWN")).toBe("OTHER");
  });

  it("falls back to OTHER for an empty string", () => {
    expect(toResourceFormation("")).toBe("OTHER");
  });
});

// ── toResourceUnitSize ────────────────────────────────────────────────────────

describe("toResourceUnitSize", () => {
  it.each(["TRUPP", "GRUPPE", "ZUG", "KOMPANIE", "BATAILLON"] as const)(
    "maps known value %s to itself",
    (val) => {
      expect(toResourceUnitSize(val)).toBe(val);
    },
  );

  it("falls back to GRUPPE for an unknown value", () => {
    expect(toResourceUnitSize("DIVISION")).toBe("GRUPPE");
  });

  it("falls back to GRUPPE for an empty string", () => {
    expect(toResourceUnitSize("")).toBe("GRUPPE");
  });
});

// ── toResourceStatus ──────────────────────────────────────────────────────────

describe("toResourceStatus", () => {
  it.each(["AUFGEBOTEN", "EINSATZBEREIT", "EINGESETZT", "ABGELOEST"] as const)(
    "maps known value %s to itself",
    (val) => {
      expect(toResourceStatus(val)).toBe(val);
    },
  );

  it("falls back to AUFGEBOTEN for an unknown value", () => {
    expect(toResourceStatus("RUHEND")).toBe("AUFGEBOTEN");
  });

  it("falls back to AUFGEBOTEN for an empty string", () => {
    expect(toResourceStatus("")).toBe("AUFGEBOTEN");
  });
});

// ── toContactMedium ───────────────────────────────────────────────────────────

describe("toContactMedium", () => {
  it.each(["PHONE", "RADIO", "OTHER"] as const)("maps known value %s to itself", (val) => {
    expect(toContactMedium(val)).toBe(val);
  });

  it("falls back to OTHER for an unknown value", () => {
    expect(toContactMedium("TELEGRAM")).toBe("OTHER");
  });

  it("falls back to OTHER for an empty string", () => {
    expect(toContactMedium("")).toBe("OTHER");
  });
});

// ── toResource ────────────────────────────────────────────────────────────────

describe("toResource", () => {
  it("maps all scalar fields from the wire object", () => {
    const result = toResource(WIRE_RESOURCE);
    expect(result.id).toBe("res-1");
    expect(result.incidentId).toBe("inc-1");
    expect(result.schadenplatzId).toBe("sp-1");
    expect(result.name).toBe("Alpha Trupp");
    expect(result.personnelCount).toBe(6);
    expect(result.hauptaufgabe).toBe("Löschen");
    expect(result.statusAt).toBe("2024-03-15T10:00:00Z");
    expect(result.alertedAt).toBe("2024-03-15T08:00:00Z");
    expect(result.sourceMessageId).toBe("msg-5");
  });

  it("maps formation through toResourceFormation", () => {
    const result = toResource({ ...WIRE_RESOURCE, formation: "SAN" });
    expect(result.formation).toBe("SAN");
  });

  it("maps unknown formation to OTHER fallback", () => {
    const result = toResource({
      ...WIRE_RESOURCE,
      formation: "UNBEKANNT" as WireResource["formation"],
    });
    expect(result.formation).toBe("OTHER");
  });

  it("maps size through toResourceUnitSize", () => {
    const result = toResource({ ...WIRE_RESOURCE, size: "KOMPANIE" });
    expect(result.size).toBe("KOMPANIE");
  });

  it("maps unknown size to GRUPPE fallback", () => {
    const result = toResource({
      ...WIRE_RESOURCE,
      size: "DIVISION" as WireResource["size"],
    });
    expect(result.size).toBe("GRUPPE");
  });

  it("maps status through toResourceStatus", () => {
    const result = toResource({ ...WIRE_RESOURCE, status: "ABGELOEST" });
    expect(result.status).toBe("ABGELOEST");
  });

  it("maps unknown status to AUFGEBOTEN fallback", () => {
    const result = toResource({
      ...WIRE_RESOURCE,
      status: "RUHEND" as WireResource["status"],
    });
    expect(result.status).toBe("AUFGEBOTEN");
  });

  it("maps contact with medium through toContactMedium", () => {
    const result = toResource(WIRE_RESOURCE);
    expect(result.contact).toEqual({ medium: "RADIO", detail: "Kanal 3" });
  });

  it("maps null contact to null", () => {
    const result = toResource({ ...WIRE_RESOURCE, contact: null });
    expect(result.contact).toBeNull();
  });

  it("maps homeLocation when present", () => {
    const result = toResource(WIRE_RESOURCE);
    expect(result.homeLocation).toEqual({ name: "Feuerwehr Depot", lat: 47.0, lng: 8.0 });
  });

  it("maps null homeLocation to null", () => {
    const result = toResource({ ...WIRE_RESOURCE, homeLocation: null });
    expect(result.homeLocation).toBeNull();
  });

  it("maps deploymentLocation when present", () => {
    const result = toResource(WIRE_RESOURCE);
    expect(result.deploymentLocation).toEqual({ lat: 47.01, lng: 8.01, label: "Sektor A" });
  });

  it("maps null deploymentLocation to null", () => {
    const result = toResource({ ...WIRE_RESOURCE, deploymentLocation: null });
    expect(result.deploymentLocation).toBeNull();
  });

  it("maps all nullable timestamp fields", () => {
    const result = toResource(WIRE_RESOURCE);
    expect(result.readyAt).toBe("2024-03-15T09:00:00Z");
    expect(result.deployedAt).toBe("2024-03-15T10:00:00Z");
    expect(result.stoodDownAt).toBeNull();
    expect(result.relievedAt).toBeNull();
    expect(result.einsatzBeginn).toBe("2024-03-15T10:00:00Z");
    expect(result.einsatzEnde).toBeNull();
    expect(result.predecessorId).toBeNull();
    expect(result.successorId).toBeNull();
  });

  it("maps deploymentHistory periods with toResourceFormation", () => {
    const result = toResource(WIRE_RESOURCE);
    expect(result.deploymentHistory).toHaveLength(1);
    const period = result.deploymentHistory[0];
    expect(period.startedAt).toBe("2024-03-10T08:00:00Z");
    expect(period.endedAt).toBe("2024-03-10T18:00:00Z");
    expect(period.schadenplatzId).toBe("sp-1");
    expect(period.formation).toBe("FW");
    expect(period.name).toBe("Alpha Trupp");
    expect(period.homeLocationName).toBe("Feuerwehr Depot");
    expect(period.deploymentLabel).toBe("Sektor A");
    expect(period.hauptaufgabe).toBe("Löschen");
    expect(period.personnelCount).toBe(6);
  });

  it("maps unknown formation in deploymentHistory to OTHER fallback", () => {
    const result = toResource({
      ...WIRE_RESOURCE,
      deploymentHistory: [
        { ...WIRE_DEPLOYMENT_PERIOD, formation: "UNBEKANNT" as WireResource["formation"] },
      ],
    });
    expect(result.deploymentHistory[0].formation).toBe("OTHER");
  });

  it("maps empty deploymentHistory to empty array", () => {
    const result = toResource({ ...WIRE_RESOURCE, deploymentHistory: [] });
    expect(result.deploymentHistory).toEqual([]);
  });

  it("does not include __typename in the result", () => {
    const wireWithTypename = { ...WIRE_RESOURCE, __typename: "Resource" as const };
    const result = toResource(wireWithTypename);
    expect(Object.keys(result)).not.toContain("__typename");
  });
});
