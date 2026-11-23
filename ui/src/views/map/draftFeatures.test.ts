import type { Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import type { DraftFeature } from "./LayerContext";
import { withPendingFeatures } from "./pending";
import { draftFeaturesReducer } from "./reducer";

const point = (lng: number): Geometry => ({ type: "Point", coordinates: [lng, 47] });

describe("draftFeaturesReducer", () => {
  it("keeps what was changed, merging a later change into it", () => {
    const first = draftFeaturesReducer([], {
      type: "SET_DRAFT_FEATURE",
      payload: { id: "a", properties: { icon: "x" } },
    });
    const second = draftFeaturesReducer(first, {
      type: "SET_DRAFT_FEATURE",
      payload: { id: "a", geometry: point(8) },
    });

    expect(second).toEqual([{ id: "a", properties: { icon: "x" }, geometry: point(8) }]);
  });

  it("replaces the properties of an earlier change, as the form always sends all of them", () => {
    const state = draftFeaturesReducer([{ id: "a", properties: { icon: "x", name: "n" } }], {
      type: "SET_DRAFT_FEATURE",
      payload: { id: "a", properties: { icon: "y" } },
    });
    expect(state).toEqual([{ id: "a", properties: { icon: "y" }, geometry: undefined }]);
  });

  it("drops a draft that was sent", () => {
    const state: DraftFeature[] = [{ id: "a" }, { id: "b" }];
    expect(
      draftFeaturesReducer(state, { type: "CLEAR_DRAFT_FEATURE", payload: { id: "a" } }),
    ).toEqual([{ id: "b" }]);
    // nothing to drop: the same state, so nothing re-renders
    expect(draftFeaturesReducer(state, { type: "CLEAR_DRAFT_FEATURE", payload: { id: "z" } })).toBe(
      state,
    );
  });

  it("drops every draft when the selection is given up", () => {
    expect(
      draftFeaturesReducer([{ id: "a" }], { type: "DESELECT_FEATURE", payload: null }),
    ).toEqual([]);
    const empty: DraftFeature[] = [];
    expect(draftFeaturesReducer(empty, { type: "DESELECT_FEATURE", payload: null })).toBe(empty);
  });

  it("drops the drafts of a feature that is no longer the selected one", () => {
    const state: DraftFeature[] = [{ id: "a" }];
    expect(draftFeaturesReducer(state, { type: "SELECT_FEATURE", payload: { id: "a" } })).toBe(
      state,
    );
    expect(draftFeaturesReducer(state, { type: "SELECT_FEATURE", payload: { id: "b" } })).toEqual(
      [],
    );
  });
});

describe("withPendingFeatures and drafts", () => {
  const layer = {
    id: "l",
    features: [
      { id: "a", geometry: point(1), properties: { icon: "old" }, deletedAt: null },
      { id: "b", geometry: point(2), properties: { icon: "b" }, deletedAt: null },
    ],
  } as never;

  it("shows a saved feature with its drafted changes, and leaves the others alone", () => {
    const { features } = withPendingFeatures(
      layer,
      [],
      [{ id: "a", properties: { icon: "new" }, geometry: point(9) }],
    );

    const a = features.find((f) => f.id === "a");
    const b = features.find((f) => f.id === "b");
    expect(a?.properties).toEqual({ icon: "new" });
    expect(a?.geometry).toEqual(point(9));
    expect(b?.properties).toMatchObject({ icon: "b" });
    expect(b?.geometry).toEqual(point(2));
  });

  it("keeps the saved geometry for a draft of properties only", () => {
    const { features } = withPendingFeatures(layer, [], [{ id: "a", properties: { icon: "new" } }]);
    expect(features.find((f) => f.id === "a")?.geometry).toEqual(point(1));
  });
});
