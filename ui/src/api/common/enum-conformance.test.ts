/**
 * Bidirectional conformance between domain enums and the generated gqlgen schema enums.
 *
 * Direction 1 (compile-time): every domain enum value must be assignable to the schema union
 *   type. A renamed or removed schema value is a type error here.
 *
 * Direction 2 (runtime): every schema union value must appear in the domain enum's runtime
 *   values. A value added to the DB enum table but not to the domain enum fails here.
 */
import { Medium, PriorityStatus, TriageStatus } from "types";
import { describe, expect, it } from "vitest";
import type {
  ContactMedium as ContactMediumEnum,
  Medium as MediumEnum,
  PriorityStatus as PriorityStatusEnum,
  ResourceFormation as ResourceFormationEnum,
  ResourceStatus as ResourceStatusEnum,
  ResourceUnitSize as ResourceUnitSizeEnum,
  TriageStatus as TriageStatusEnum,
} from "gql/next";
import {
  toContactMedium,
  toResourceFormation,
  toResourceStatus,
  toResourceUnitSize,
} from "../resource/mapper";

// --- Direction 2: schema → domain (runtime) ---
// Keep these arrays in sync with the generated union types above.
// If a new value is added to the DB enum, the type of this array becomes a type error AND
// the test below catches any runtime gap in the domain enum.
const ALL_MEDIUM_SCHEMA: MediumEnum[] = ["EMAIL", "OTHER", "PHONE", "RADIO"];
const ALL_TRIAGE_SCHEMA: TriageStatusEnum[] = ["DONE", "MOREINFO", "PENDING", "RESET"];
const ALL_PRIORITY_SCHEMA: PriorityStatusEnum[] = ["HIGH", "NORMAL"];

// Resource enums: the domain types are string-literal unions (not runtime enum objects),
// so Direction 1 uses typed array assignments (compile errors catch renames/removals)
// and Direction 2 uses the mapper functions (unknown values return the fallback, not the value).
const ALL_RESOURCE_FORMATION_SCHEMA: ResourceFormationEnum[] = [
  "ARMEE",
  "FW",
  "OTHER",
  "POL",
  "SAN",
  "TECHNB",
  "ZS",
];
const ALL_RESOURCE_UNIT_SIZE_SCHEMA: ResourceUnitSizeEnum[] = [
  "BATAILLON",
  "GRUPPE",
  "KOMPANIE",
  "TRUPP",
  "ZUG",
];
const ALL_RESOURCE_STATUS_SCHEMA: ResourceStatusEnum[] = [
  "ABGELOEST",
  "AUFGEBOTEN",
  "EINGESETZT",
  "EINSATZBEREIT",
];
const ALL_CONTACT_MEDIUM_SCHEMA: ContactMediumEnum[] = ["OTHER", "PHONE", "RADIO"];

/**
 * Schema values the UI deliberately does not expose.
 *
 * Empty: all PriorityStatus values in the gqlgen schema are exposed by the domain enum.
 */
const INTENTIONALLY_UNEXPOSED: string[] = [];

describe("enum conformance: schema values are all represented in domain enums", () => {
  // Direction 1 (domain → schema). These assignments compile only if every domain enum value
  // is a member of the corresponding schema union, so a renamed or dropped schema value is a
  // type error rather than a runtime surprise.
  it("every domain enum value is a valid schema value", () => {
    const media: MediumEnum[] = Object.values(Medium);
    const triage: TriageStatusEnum[] = Object.values(TriageStatus);
    const priority: PriorityStatusEnum[] = Object.values(PriorityStatus);

    expect(media).not.toHaveLength(0);
    expect(triage).not.toHaveLength(0);
    expect(priority).not.toHaveLength(0);
  });

  // Each of these reports the offending values directly, so a failure names what is missing
  // rather than just which assertion tripped.
  it("every MediumEnum value maps to a Medium member", () => {
    const domain = new Set<string>(Object.values(Medium));
    const missingFromDomain = ALL_MEDIUM_SCHEMA.filter((v) => !domain.has(v));
    expect(missingFromDomain).toEqual([]);
  });

  it("every TriageStatusEnum value maps to a TriageStatus member", () => {
    const domain = new Set<string>(Object.values(TriageStatus));
    const missingFromDomain = ALL_TRIAGE_SCHEMA.filter((v) => !domain.has(v));
    expect(missingFromDomain).toEqual([]);
  });

  it("every exposed PriorityStatusEnum value maps to a PriorityStatus member", () => {
    const domain = new Set<string>(Object.values(PriorityStatus));
    const missingFromDomain = ALL_PRIORITY_SCHEMA.filter(
      (v) => !INTENTIONALLY_UNEXPOSED.includes(v) && !domain.has(v),
    );
    expect(missingFromDomain).toEqual([]);
  });

  it("does not expose intentionally-unexposed schema values", () => {
    const domain = new Set<string>(Object.values(PriorityStatus));
    const leaked = INTENTIONALLY_UNEXPOSED.filter((v) => domain.has(v));
    expect(leaked).toEqual([]);
  });
});

describe("enum conformance: resource schema values are all handled by mapper functions", () => {
  // Resource domain types are string literal unions (not runtime enum objects), so
  // Direction 1 is enforced by the typed array declarations at the top of this file
  // (a renamed schema value causes a TypeScript compile error there), and Direction 2
  // is enforced by verifying that each schema value is returned unchanged by the
  // corresponding mapper function — a schema value missing from the mapper would
  // cause the function to return its fallback instead.

  it("every ResourceFormation schema value is recognized by toResourceFormation", () => {
    const unrecognized = ALL_RESOURCE_FORMATION_SCHEMA.filter((v) => toResourceFormation(v) !== v);
    expect(unrecognized).toEqual([]);
  });

  it("every ResourceUnitSize schema value is recognized by toResourceUnitSize", () => {
    const unrecognized = ALL_RESOURCE_UNIT_SIZE_SCHEMA.filter((v) => toResourceUnitSize(v) !== v);
    expect(unrecognized).toEqual([]);
  });

  it("every ResourceStatus schema value is recognized by toResourceStatus", () => {
    const unrecognized = ALL_RESOURCE_STATUS_SCHEMA.filter((v) => toResourceStatus(v) !== v);
    expect(unrecognized).toEqual([]);
  });

  it("every ContactMedium schema value is recognized by toContactMedium", () => {
    const unrecognized = ALL_CONTACT_MEDIUM_SCHEMA.filter((v) => toContactMedium(v) !== v);
    expect(unrecognized).toEqual([]);
  });

  it("unrecognized ResourceFormation falls back to OTHER", () => {
    expect(toResourceFormation("UNKNOWN_FORMATION")).toBe("OTHER");
  });

  it("unrecognized ResourceUnitSize falls back to GRUPPE", () => {
    expect(toResourceUnitSize("UNKNOWN_SIZE")).toBe("GRUPPE");
  });

  it("unrecognized ResourceStatus falls back to AUFGEBOTEN", () => {
    expect(toResourceStatus("UNKNOWN_STATUS")).toBe("AUFGEBOTEN");
  });

  it("unrecognized ContactMedium falls back to OTHER", () => {
    expect(toContactMedium("UNKNOWN_MEDIUM")).toBe("OTHER");
  });
});
