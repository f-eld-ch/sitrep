import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDeleteIncident } from "./commands";

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
}));

async function setupMutation(resolvedValue: unknown) {
  const { useMutation } = await import("@apollo/client/react");
  vi.mocked(useMutation).mockReturnValue([
    vi.fn().mockResolvedValue(resolvedValue),
    { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
  ]);
}

async function setupMutationRejected(rejection: unknown) {
  const { useMutation } = await import("@apollo/client/react");
  vi.mocked(useMutation).mockReturnValue([
    vi.fn().mockRejectedValue(rejection),
    { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
  ]);
}

describe("useDeleteIncident", () => {
  it("resolves successfully when mutation succeeds", async () => {
    await setupMutation({ data: { deleteIncident: "inc-1" } });
    const { result } = renderHook(() => useDeleteIncident());
    const [deleteIncident] = result.current;
    await expect(deleteIncident({ incidentId: "inc-1" })).resolves.toBeUndefined();
  });

  it("throws when the mutation rejects (e.g. incident not closed)", async () => {
    const gqlError = Object.assign(new Error("incident must be closed before deletion"), {
      graphQLErrors: [{ extensions: { code: "INCIDENT_NOT_CLOSED" } }],
    });
    await setupMutationRejected(gqlError);
    const { result } = renderHook(() => useDeleteIncident());
    const [deleteIncident] = result.current;
    await expect(deleteIncident({ incidentId: "inc-1" })).rejects.toThrow(
      "incident must be closed before deletion",
    );
  });
});
