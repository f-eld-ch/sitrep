import { describe, expect, it, vi } from "vitest";
import { GET_LAYERS } from "./layer/documents";
import { activeIncidentVar, cache } from "./cache";

describe("activeIncidentVar", () => {
  it("starts empty and holds the incident that is set", () => {
    expect(activeIncidentVar()).toBe("");

    activeIncidentVar("inc-1");
    expect(activeIncidentVar()).toBe("inc-1");

    activeIncidentVar("");
  });
});

describe("cache identity", () => {
  it("identifies an incident access grant by incident, principal kind and principal", () => {
    const id = cache.identify({
      __typename: "IncidentAccessGrant",
      incidentId: "inc-1",
      principalKind: "USER",
      principalId: "u-1",
      role: "OWNER",
      principalName: "Ann",
    });

    expect(id).toBe(
      'IncidentAccessGrant:{"incidentId":"inc-1","principalKind":"USER","principalId":"u-1"}',
    );
  });

  it("gives a principal's grant for another role the same identity", () => {
    const grant = (role: string) =>
      cache.identify({
        __typename: "IncidentAccessGrant",
        incidentId: "inc-1",
        principalKind: "USER",
        principalId: "u-1",
        role,
      });

    expect(grant("VIEWER")).toBe(grant("OWNER"));
  });

  it("identifies a default access grant by principal kind and principal", () => {
    const id = cache.identify({
      __typename: "DefaultAccessGrant",
      principalKind: "GROUP",
      principalId: "g-1",
      role: "VIEWER",
    });

    expect(id).toBe('DefaultAccessGrant:{"principalKind":"GROUP","principalId":"g-1"}');
  });
});

describe("layer features", () => {
  const variables = { incidentId: "inc-1" };
  const feature = (id: string) => ({
    id,
    geometry: { type: "Point", coordinates: [8, 47] },
    properties: {},
    placedAt: null,
  });
  const layers = (featureIds: string[]) => ({
    layersForIncident: [
      {
        __typename: "Layer" as const,
        id: "l-1",
        sourceIncidentId: "inc-1",
        sourceIncidentName: "KFS",
        name: "Lage",
        kind: "STANDARD",
        revision: 1,
        features: featureIds.map(feature),
      },
    ],
  });

  it("replaces the list on a newer answer, without warning about lost data", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    cache.writeQuery({ query: GET_LAYERS, variables, data: layers(["a", "b"]) as never });

    cache.writeQuery({ query: GET_LAYERS, variables, data: layers(["b"]) as never });

    const read = cache.readQuery({ query: GET_LAYERS, variables });
    expect(read?.layersForIncident[0]?.features.map((f) => f.id)).toEqual(["b"]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    cache.reset();
  });
});
