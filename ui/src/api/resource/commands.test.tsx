import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useAlertResource,
  useChangeHauptaufgabe,
  useReassignResource,
  useUpdateContact,
  useUpdateDeploymentLocation,
  useUpdatePersonnelCount,
} from "./commands";
import { useCreateSchadenplatz } from "../schadenplatz";

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
