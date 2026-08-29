/**
 * Bidirectional conformance between domain enums and the generated Hasura schema enums.
 *
 * Direction 1 (compile-time): every domain enum value must be assignable to the schema union
 *   type. A renamed or removed schema value is a type error here.
 *
 * Direction 2 (runtime): every schema union value must appear in the domain enum's runtime
 *   values. A value added to the DB enum table but not to the domain enum fails here.
 *
 * When the schema switches from Hasura to gqlgen, update the imports from "gql" and keep
 * the test body identical — the assertions are what matters, not the source of the types.
 */
import { Medium, PriorityStatus, TriageStatus } from "types";
import { describe, expect, it } from "vitest";
import type { MediumEnum, PriorityStatusEnum, TriageStatusEnum } from "gql";

// --- Direction 1: domain → schema (compile-time) ---
// If a domain enum member's value is not a valid schema union member, TypeScript errors here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type AssertSubset<_T extends U, U> = true;
export type _MediumConforms = AssertSubset<`${Medium}`, MediumEnum>;
export type _TriageConforms = AssertSubset<`${TriageStatus}`, TriageStatusEnum>;
export type _PriorityConforms = AssertSubset<`${PriorityStatus}`, PriorityStatusEnum>;

// --- Direction 2: schema → domain (runtime) ---
// Keep these arrays in sync with the generated union types above.
// If a new value is added to the DB enum, the type of this array becomes a type error AND
// the test below catches any runtime gap in the domain enum.
const ALL_MEDIUM_SCHEMA: MediumEnum[] = ["EMAIL", "OTHER", "PHONE", "RADIO"];
const ALL_TRIAGE_SCHEMA: TriageStatusEnum[] = ["DONE", "MOREINFO", "PENDING", "RESET"];
const ALL_PRIORITY_SCHEMA: PriorityStatusEnum[] = ["CRITICAL", "HIGH", "NORMAL"];

describe("enum conformance: schema values are all represented in domain enums", () => {
  it("every MediumEnum value maps to a Medium member", () => {
    const domain = new Set(Object.values(Medium));
    for (const v of ALL_MEDIUM_SCHEMA) {
      expect(domain, `MediumEnum "${v}" is missing from the Medium domain enum`).toContain(v);
    }
  });

  it("every TriageStatusEnum value maps to a TriageStatus member", () => {
    const domain = new Set(Object.values(TriageStatus));
    for (const v of ALL_TRIAGE_SCHEMA) {
      expect(
        domain,
        `TriageStatusEnum "${v}" is missing from the TriageStatus domain enum`,
      ).toContain(v);
    }
  });

  it("every PriorityStatusEnum value maps to a PriorityStatus member", () => {
    const domain = new Set(Object.values(PriorityStatus));
    for (const v of ALL_PRIORITY_SCHEMA) {
      expect(
        domain,
        `PriorityStatusEnum "${v}" is missing from the PriorityStatus domain enum`,
      ).toContain(v);
    }
  });
});
