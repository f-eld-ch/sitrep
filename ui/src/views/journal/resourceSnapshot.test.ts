import { describe, expect, it } from "vitest";
import type { Resource, ResourceDeploymentPeriod } from "api";
import { resourceStateAt } from "./resourceSnapshot";

const at = (iso: string) => new Date(iso);

const period = (startedAt: string, endedAt: string | null): ResourceDeploymentPeriod => ({
  startedAt,
  endedAt,
  schadenplatzId: "sp-1",
  formation: "FW",
  name: "Gruppe Alpha",
  homeLocationName: null,
  deploymentLabel: null,
  hauptaufgabe: "Löschangriff",
  personnelCount: 9,
});

const resource = (overrides: Partial<Resource>): Resource => ({
  id: "r-1",
  incidentId: "inc-1",
  schadenplatzId: "sp-1",
  formation: "FW",
  name: "Gruppe Alpha",
  size: "GRUPPE",
  personnelCount: 9,
  hauptaufgabe: "",
  contact: null,
  homeLocation: null,
  deploymentLocation: null,
  status: "AUFGEBOTEN",
  statusAt: "2026-01-15T07:00:00Z",
  alertedAt: "2026-01-15T07:00:00Z",
  readyAt: null,
  deployedAt: null,
  stoodDownAt: null,
  relievedAt: null,
  einsatzBeginn: null,
  einsatzEnde: null,
  predecessorId: null,
  successorId: null,
  sourceMessageId: null,
  deploymentHistory: [],
  ...overrides,
});

describe("resourceStateAt", () => {
  describe("single cycle", () => {
    const r = resource({
      status: "ABGELOEST",
      readyAt: "2026-01-15T08:00:00Z",
      relievedAt: "2026-01-15T12:00:00Z",
      successorId: "r-2",
      deploymentHistory: [period("2026-01-15T09:00:00Z", "2026-01-15T12:00:00Z")],
    });

    it.each([
      ["2026-01-15T07:30:00Z", "AUFGEBOTEN"],
      ["2026-01-15T08:30:00Z", "EINSATZBEREIT"],
      ["2026-01-15T10:00:00Z", "EINGESETZT"],
      ["2026-01-15T13:00:00Z", "ABGELOEST"],
    ])("at %s the resource is %s", (time, status) => {
      expect(resourceStateAt(r, at(time)).status).toBe(status);
    });

    it("reports the successor once relieved", () => {
      expect(resourceStateAt(r, at("2026-01-15T13:00:00Z")).successorId).toBe("r-2");
    });
  });

  describe("reactivated on day 2", () => {
    // Day 1: deployed 09:00–12:00 and relieved. Day 2: reactivated at 07:00, ready 08:00,
    // deployed again from 09:00 (still ongoing). readyAt/relievedAt were reset by reactivation.
    const r = resource({
      status: "EINGESETZT",
      alertedAt: "2026-01-16T07:00:00Z",
      readyAt: "2026-01-16T08:00:00Z",
      deploymentHistory: [
        period("2026-01-15T09:00:00Z", "2026-01-15T12:00:00Z"),
        period("2026-01-16T09:00:00Z", null),
      ],
    });

    it.each([
      ["day 1 before the first deployment", "2026-01-15T08:00:00Z", "AUFGEBOTEN"],
      ["day 1 during the deployment", "2026-01-15T10:00:00Z", "EINGESETZT"],
      ["day 1 evening, after relief", "2026-01-15T20:00:00Z", "ABGELOEST"],
      ["overnight rest", "2026-01-16T03:00:00Z", "ABGELOEST"],
      ["day 2 after reactivation, before ready", "2026-01-16T07:30:00Z", "AUFGEBOTEN"],
      ["day 2 ready", "2026-01-16T08:30:00Z", "EINSATZBEREIT"],
      ["day 2 deployed", "2026-01-16T10:00:00Z", "EINGESETZT"],
    ])("%s → %s", (_label, time, status) => {
      expect(resourceStateAt(r, at(time)).status).toBe(status);
    });
  });

  it("treats a gap between two deployments of the same day as ready", () => {
    const r = resource({
      status: "EINGESETZT",
      alertedAt: "2026-01-16T07:00:00Z",
      deploymentHistory: [
        period("2026-01-15T09:00:00Z", "2026-01-15T10:00:00Z"),
        period("2026-01-15T11:00:00Z", "2026-01-15T12:00:00Z"),
      ],
    });

    expect(resourceStateAt(r, at("2026-01-15T10:30:00Z")).status).toBe("EINSATZBEREIT");
    expect(resourceStateAt(r, at("2026-01-15T13:00:00Z")).status).toBe("ABGELOEST");
  });

  it("uses the live fields for an ongoing deployment", () => {
    const r = resource({
      status: "EINGESETZT",
      hauptaufgabe: "Evakuierung",
      deploymentLocation: { lat: null, lng: null, label: "Brücke Nord" },
      deploymentHistory: [period("2026-01-15T09:00:00Z", null)],
    });

    const snap = resourceStateAt(r, at("2026-01-15T10:00:00Z"));
    expect(snap.hauptaufgabe).toBe("Evakuierung");
    expect(snap.deploymentLabel).toBe("Brücke Nord");
  });
});
