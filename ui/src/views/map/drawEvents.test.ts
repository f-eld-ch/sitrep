import { describe, expect, it, vi } from "vitest";
import { bindDrawEvents, fireDrawEvent, type DrawEventListener } from "./drawEvents";

const fakeMap = () => ({ on: vi.fn(), off: vi.fn(), fire: vi.fn() });

describe("bindDrawEvents", () => {
  const onCreate: DrawEventListener = () => undefined;
  const onDelete: DrawEventListener = () => undefined;

  it.each(["on", "off"] as const)("calls %s once per listener, in order", (mode) => {
    const map = fakeMap();
    const other = mode === "on" ? "off" : "on";

    bindDrawEvents(map, mode, [
      ["draw.create", onCreate],
      ["draw.delete", onDelete],
    ]);

    expect(map[mode].mock.calls).toEqual([
      ["draw.create", onCreate],
      ["draw.delete", onDelete],
    ]);
    expect(map[other]).not.toHaveBeenCalled();
  });

  it("does nothing without listeners", () => {
    const map = fakeMap();

    bindDrawEvents(map, "on", []);

    expect(map.on).not.toHaveBeenCalled();
  });
});

describe("fireDrawEvent", () => {
  it("fires the event with its properties", () => {
    const map = fakeMap();
    const properties = { features: [], action: "featureDetail" };

    fireDrawEvent(map, "draw.update", properties);

    expect(map.fire).toHaveBeenCalledExactlyOnceWith("draw.update", properties);
  });

  it("fires without properties", () => {
    const map = fakeMap();

    fireDrawEvent(map, "draw.selectionchange");

    expect(map.fire).toHaveBeenCalledExactlyOnceWith("draw.selectionchange", undefined);
  });
});
