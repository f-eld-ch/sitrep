import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDeleteIncident } from "./commands";

// Mock useMutation at the module level — this is a unit test of the hook's business logic,
// not an integration test of the Apollo stack.
vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
}));

async function setupMutation(affectedRows: number) {
  const { useMutation } = await import("@apollo/client/react");
  vi.mocked(useMutation).mockReturnValue([
    vi.fn().mockResolvedValue({
      data: {
        updateJournals: { affectedRows: 0, returning: [] },
        updateIncidents: { affectedRows, returning: affectedRows > 0 ? [{ id: "inc-1", deletedAt: "2024-01-01" }] : [] },
      },
    }),
    { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
  ]);
}

describe("useDeleteIncident", () => {
  it("resolves successfully when affectedRows > 0", async () => {
    await setupMutation(1);
    const { result } = renderHook(() => useDeleteIncident());
    const [deleteIncident] = result.current;
    await expect(deleteIncident({ incidentId: "inc-1" })).resolves.toBeUndefined();
  });

  it("throws INCIDENT_NOT_DELETABLE when affectedRows is 0", async () => {
    await setupMutation(0);
    const { result } = renderHook(() => useDeleteIncident());
    const [deleteIncident] = result.current;
    await expect(deleteIncident({ incidentId: "inc-1" })).rejects.toMatchObject({
      code: "INCIDENT_NOT_DELETABLE",
      message: expect.stringContaining("must be closed"),
    });
  });
});
