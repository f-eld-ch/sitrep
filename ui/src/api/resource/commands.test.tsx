import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useAlertResource,
  useChangeHauptaufgabe,
  useReactivateResource,
  useReassignResource,
  useUpdateContact,
  useUpdateDeploymentLocation,
  useUpdatePersonnelCount,
} from "./commands";
import { useCreateSchadenplatz } from "../schadenplatz";

vi.mock("@apollo/client/react", () => ({
  useMutation: vi.fn(),
  useApolloClient: vi.fn(() => ({
    cache: { readFragment: vi.fn(() => null), identify: vi.fn(() => "") },
  })),
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

const messageTime = new Date("2026-01-15T10:00:00.000Z");

describe("useAlertResource", () => {
  it("passes occurredAt as ISO string when provided", async () => {
    const mutate = await setupMutation({
      data: {
        alertResource: {
          id: "res-1",
          incidentId: "inc-1",
          schadenplatzId: "sp-1",
          formation: "FW",
          name: "Test",
          size: "TRUPP",
          personnelCount: 2,
          hauptaufgabe: "",
          contact: null,
          homeLocation: null,
          deploymentLocation: null,
          status: "AUFGEBOTEN",
          statusAt: messageTime.toISOString(),
          alertedAt: messageTime.toISOString(),
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
        },
      },
    });

    const { result } = renderHook(() => useAlertResource());
    const [alertResource] = result.current;

    await alertResource({
      incidentId: "inc-1",
      formation: "FW" as never,
      name: "Test",
      size: "TRUPP" as never,
      personnelCount: 2,
      hauptaufgabe: "",
      occurredAt: messageTime,
    });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: expect.objectContaining({
            occurredAt: messageTime.toISOString(),
          }),
        }),
      }),
    );
  });

  it("sends null occurredAt when not provided", async () => {
    const mutate = await setupMutation({
      data: {
        alertResource: {
          id: "res-1",
          incidentId: "inc-1",
          schadenplatzId: "sp-1",
          formation: "FW",
          name: "Test",
          size: "TRUPP",
          personnelCount: 2,
          hauptaufgabe: "",
          contact: null,
          homeLocation: null,
          deploymentLocation: null,
          status: "AUFGEBOTEN",
          statusAt: messageTime.toISOString(),
          alertedAt: messageTime.toISOString(),
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
        },
      },
    });

    const { result } = renderHook(() => useAlertResource());
    const [alertResource] = result.current;

    await alertResource({
      incidentId: "inc-1",
      formation: "FW" as never,
      name: "Test",
      size: "TRUPP" as never,
      personnelCount: 2,
      hauptaufgabe: "",
    });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: expect.objectContaining({ occurredAt: null }),
        }),
      }),
    );
  });
});

describe("useChangeHauptaufgabe", () => {
  it("passes at as ISO string when provided", async () => {
    const mutate = await setupMutation({ data: { changeHauptaufgabe: { id: "res-1" } } });
    const { result } = renderHook(() => useChangeHauptaufgabe());
    const [changeHauptaufgabe] = result.current;

    await changeHauptaufgabe({ id: "res-1", hauptaufgabe: "Evakuierung", at: messageTime });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ at: messageTime.toISOString() }),
      }),
    );
  });

  it("sends null at when not provided", async () => {
    const mutate = await setupMutation({ data: { changeHauptaufgabe: { id: "res-1" } } });
    const { result } = renderHook(() => useChangeHauptaufgabe());
    const [changeHauptaufgabe] = result.current;

    await changeHauptaufgabe({ id: "res-1", hauptaufgabe: "Evakuierung" });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ variables: expect.objectContaining({ at: null }) }),
    );
  });
});

describe("useUpdatePersonnelCount", () => {
  it("passes at as ISO string when provided", async () => {
    const mutate = await setupMutation({ data: { updatePersonnelCount: { id: "res-1" } } });
    const { result } = renderHook(() => useUpdatePersonnelCount());
    const [updatePersonnelCount] = result.current;

    await updatePersonnelCount({ id: "res-1", count: 12, at: messageTime });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ at: messageTime.toISOString() }),
      }),
    );
  });
});

describe("useReassignResource", () => {
  it("passes at as ISO string when provided", async () => {
    const mutate = await setupMutation({ data: { reassignResource: { id: "res-1" } } });
    const { result } = renderHook(() => useReassignResource());
    const [reassign] = result.current;

    await reassign({ id: "res-1", schadenplatzId: "sp-2", at: messageTime });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ at: messageTime.toISOString() }),
      }),
    );
  });
});

describe("useUpdateDeploymentLocation", () => {
  it("passes at as ISO string when provided", async () => {
    const mutate = await setupMutation({ data: { updateDeploymentLocation: { id: "res-1" } } });
    const { result } = renderHook(() => useUpdateDeploymentLocation());
    const [updateLocation] = result.current;

    await updateLocation({ id: "res-1", label: "Nordzugang", at: messageTime });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ at: messageTime.toISOString() }),
      }),
    );
  });
});

describe("useUpdateContact", () => {
  it("passes at as ISO string when provided", async () => {
    const mutate = await setupMutation({ data: { updateContact: { id: "res-1" } } });
    const { result } = renderHook(() => useUpdateContact());
    const [updateContact] = result.current;

    await updateContact({
      id: "res-1",
      medium: "RADIO" as never,
      detail: "CH-3",
      at: messageTime,
    });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ at: messageTime.toISOString() }),
      }),
    );
  });
});

describe("useReactivateResource", () => {
  const day1 = "2026-01-15T08:00:00.000Z";
  const day2 = new Date("2026-01-16T07:00:00.000Z");
  const relieved = {
    __typename: "Resource",
    id: "res-1",
    incidentId: "inc-1",
    schadenplatzId: "sp-named",
    formation: "FW",
    name: "Gruppe Alpha",
    size: "GRUPPE",
    personnelCount: 9,
    hauptaufgabe: "Löschangriff",
    contact: null,
    homeLocation: null,
    deploymentLocation: { lat: null, lng: null, label: "Brücke" },
    status: "ABGELOEST",
    statusAt: day1,
    alertedAt: day1,
    readyAt: day1,
    deployedAt: day1,
    stoodDownAt: null,
    relievedAt: day1,
    einsatzBeginn: day1,
    einsatzEnde: day1,
    predecessorId: null,
    successorId: "res-2",
    sourceMessageId: null,
    deploymentHistory: [{ startedAt: day1, endedAt: day1 }],
  };

  it("passes at as ISO string when provided", async () => {
    const mutate = await setupMutation({ data: {} });

    const { result } = renderHook(() => useReactivateResource());
    await result.current[0]({ id: "res-1", at: day2 });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { id: "res-1", at: day2.toISOString() } }),
    );
  });

  it("optimistically resets the cycle on the default Schadenplatz and keeps the history", async () => {
    const mutate = await setupMutation({ data: {} });
    const { useApolloClient } = await import("@apollo/client/react");
    vi.mocked(useApolloClient).mockReturnValue({
      cache: {
        readFragment: vi.fn(() => relieved),
        identify: vi.fn(() => "Resource:res-1"),
        readQuery: vi.fn(() => ({
          incident: { schadenplaetze: [{ id: "sp-default", isDefault: true }] },
        })),
      },
    } as never);

    const { result } = renderHook(() => useReactivateResource());
    await result.current[0]({ id: "res-1", at: day2 });

    // Restore the default client mock for the tests that follow.
    vi.mocked(useApolloClient).mockReturnValue({
      cache: { readFragment: vi.fn(() => null), identify: vi.fn(() => "") },
    } as never);

    const { optimisticResponse } = mutate.mock.calls[0][0] as {
      optimisticResponse: { reactivateResource: Record<string, unknown> };
    };
    expect(optimisticResponse.reactivateResource).toMatchObject({
      id: "res-1",
      status: "AUFGEBOTEN",
      schadenplatzId: "sp-default",
      statusAt: day2.toISOString(),
      alertedAt: day2.toISOString(),
      readyAt: null,
      relievedAt: null,
      einsatzBeginn: null,
      einsatzEnde: null,
      successorId: null,
      hauptaufgabe: "",
      deploymentLocation: null,
      deploymentHistory: relieved.deploymentHistory,
    });
  });
});

describe("useReactivateResource cache update", () => {
  it("puts the resource on its new Schadenplatz exactly once and removes it from the others", async () => {
    const mutate = await setupMutation({ data: {} });

    const { result } = renderHook(() => useReactivateResource());
    await result.current[0]({ id: "res-1" });

    const { update } = mutate.mock.calls[0][0] as {
      update: (cache: unknown, result: { data: unknown }) => void;
    };

    const reactivated = {
      __typename: "Resource",
      id: "res-1",
      incidentId: "inc-1",
      schadenplatzId: "sp-default",
    };
    const other = {
      __typename: "Resource",
      id: "res-2",
      incidentId: "inc-1",
      schadenplatzId: "sp-default",
    };
    const cache = {
      identify: vi.fn(() => "Resource:res-1"),
      writeFragment: vi.fn(),
      writeQuery: vi.fn(),
      readQuery: vi.fn(() => ({
        incident: {
          id: "inc-1",
          schadenplaetze: [
            { id: "sp-default", isDefault: true, resources: [other] },
            // A stale entry on another Schadenplatz must not survive the move.
            {
              id: "sp-named",
              isDefault: false,
              resources: [{ ...reactivated, schadenplatzId: "sp-named" }],
            },
          ],
        },
      })),
    };

    update(cache, { data: { reactivateResource: reactivated } });

    expect(cache.writeFragment).toHaveBeenCalledWith(
      expect.objectContaining({ data: reactivated }),
    );
    const written = cache.writeQuery.mock.calls[0][0] as {
      data: { incident: { schadenplaetze: { id: string; resources: { id: string }[] }[] } };
    };
    const byId = Object.fromEntries(
      written.data.incident.schadenplaetze.map((sp) => [sp.id, sp.resources.map((r) => r.id)]),
    );
    expect(byId).toEqual({ "sp-default": ["res-2", "res-1"], "sp-named": [] });
  });

  it("does nothing when the mutation returned no data", async () => {
    const mutate = await setupMutation({ data: {} });

    const { result } = renderHook(() => useReactivateResource());
    await result.current[0]({ id: "res-1" });

    const { update } = mutate.mock.calls[0][0] as {
      update: (cache: unknown, result: { data: unknown }) => void;
    };
    const cache = {
      identify: vi.fn(),
      writeFragment: vi.fn(),
      writeQuery: vi.fn(),
      readQuery: vi.fn(),
    };

    update(cache, { data: undefined });

    expect(cache.writeFragment).not.toHaveBeenCalled();
    expect(cache.writeQuery).not.toHaveBeenCalled();
  });
});

describe("useCreateSchadenplatz", () => {
  it("passes occurredAt as ISO string when provided", async () => {
    const mutate = await setupMutation({
      data: {
        createSchadenplatz: {
          __typename: "Schadenplatz",
          id: "sp-1",
          incidentId: "inc-1",
          name: "Sektor A",
          isDefault: false,
          isMerged: false,
          mergedInto: null,
          casualties: { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 },
        },
      },
    });
    const { result } = renderHook(() => useCreateSchadenplatz());
    const [createSchadenplatz] = result.current;

    await createSchadenplatz({ incidentId: "inc-1", name: "Sektor A", occurredAt: messageTime });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ occurredAt: messageTime.toISOString() }),
      }),
    );
  });

  it("sends null occurredAt when not provided", async () => {
    const mutate = await setupMutation({
      data: {
        createSchadenplatz: {
          __typename: "Schadenplatz",
          id: "sp-1",
          incidentId: "inc-1",
          name: "Sektor A",
          isDefault: false,
          isMerged: false,
          mergedInto: null,
          casualties: { vermisste: 0, tote: 0, verletzte: 0, obdachlose: 0, eingeschlossene: 0 },
        },
      },
    });
    const { result } = renderHook(() => useCreateSchadenplatz());
    const [createSchadenplatz] = result.current;

    await createSchadenplatz({ incidentId: "inc-1", name: "Sektor A" });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ occurredAt: null }),
      }),
    );
  });
});
