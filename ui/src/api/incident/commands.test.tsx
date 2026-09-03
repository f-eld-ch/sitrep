import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCreateIncident, useDeleteIncident } from "./commands";

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
}));

async function setupMutation(resolvedValue: unknown) {
  const { useMutation } = await import("@apollo/client/react");
  const mutate = vi.fn().mockResolvedValue(resolvedValue);
  vi.mocked(useMutation).mockReturnValue([
    mutate,
    { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
  ]);

  return mutate;
}

async function setupMutationRejected(rejection: unknown) {
  const { useMutation } = await import("@apollo/client/react");
  vi.mocked(useMutation).mockReturnValue([
    vi.fn().mockRejectedValue(rejection),
    { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
  ]);
}

async function setupCreateMutations() {
  const { useMutation } = await import("@apollo/client/react");
  const mutate = vi.fn().mockResolvedValue({ data: { createIncident: { id: "inc-1" } } });
  const mutateWithParent = vi.fn().mockResolvedValue({
    data: { createIncident: { id: "child-1", parentId: "parent-1" } },
  });

  vi.mocked(useMutation)
    .mockReturnValueOnce([
      mutate,
      { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
    ])
    .mockReturnValueOnce([
      mutateWithParent,
      { loading: false, error: undefined, reset: vi.fn(), called: false } as never,
    ]);

  return { mutate, mutateWithParent };
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

describe("useCreateIncident", () => {
  it("uses the base create mutation without parentId when no parent is selected", async () => {
    const { mutate, mutateWithParent } = await setupCreateMutations();
    const { result } = renderHook(() => useCreateIncident());
    const [createIncident] = result.current;

    await expect(
      createIncident({
        name: "KFS",
        location: "Altdorf",
        divisions: [],
        layerName: "Nachrichtenkarte",
      }),
    ).resolves.toEqual({ incidentId: "inc-1" });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.not.objectContaining({ parentId: expect.anything() }),
      }),
    );
    expect(mutateWithParent).not.toHaveBeenCalled();
  });

  it("sends parentId without refetching projected read models when creating a child incident", async () => {
    const { mutate, mutateWithParent } = await setupCreateMutations();
    const { result } = renderHook(() => useCreateIncident());
    const [createIncident] = result.current;

    await expect(
      createIncident({
        name: "GFS Altdorf",
        parentId: "parent-1",
        location: "Altdorf",
        divisions: [],
        layerName: "Nachrichtenkarte",
      }),
    ).resolves.toEqual({ incidentId: "child-1" });

    expect(mutate).not.toHaveBeenCalled();
    expect(mutateWithParent).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ parentId: "parent-1" }),
      }),
    );
  });
});
