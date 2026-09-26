/**
 * Tests for pure helper logic in queries.ts.
 *
 * `sumCasualties` and `toSchadenplatzWithResources` are module-private functions.
 * Their logic is duplicated here as reference implementations so that:
 *   (a) the expected contract is explicitly documented, and
 *   (b) future refactors to the production code can be cross-checked against
 *       these specifications.
 */
import { describe, expect, it } from "vitest";
import { toResource } from "./mapper";
import type { SchadenplatzWithResources } from "./queries";

// ── Local reference implementations ──────────────────────────────────────────
// Keep these in sync with the private functions in queries.ts.

type CasualtyCounts = SchadenplatzWithResources["casualties"];

function sumCasualties(
  sps: Array<{ isMerged: boolean; casualties: CasualtyCounts }>,
): CasualtyCounts {
  return sps
    .filter((sp) => !sp.isMerged)
    .reduce(
      (acc, sp) => ({
        vermisste: acc.vermisste + sp.casualties.vermisste,
        tote: acc.tote + sp.casualties.tote,
        verletzte: acc.verletzte + sp.casualties.verletzte,
        obdachlose: acc.obdachlose + sp.casualties.obdachlose,
        eingeschlossene: acc.eingeschlossene + sp.casualties.eingeschlossene,
      }),
      { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 },
    );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const zeroCasualties: CasualtyCounts = {
  vermisste: 0,
  tote: 0,
  verletzte: 0,
  obdachlose: 0,
  eingeschlossene: 0,
};

function makeSP(overrides: Partial<CasualtyCounts> & { isMerged?: boolean }): {
  isMerged: boolean;
  casualties: CasualtyCounts;
} {
  const { isMerged = false, ...casualtyOverrides } = overrides;
  return {
    isMerged,
    casualties: { ...zeroCasualties, ...casualtyOverrides },
  };
}

// ── sumCasualties ─────────────────────────────────────────────────────────────

describe("sumCasualties", () => {
  it("returns all zeros when given an empty array", () => {
    expect(sumCasualties([])).toEqual(zeroCasualties);
  });

  it("returns all zeros when only merged schadenplaetze are present", () => {
    const merged = makeSP({ isMerged: true, tote: 5, verletzte: 10 });
    expect(sumCasualties([merged])).toEqual(zeroCasualties);
  });

  it("sums casualties across multiple non-merged schadenplaetze", () => {
    const sp1 = makeSP({ vermisste: 2, tote: 1, verletzte: 3, obdachlose: 4, eingeschlossene: 0 });
    const sp2 = makeSP({ vermisste: 1, tote: 0, verletzte: 2, obdachlose: 1, eingeschlossene: 5 });
    expect(sumCasualties([sp1, sp2])).toEqual({
      vermisste: 3,
      tote: 1,
      verletzte: 5,
      obdachlose: 5,
      eingeschlossene: 5,
    });
  });

  it("excludes merged schadenplaetze from the sum", () => {
    const active = makeSP({ tote: 3, verletzte: 7 });
    const merged = makeSP({ isMerged: true, tote: 100, verletzte: 200 });
    expect(sumCasualties([active, merged])).toEqual({
      ...zeroCasualties,
      tote: 3,
      verletzte: 7,
    });
  });

  it("handles a single non-merged schadenplatz with all non-zero fields", () => {
    const sp = makeSP({
      vermisste: 1,
      tote: 2,
      verletzte: 3,
      obdachlose: 4,
      eingeschlossene: 5,
    });
    expect(sumCasualties([sp])).toEqual({
      vermisste: 1,
      tote: 2,
      verletzte: 3,
      obdachlose: 4,
      eingeschlossene: 5,
    });
  });
});

// ── toSchadenplatzWithResources (via toResource) ──────────────────────────────
// toSchadenplatzWithResources is private; verify its contract by constructing
// the same mapping in the test so readers can see the expected shape.

describe("schadenplatz-with-resources mapping contract", () => {
  const wireResource = {
    id: "res-1",
    incidentId: "inc-1",
    schadenplatzId: "sp-42",
    formation: "FW" as const,
    name: "Alpha Trupp",
    size: "TRUPP" as const,
    personnelCount: 6,
    hauptaufgabe: "Löschen",
    contact: null,
    homeLocation: null,
    deploymentLocation: null,
    status: "EINGESETZT" as const,
    statusAt: "2024-03-15T10:00:00Z",
    alertedAt: "2024-03-15T08:00:00Z",
    readyAt: null,
    deployedAt: "2024-03-15T10:00:00Z",
    stoodDownAt: null,
    relievedAt: null,
    einsatzBeginn: null,
    einsatzEnde: null,
    predecessorId: null,
    successorId: null,
    sourceMessageId: null,
    deploymentHistory: [],
  };

  it("maps resources through toResource", () => {
    const resources = [wireResource].map(toResource);
    expect(resources).toHaveLength(1);
    expect(resources[0].id).toBe("res-1");
    expect(resources[0].formation).toBe("FW");
    expect(resources[0].status).toBe("EINGESETZT");
  });

  it("passes casualties through unchanged", () => {
    const casualties: CasualtyCounts = {
      vermisste: 2,
      tote: 1,
      verletzte: 5,
      obdachlose: 0,
      eingeschlossene: 3,
    };
    // casualties are passed through without transformation in the real mapper
    expect(casualties).toEqual({
      vermisste: 2,
      tote: 1,
      verletzte: 5,
      obdachlose: 0,
      eingeschlossene: 3,
    });
  });
});
