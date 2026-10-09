import { describe, expect, it } from "vitest";
import { featureChangeVariable, layersVariables } from "./variables";

describe("layersVariables", () => {
  it("is the incident alone for the live map", () => {
    expect(layersVariables("inc-1")).toEqual({ incidentId: "inc-1" });
  });

  it("adds the point in time as an ISO string", () => {
    expect(layersVariables("inc-1", new Date("2026-01-15T10:00:00.000Z"))).toEqual({
      incidentId: "inc-1",
      asOf: "2026-01-15T10:00:00.000Z",
    });
  });
});

describe("featureChangeVariable", () => {
  it("is undefined when the change takes effect now", () => {
    expect(featureChangeVariable()).toBeUndefined();
    expect(featureChangeVariable({})).toBeUndefined();
  });

  it("sends the message a change is drawn for", () => {
    expect(featureChangeVariable({ messageId: "msg-1" })).toEqual({ messageId: "msg-1" });
  });

  it("sends an explicit effective time as an ISO string", () => {
    expect(featureChangeVariable({ effectiveAt: new Date("2026-01-15T10:00:00.000Z") })).toEqual({
      effectiveAt: "2026-01-15T10:00:00.000Z",
    });
  });
});
