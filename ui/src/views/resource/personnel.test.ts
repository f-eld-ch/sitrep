import { describe, expect, it } from "vitest";
import type { ResourceStatus } from "api";
import { deployedPersonnel } from "./personnel";

const resource = (status: ResourceStatus, personnelCount: number) => ({ status, personnelCount });

describe("deployedPersonnel", () => {
  it("returns 0 for no resources", () => {
    expect(deployedPersonnel([])).toBe(0);
  });

  it("sums personnel of deployed resources only", () => {
    expect(
      deployedPersonnel([
        resource("EINGESETZT", 6),
        resource("EINGESETZT", 4),
        resource("AUFGEBOTEN", 10),
        resource("EINSATZBEREIT", 20),
        resource("ABGELOEST", 30),
      ]),
    ).toBe(10);
  });

  it("returns 0 when nothing is deployed yet", () => {
    expect(deployedPersonnel([resource("AUFGEBOTEN", 5), resource("EINSATZBEREIT", 8)])).toBe(0);
  });
});
