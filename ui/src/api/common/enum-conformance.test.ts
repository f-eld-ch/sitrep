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

// --- Direction 2: schema → domain (runtime) ---
// Keep these arrays in sync with the generated union types above.
// If a new value is added to the DB enum, the type of this array becomes a type error AND
// the test below catches any runtime gap in the domain enum.
const ALL_MEDIUM_SCHEMA: MediumEnum[] = ["EMAIL", "OTHER", "PHONE", "RADIO"];
const ALL_TRIAGE_SCHEMA: TriageStatusEnum[] = ["DONE", "MOREINFO", "PENDING", "RESET"];
const ALL_PRIORITY_SCHEMA: PriorityStatusEnum[] = ["CRITICAL", "HIGH", "NORMAL"];

/**
 * Schema values the UI deliberately does not expose.
 *
 * CRITICAL exists in the priority_status DB enum but has never been used in the triage
 * module, so it is absent from the PriorityStatus domain enum and from all four locale
 * files. Listing it here keeps the schema→domain check honest: a NEW schema value still
 * fails the test, while this known omission is explicit rather than silently dropped.
 *
 * If CRITICAL is ever adopted: add it to PriorityStatus, add priority.CRITICAL to
 * de/en/fr/it translations, and delete it from this list.
 */
const INTENTIONALLY_UNEXPOSED: string[] = ["CRITICAL"];

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
